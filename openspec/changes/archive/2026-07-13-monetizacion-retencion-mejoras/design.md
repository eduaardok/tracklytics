## Context

Las tres capabilities existen y funcionan; este change las amplía sin tocar su arquitectura de
base. Estado actual relevante:

- `publicidad` (ClickHouse): `DIM_ANUNCIANTE`, `DIM_CAMPANA_PUBLICITARIA`, `FACT_IMPRESION_ANUNCIO`,
  `FACT_INGRESO_PUBLICITARIO`. El backend (`api/paquetes/publicidad/router.py`) inserta
  directamente en estas tablas desde FastAPI (no vía ETL) — es el patrón ya establecido para
  hechos operativos de alta frecuencia y bajo volumen por evento (una impresión, un ingreso).
- `suscripciones`: la suscripción vive en **PocketBase** (colección `suscripciones`,
  `pb_init.py`), no en ClickHouse — decisión ya tomada y documentada en el design.md del change
  original (`openspec/changes/archive/2026-06-21-suscripciones/design.md`): requiere mutaciones
  frecuentes de bajo volumen por usuario (activar/cancelar), aptas para reglas de acceso por
  registro de PocketBase, no para el patrón append-only de ClickHouse. `DIM_PLAN_SUSCRIPCION` y
  `FACT_SUSCRIPCION` en ClickHouse **no existen todavía** en el esquema desplegado (confirmado en
  `init_clickhouse.py`) — los planes están hardcodeados en `api/paquetes/suscripciones/planes.py`
  (`PLANES_B2C`, `PLANES_B2B`), no en una tabla. `analitica` ya documenta esto explícitamente en
  su reporte diario (`v1_reporte_diario`, `api/paquetes/analitica/router.py`): "Pendiente táctico
  ... requiere el ETL de suscripciones PocketBase → ClickHouse".
- `analitica`: paneles B2B expuestos bajo `/app/v1/analitica/*`, gateados por
  `require_b2b_panel_access` (admin o analyst con suscripción activa) o `require_staff` (solo
  admin, usado hoy por `/reporte-diario`). El frontend tiene una ruta placeholder
  `/analitica/suscripciones` (`ComingSoonPage`) reservada para "métricas de planes activos,
  conversiones B2C/B2B y retención por cohorte" — este change la ocupa con el dashboard de churn.

## Goals / Non-Goals

**Goals:**
- Ampliar `publicidad` para soportar anuncios display sin duplicar el modelo de campaña.
- Registrar el motivo de cada cancelación de suscripción como hecho auditable en ClickHouse,
  consumible por `analitica`, sin mover la suscripción operativa fuera de PocketBase.
- Introducir trial gratuito y plan estudiante como extensiones del flujo de confirmación de
  suscripción ya existente, reutilizando `facturacion.procesar_pago` para el cobro (inmediato o
  diferido).
- Dar a `analitica` tres vistas nuevas (churn, funnel, P&L) construidas sobre tablas ya
  existentes más la única tabla nueva de este change (`FACT_CANCELACION_SUSCRIPCION`).

**Non-Goals:**
- No se crea `FACT_SUSCRIPCION`/`DIM_PLAN_SUSCRIPCION` en ClickHouse ni se construye el ETL
  PocketBase → ClickHouse para suscripciones — sigue fuera de alcance, igual que antes de este
  change.
- No se implementa un cron/scheduler real para expirar trials; se simula en el punto de acceso
  siguiente, igual que el resto de "pendientes tácticos" ya documentados en el proyecto.
- No se reconstruye el historial completo de cancelaciones previas a este change (ver Riesgo de
  churn más abajo).
- No se toca el reproductor de audio, `AdContext` (trigger de audio ya existente) ni la
  resolución de covers.

## Decisions

### 1. Tipo de anuncio: una columna en `DIM_CAMPANA_PUBLICITARIA`, no una tabla nueva

