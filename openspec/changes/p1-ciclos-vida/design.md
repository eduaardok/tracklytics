# Diseño técnico — p1-ciclos-vida

## Contexto

Extensión transversal de ciclo de vida sobre nueve grupos de entidades ya existentes. No se crean paquetes ni capabilities nuevas. Toda acción administrativa se autoriza con el rol de área de `roles-gestion-usuarios` (`require_rol_admin`) y se audita en `FACT_AUDIT_LOG`. Todo movimiento de datos ocurre desde Python (RT-01).

## Decisión 1 — Doble estado de una campaña publicitaria

`DIM_CAMPANA_PUBLICITARIA` ya tiene `activa UInt8` (elegibilidad **por presupuesto**: la campaña deja de servirse cuando se agota el presupuesto) y `tipo_anuncio Enum8('audio','display')` (canal de servido). La pausa manual es un eje **independiente** del presupuesto: un admin puede pausar una campaña con presupuesto disponible, y reanudarla después.

- Se añade `estado_manual String DEFAULT ''` con valores `''` (operativa), `'pausada'` (pausa manual) y `'finalizada'` (cierre definitivo, irreversible).
- **Elegibilidad de servido** = `activa = 1` **y** `estado_manual = ''`. Así se distingue una campaña sin presupuesto (`activa=0`) de una pausada a mano (`estado_manual='pausada'`) de una cerrada (`estado_manual='finalizada'`), sin colapsar los tres casos en un solo flag.
- `finalizar` es terminal: una campaña finalizada no se puede reanudar (se rechaza con 409).

## Decisión 2 — `formato` vs. `tipo_anuncio`

El scope pide un campo editable `formato` con valores `audio | display | banner`. Ya existe `tipo_anuncio Enum8('audio','display')`, que **gobierna qué trigger de servido** elige la campaña (`/impresion` audio vs `/impresion-display`). Para no romper el servido existente:

- `tipo_anuncio` se mantiene como el eje técnico de servido (no se toca su semántica).
- Se añade `formato String DEFAULT 'display'` como atributo **descriptivo/comercial** editable, retro-rellenado desde `tipo_anuncio` de las campañas existentes.
- Al editar `formato`, si el valor es `audio` o `display` se sincroniza `tipo_anuncio`; `banner` se sirve como `display` (mismo trigger). Se documenta en la spec para evitar que un futuro lector los confunda.

## Decisión 3 — Takedown de catálogo con `disponible`

Se añade `FACT_TRACKS.disponible UInt8 DEFAULT 1`. Un takedown hace `ALTER TABLE ... UPDATE disponible = 0 WHERE fact_id = ...` (mutación, no DELETE: el track sigue existiendo para históricos e integridad referencial). Todas las lecturas públicas de catálogo (`/tracks`, `/tracks/search`, `/tracks/top`, detalle, by-artist/album/genre) filtran `disponible = 1`. El retiro de un track de artista (`creadores`) reutiliza exactamente el mismo mecanismo sobre `FACT_TRACKS`.

`FACT_TRACKS` no es MergeTree con `disponible` en la ORDER KEY, así que la mutación `ALTER UPDATE` es válida (no cae en `CANNOT_UPDATE_COLUMN`).

## Decisión 4 — Partners viven en PocketBase, no en ClickHouse; API key hasheada

Inspección previa: los partners **ya existen únicamente en la colección `partners` de PocketBase** (ver `partners/pb_client.py`), no en ClickHouse. `DIM_PARTNER` del modelo de negocio está cubierta por esa colección. Por tanto el CRUD administrativo opera sobre PocketBase vía `pb_client` con token de superusuario (RT-01: escritura desde Python), **no** crea una tabla en ClickHouse.