`tipo_anuncio Enum8('audio'=1, 'display'=2)` y `url_destino String DEFAULT ''` se agregan a
`DIM_CAMPANA_PUBLICITARIA`; `click UInt8 DEFAULT 0` se agrega a `FACT_IMPRESION_ANUNCIO`. Una
campaña sigue siendo una sola fila con un solo CPM — el tipo decide qué trigger la consume y qué
columnas aplican (`url_destino`/`click` solo tienen sentido para `display`, quedan en su default
para `audio`). Alternativa descartada: una tabla `DIM_CAMPANA_DISPLAY` separada — se rechaza
porque duplicaría anunciante/CPM/vigencia sin necesidad; el negocio real modela esto como un
atributo de la campaña, no como una entidad distinta.

`CAMPANAS_ELEGIBLES` (queries.py) se parametriza por `tipo_anuncio` en vez de duplicarse:
`CAMPANAS_ELEGIBLES_SQL = "... WHERE activa=1 AND tipo_anuncio={tipo:String} AND ..."` reemplaza
al `CAMPANAS_ELEGIBLES` fijo actual, reutilizada tanto por `POST /publicidad/impresion` (trigger
de audio, `tipo='audio'`) como por el nuevo `POST /publicidad/impresion-display` (`tipo='display'`).

### 2. Trigger de display: endpoint nuevo, no una variante del existente

`POST /publicidad/impresion` (audio) se llama desde el reproductor con una promesa bloqueante
(`AdContext.pedirImpresion`); el display necesita el comportamiento opuesto — no bloqueante, se
resuelve al montar la pantalla y no impide que se vea el contenido. Se agrega
`POST /publicidad/impresion-display`, misma forma de respuesta (`campana`/`impresion_id`) más
`url_destino` en el payload de campaña, y `POST /publicidad/impresion/{id}/click` que marca
`click=1` (reusa el mismo criterio de idempotencia que `completar_impresion`: si ya hay
`FACT_INGRESO_PUBLICITARIO` para esa impresión, no se duplica el ingreso). El click en display
dispara el mismo reconocimiento de ingreso que hoy dispara "completado" en audio — se modela como
`completado=1` al hacer click (reutilizando `completar_impresion` sin cambios), con `click=1`
como metadato adicional específico de display.

Alternativa descartada: reutilizar `POST /publicidad/impresion` con un parámetro de tipo — se
rechaza porque el llamador (audio: `AdContext`, bloqueante; display: banner, no bloqueante) y el
criterio de "completado" (temporizador vs. click) son distintos; forzar una sola función con
ramas por tipo sería más difícil de leer que dos endpoints delgados que comparten queries.

### 3. Frontend: `AdBanner` en `AppShell`, no un componente por página

El banner display se monta una sola vez en `frontend/src/app/layout/AppShell.tsx` (el shell que
envuelve catálogo, home, biblioteca, etc. — confirmado como el layout compartido de todas las
rutas B2C), junto al sidebar, condicionado a `usePlanActivo().tipoPlan === 'free'` (mismo hook ya
usado por `TrackDetailPage` para paywall). Pide una impresión display al montar el shell (una vez
por sesión de navegación, no por cada cambio de ruta) y renderiza imagen/texto + link a
`url_destino`, registrando el click vía la API. Alternativa descartada: banner por página
(CatalogPage, home) — se rechaza porque duplicaría el fetch de impresión en cada ruta sin
necesidad; el requisito solo pide visibilidad en catálogo/home, y el sidebar del shell ya está
presente en ambas.

### 4. `FACT_CANCELACION_SUSCRIPCION`: tabla nueva en ClickHouse, escrita síncronamente desde FastAPI