- **Almacenamiento de la llave**: hoy `find_by_api_key` filtra `api_key="<claro>"` (texto plano). Se migra a `api_key_hash` (SHA-256 hex). La autenticación (`require_partner`) hashea la llave recibida por header y busca por `api_key_hash`. La llave en claro solo se devuelve **una vez**, en el momento de crear o rotar; nunca se puede recuperar después.
- **Tiers**: se conservan los valores ya en uso en el código (`basico | pro | enterprise`), no los del scope en inglés (`basic | professional | enterprise`), para no romper `TIER_RANK` ni el gating por tier ya desplegado. Se documenta el mapeo en la spec.

## Decisión 4b — Reconciliación del modelo de contratos de regalías

El scope habla de `porcentaje_artista` / `porcentaje_sello` / `fecha_fin`, pero el modelo real (`DIM_CONTRATO_REGALIA`) es más rico: splits `pct_master_{sello,artista,productor}` + `pct_publishing_{sello,artista}` + `vigente_hasta` + `activo`. El PUT acepta los campos granulares reales (opcionales) y **fusiona** los enviados con los actuales, revalidando la invariante de creación (cada split suma 100), en vez de la regla laxa "≤ 100" del scope — es más fuerte y mantiene consistencia con `crear_contrato` y con la fórmula de liquidación. La **terminación** no añade una columna `estado` nueva (no está en la lista de tablas del scope): usa `activo = 0` + `vigente_hasta = today()`; un contrato con `activo = 0` es un contrato terminado (las queries de liquidación ya filtran `activo = 1`, así que no vuelve a liquidarse). El estado `'terminado'` se expone en la respuesta, derivado de `activo`.

## Decisión 7 — Finanzas: el reporte consolidado ya existe

El scope pide `GET /admin/reporte` en `finanzas`. El endpoint `GET /reporte` (mont. `/app/v1/finanzas/reporte`, bajo `admin_finanzas`) **ya existe** y devuelve ingresos (suscripciones + publicitario), gastos, regalías, reembolsos, cuentas por cobrar/pagar, utilidad e indicadores por período. No se añade un endpoint duplicado; se reutiliza el existente (mismo criterio que "si ya lo hace, no hay nada que hacer" del scope para `FACT_CANCELACION_SUSCRIPCION`).
- **Desactivar** pone `estado = 'inactivo'`; `require_partner` ya rechaza cualquier partner cuyo `estado != 'vigente'`, así que la llave deja de funcionar de inmediato (modulo el caché TTL de 30 s ya existente).
- **Rotar** genera una nueva llave (UUID4 sin guiones, 32 chars — cumple `_API_KEY_RE`), guarda su hash y descarta el anterior.

## Decisión 5 — Denuncias de contenido

Nueva tabla `FACT_DENUNCIA` (ReplacingMergeTree ORDER BY denuncia_id). El usuario B2C denuncia un `comentario` o un `track` con motivo tipificado. El admin (`admin_comunidad`) lista y resuelve. No se implementa bloqueo usuario-a-usuario ni strikes (P2). La denuncia no ejecuta acción automática sobre el objeto: solo alimenta la bandeja de moderación, que ya puede ocultar comentarios/tracks con los mecanismos existentes.

## Decisión 6 — Edición de track de artista vuelve a revisión

Al editar un track `aprobado`, vuelve a `pendiente` (revisión editorial), consistente con el flujo de aprobación existente de `creadores`. Un track `pendiente` editado sigue `pendiente`. Retirar pone `estado = 'retirado'` en `FACT_SUBIDA_TRACK` y `disponible = 0` en `FACT_TRACKS` (si el track ya tenía fila publicada).

## Autorización por grupo

| Grupo | Rol |
|---|---|
| publicidad, regalías, finanzas | `admin_finanzas` |
| distribución, catálogo | `admin_contenido` |
| creadores (edición/retiro) | `require_cuenta_artista_aprobada` (dueño) |
| partners, suscripciones | `admin_comercial` |
| denuncias (crear) | `require_b2c_user` |
| denuncias (moderar) | `admin_comunidad` |