Igual que `FACT_IMPRESION_ANUNCIO`/`FACT_INGRESO_PUBLICITARIO` en `publicidad`, esta tabla se
escribe directo desde el endpoint de cancelación (`POST /suscripciones/{id}/cancelar`) en el
mismo request, no vía el pipeline ETL — es un hecho de negocio de bajo volumen por evento (una
cancelación), no un lote de datos del catálogo. `suscripcion_id`/`usuario_id` son `String`
(mismo tipo que usa `FACT_TRANSACCION_PAGO.suscripcion_id` hoy para referenciar IDs de
PocketBase — no hay JOIN SQL posible entre ClickHouse y PocketBase, igual que ya asume
`facturacion._nombre_plan_por_monto`).

La cancelación en sí (cambio de `estado` en PocketBase) y el registro del motivo (insert en
ClickHouse) ocurren en la misma función de router, no en una transacción distribuida — si el
insert a ClickHouse fallara después de cancelar en PocketBase, la suscripción queda cancelada sin
motivo registrado (se degrada a `motivo='otro'` implícito por ausencia de fila, no bloquea la
cancelación). Alternativa descartada: bloquear la cancelación si falla el insert de auditoría —
se rechaza porque el usuario no debe quedar con una suscripción activa que ya no quiere solo
porque falló un insert analítico.

### 5. Churn: `activas al inicio del período` se aproxima con altas (PocketBase) menos bajas (ClickHouse), no con un snapshot histórico

No existe un snapshot histórico del estado de cada suscripción en el tiempo (PocketBase solo
guarda el `created` de alta y el `estado` actual; no había `updated`/fecha de cancelación antes
de este change). El endpoint `GET /analitica/churn` calcula, por mes `M` en el rango:

- `cancelaciones(M)` = `count(*) FROM FACT_CANCELACION_SUSCRIPCION WHERE toStartOfMonth(fecha) = M` (agrupable por `motivo`).
- `activas_al_inicio(M)` = `altas_antes_de(M)` (PocketBase: registros `suscripciones` con
  `created < M`, cualquier `tipo_plan` de pago) `− bajas_antes_de(M)` (ClickHouse:
  `count(*) FROM FACT_CANCELACION_SUSCRIPCION WHERE fecha < M`).
- `tasa_churn(M) = cancelaciones(M) / activas_al_inicio(M)` (si el denominador es 0, se reporta
  `null`, no una división por cero).

Esta aproximación es exacta desde el momento en que se despliega este change en adelante, porque
solo entonces empieza a existir `FACT_CANCELACION_SUSCRIPCION`. Meses anteriores al despliegue
sobreestiman `activas_al_inicio` (las cancelaciones que ya habían ocurrido antes de este change
no se pueden restar retroactivamente, no dejaron rastro con fecha). Se documenta como riesgo
aceptado, no se reconstruye con un backfill — no hay dato fuente para hacerlo con precisión.

### 6. Trial y plan estudiante: campos en la colección PocketBase `suscripciones`, plan estudiante en `planes.py`

Se agregan a la colección `suscripciones` (`pb_init.py`): `en_prueba` (bool, default `false`),
`fecha_fin_trial` (date, nullable) y `metodo_pago_id` (text, nullable) — este último no existía
porque hasta ahora el cobro ocurría una sola vez en el mismo request de confirmación; el trial
necesita recordar qué método de pago cobrar automáticamente al expirar, sin volver a pedirlo.
Ambos campos son operativos (mutan con el ciclo de vida de la suscripción), consistente con por
qué la suscripción entera ya vive en PocketBase y no en ClickHouse.

`estudiante` se agrega como una entrada más en `PLANES_B2C` (`planes.py`), mismo mecanismo que
`free`/`premium` — no requiere una colección ni tabla nueva porque los planes ya son datos
estáticos en código, no una entidad persistida. `email_institucional` se valida en el momento de
confirmación (`ConfirmarSuscripcion.email_institucional`, requerido solo si `plan_id='estudiante'`,
validación de substring `.edu` o dominio configurable vía variable de entorno) pero no se
persiste — es una verificación de elegibilidad de punto de venta, igual en espíritu a la
validación de método de pago que ya hace `suscripciones` sin persistir el resultado de una
pasarela real.

**Primera vez** (elegibilidad de trial) se determina consultando PocketBase por *todas* las
suscripciones históricas del usuario con `tipo_plan='premium'` (no solo las activas — se agrega
`pb_client.list_historial_por_plan(token, user_id, tipo_plan)`, filtro
`usuario_o_cliente=... && tipo_plan=...` sin filtrar por `estado`, ya que el registro nunca se
borra por diseño). Si no hay ninguna, la confirmación crea la suscripción con `en_prueba=1`,
`fecha_fin_trial=now()+7d`, y **no** llama a `facturacion.procesar_pago` en ese momento. El plan
`estudiante` no tiene trial — el trial es un incentivo de conversión específico de premium, según
lo pedido; estudiante ya entra con precio reducido.

**Expiración** se resuelve en el próximo acceso, en `GET /suscripciones/activa`
(`plan_activo` en `router.py`) — el mismo endpoint que ya consulta `usePlanActivo()` en cada
carga de la app y que `resolverDestinoPostAuth` llama en cada login/registro (confirmado en
`frontend/src/packages/suscripciones/api/suscripciones.api.ts`), así que es el punto de
verificación natural sin necesitar un scheduler. Si la suscripción activa tiene `en_prueba=1` y
`fecha_fin_trial <= now()`, el endpoint llama a `facturacion.procesar_pago` con el
`metodo_pago_id` guardado y pone `en_prueba=0`; si el cobro simulado falla
(`estado='fallida'`, mismo mecanismo aleatorio ya usado por `procesar_pago`), la suscripción pasa
a `estado='cancelada'` igual que si el usuario nunca hubiera tenido método de pago válido — no
queda un plan premium activo sin cobro exitoso. Alternativa descartada: verificar la expiración
dentro de `pb_client.list_activas` (usado también por `publicidad`, `facturacion`, `analitica`
para leer el plan activo) — se rechaza porque acoplaría un efecto secundario de cobro a una
función de lectura genérica reutilizada por otras capabilities que no deberían disparar cargos
como side effect de simplemente consultar el plan.

### 7. Funnel y P&L: agregados en `analitica`, cero tablas nuevas

Ambos se construyen sobre tablas que ya existen tras este change:

- **Funnel** (`GET /analitica/funnel-conversion`): `free_activos` (PocketBase, count `estado='activa' && tipo_plan='free'` — o, si no hay registro `free` explícito para todo usuario B2C, se cuenta contra el total de usuarios B2C sin plan de pago activo, resuelto igual que `publicidad._plan_de_usuario`), `vieron_anuncio` (`count(DISTINCT usuario_id) FROM FACT_IMPRESION_ANUNCIO WHERE fecha BETWEEN ...`, sin filtrar por tipo — cubre audio y display), `se_suscribieron` (PocketBase, `count(DISTINCT usuario_o_cliente) WHERE tipo_plan IN ('premium','estudiante') && created BETWEEN ...`).
- **P&L** (`GET /analitica/pnl`): `sum(monto) FROM FACT_TRANSACCION_PAGO WHERE estado='exitosa' AND fecha BETWEEN ...` (facturación) + `sum(monto) FROM FACT_INGRESO_PUBLICITARIO WHERE fecha BETWEEN ...` (publicidad) − `sum(monto) FROM FACT_LIQUIDACION_REGALIA WHERE fecha_calculo BETWEEN ...` (regalías) = margen neto.

Ambos endpoints viven en `v1_router` de `analitica`, gateados con `require_staff` (mismo criterio
que `/reporte-diario`: son vistas de Lead Data Engineer/CTO, no de Cliente B2B). El dashboard de
P&L en frontend reutiliza `MiniBarChart` (`@shared/components/charts/MiniBarChart`, ya usado por
otros 6 dashboards admin) con 4 barras (ingreso suscripciones, ingreso publicitario, regalías
pagadas, margen neto) — sin introducir un componente de chart nuevo.

### 8. Rutas frontend: ocupar el placeholder existente, no inventar una sección nueva

`/analitica/suscripciones` (hoy `ComingSoonPage`, reservado para "conversiones B2C/B2B y
retención por cohorte") pasa a renderizar el dashboard de churn — coincide exactamente con lo que
ese placeholder ya prometía. Se agregan `/analitica/funnel-conversion` y `/analitica/pnl` como
rutas nuevas del mismo `AnalyticaShell`, con `RequireAuth roles={['admin']}` igual que
`/analitica/reporte-diario` (mismo patrón: el shell gatea `require_b2b_panel_access` para todo el
árbol, pero estas rutas puntuales necesitan además el guard admin-only porque el backend las
gatea con `require_staff`, no solo con acceso B2B genérico).

## Risks / Trade-offs

- [Riesgo] `activas_al_inicio` del churn sobreestima para meses anteriores al despliegue de este
  change (no hay fecha de cancelación histórica) → Mitigación: documentado en el requirement de
  `analitica` y en el endpoint (campo `nota` en la respuesta, mismo patrón que
  `v1_reporte_diario`); la métrica es precisa desde el despliegue en adelante.
- [Riesgo] Condición de carrera si el usuario cierra la pestaña justo cuando expira el trial y
  antes de que se dispare el próximo `GET /activa` → Mitigación: no requiere corrección — el
  cobro se dispara en el siguiente acceso real, sin ventana de "plan gratis indefinido" porque
  ningún endpoint gatea acceso premium sin pasar por `list_activas`/`plan_activo`.
- [Riesgo] `metodo_pago_id` guardado en PocketBase queda obsoleto si el usuario borra ese método
  de pago antes de que expire el trial → Mitigación: `procesar_pago` ya valida
  `metodo_pago_existe` y falla limpio (404 interno tratado como cobro fallido → cancela el
  trial), mismo comportamiento que un cobro fallido por tarjeta rechazada.
- [Riesgo] El trigger de display en `AppShell` podría pedir una impresión en cada remount del
  shell (ej. HMR en dev, o navegación que desmonta/remonta el árbol) e inflar el conteo de
  impresiones → Mitigación: se pide una sola vez por sesión de pestaña (flag en memoria del
  componente, no en cada render), mismo criterio de "no bloquear la experiencia" que ya usa
  `AdContext` para el trigger de audio.

## Migration Plan

Sin migración de datos existentes. Cambios de esquema:
- ClickHouse: `ALTER TABLE DIM_CAMPANA_PUBLICITARIA ADD COLUMN tipo_anuncio ... DEFAULT 'audio'`,
  `ADD COLUMN url_destino String DEFAULT ''`; `ALTER TABLE FACT_IMPRESION_ANUNCIO ADD COLUMN click UInt8 DEFAULT 0`; `CREATE TABLE FACT_CANCELACION_SUSCRIPCION` nueva. Las campañas ya
  existentes quedan como `tipo_anuncio='audio'` por default, sin romper el trigger actual.
- PocketBase: `ensure_collection`/`ensure_collection_rules` en `pb_init.py` agregan los tres
  campos nuevos a la colección `suscripciones`; PocketBase permite campos nuevos sin migrar
  registros existentes (quedan con valor por defecto `en_prueba=false`).
- Despliegue vía `docker compose up` sin pasos manuales adicionales, igual que el resto del
  proyecto — `init_clickhouse.py` y `pb_init.py` son idempotentes.

## Open Questions

Ninguna pendiente — las decisiones de dónde vive cada dato (PocketBase vs. ClickHouse) y cómo se
aproxima el churn histórico quedan resueltas en este documento.
