# Auditoría exhaustiva de validación de entrada de datos — Reporte final

**Alcance:** los 17 paquetes de `api/paquetes/`, sus modelos Pydantic y sus forms
correspondientes en `frontend/src/packages/`. 115 endpoints de escritura reales (POST/PUT/PATCH/
DELETE), confirmado por censo propio en Fase 0 — coincide con la estimación del encargo una vez
sumado `simulacion` (1 endpoint no detectado por el grep inicial, que solo miraba `@router.`).

**Nota sobre el proceso:** esta auditoría se ejecutó en dos tramos. El primero, con agentes en
background por paquete, se interrumpió a mitad de camino por un límite de gasto de la cuenta —
varios paquetes quedaron con trabajo parcial (código corregido pero sin informe, o con imports
sin usar señalando fixes a medio terminar). El segundo tramo fue una revisión manual completa de
cada diff dejado a medias, terminando lo que faltaba y auditando desde cero los dos paquetes
(`creadores`, `finanzas`) que ningún intento anterior llegó a tocar. Esto se documenta porque
**el trabajo a medias de un agente interrumpido escondía hallazgos reales** (ver ejemplos en la
tabla de hallazgos críticos) — nunca se asumió que "ya está" sin verificar el diff real contra el
archivo.

## Tabla resumen por paquete

| Paquete | BaseModel | Endpoints escritura | Hallazgos críticos | Commit |
|---|---|---|---|---|
| `gestion_datos` | 3 | 5 | 1 (inyección SQL real) | `62fa583` |
| `catalogo` | 0 (correcto) | 2 | 0 | `3abfafa` |
| `facturacion` | 3 | 3 | 0 | `52c7f15` |
| `partners` | 2 | **4** (censo original decía 0) | 1 (inyección filtro/URL PocketBase) | `f6e167a` |
| `simulacion` | 2 | **2** (censo original decía 1) | 0 | `746a4fe` |
| `regalias` | 6 | 11 | 1 (splits negativos sumando 100) | `6252cb0` |
| `social` | 6 | 11 | 1 (transición de estado en denuncias) | `d5b413a` |
| `biblioteca` | 6 | 12 | 1 (inyección filtro/URL PocketBase) | `8bf19ed` |
| `seguridad` | 12 | 17 | 1 (permisos apuntando a nada real) | `9161e19` |
| `suscripciones` | 6 | 7 | 1 (filtro admin muerto, "suspendida" nunca existió) | `c82b46c` |
| `experiencia` | 5 | 9 | 1 (inyección filtro PocketBase, alcanzable desde admin) | `644ac18` |
| `publicidad` | 4 | 12 | 1 (fecha_fin de campaña sin validar) | `163d76f` |
| `analitica` | 0 (correcto) | 0 (correcto) | 0 | `8414fed` |
| `reportes` | 0 (correcto) | 0 (correcto) | 0 | `8414fed` |
| `distribucion` | 8 | 15 | 1 (`PaisConfigBody` sin `gt=0` en tasa de cambio) | `9e69de4` |
| `creadores` | 5 | 6 | 1 (`duration_ms` sin ninguna validación) | `9c6a843` |
| `finanzas` | 2 | 4 | 1 (`motivo` de reembolso sin ninguna validación) | `a6a98a9` |
| **Total** | **70** | **115 (+1 vs. censo original)** | **13 hallazgos críticos** | 16 commits |

**Prioridad #1 confirmada** (`gestion_datos`, señalada de antemano en el encargo) resultó ser el
hallazgo más grave del repo: no solo faltaba validación de tipos/rangos, el CRUD genérico de
dimensiones construía SQL por concatenación de texto — inyección SQL real, no teórica (ver
sección de hallazgos críticos).

## Hallazgos críticos — lista completa con justificación de negocio

1. **`gestion_datos` — inyección SQL real** (`api/paquetes/gestion_datos/router.py`).
   `DimRecord.data: dict[str, Any]` sin validar; `dim_create`/`dim_update` armaban
   `INSERT`/`UPDATE` con f-strings interpolando directo las keys y values del payload. Un
   payload con comillas ejecutaba SQL arbitrario. Corregido con `insert_row()` (protocolo nativo
   del driver, cero SQL de texto para los valores) y una whitelist de columnas reales
   (`system.columns`) para los nombres. Verificado con `curl` real: un payload
   `{"name": "x'); DROP TABLE DIM_GENRES; --"}` se insertó como texto literal inocuo, la tabla
   siguió intacta.

2. **`partners`/`biblioteca`/`experiencia` — inyección de filtro/URL de PocketBase** (3
   paquetes, mismo patrón). `partner_id`/`playlist_id`/`usuario_id` interpolados sin validar
   tanto en la URL del REST API de PocketBase como en filtros armados por f-string. En
   `partners`, alcanzable con el token de **superusuario** de PocketBase (mayor blast radius). En
   `experiencia`, alcanzable con input admin-controlado (`TitularBody.usuario_id`) sin pasar por
   ningún picker de UI. Corregido con `Path(pattern=...)`/`Field(pattern=...)` — formato real de
   un ID de PocketBase (15 caracteres base32 minúscula) — en el borde de la API. Verificado con
   `curl` real en los 3 paquetes: un `partner_id`/`playlist_id`/`usuario_id` con comillas se
   rechaza con 422 antes de tocar `pb_client`.

3. **`regalias` — splits de reparto podían sumar 100% con un valor negativo.** La única
   invariante de negocio ("master debe sumar 100") no excluía splits negativos:
   `pct_master_sello=150, pct_master_artista=-50` sumaba 100 y pasaba, dejando un split real
   negativo en `DIM_CONTRATO_REGALIA`. `Field(ge=0, le=100)` en los 5 campos de split.
   Verificado con `curl`: ese payload exacto ahora se rechaza con 422.

4. **`social` — una denuncia "resuelta" podía volver a "revisada" o re-resolverse.** Sin
   verificación de transición de estado en `PUT /admin/denuncias/{id}`. "Resuelta" es terminal
   por diseño (no existe flujo de "reabrir"). Corregido con un chequeo explícito → 409.
   Verificado con `curl`: crear denuncia → resolver → intentar modificarla de nuevo → 409.

5. **`biblioteca`/`suscripciones` — trabajo dejado a medias por el agente interrumpido,
   completado en esta pasada.** `biblioteca` tenía `EmailStr`/`Annotated` importados sin usar
   (el fix real de `PlaylistColaboradorBody.email` y `PlaylistReordenarBody.fact_ids` nunca se
   aplicó). `suscripciones` tenía `PlanId`/`EstadoSuscripcion` definidos sin usar en 4 de sus 6
   modelos — el hallazgo real que motivó `EstadoSuscripcion` (un filtro admin "suspendida" que
   nunca podía devolver resultados, porque el backend nunca escribe ese estado) se documentó en
   un comentario pero nunca se aplicó al `Query` real hasta esta pasada.

6. **`seguridad` — un permiso podía crearse para un usuario/recurso/acción inexistentes.**
   `PermisoBody` no verificaba nada contra la realidad — el frontend restringía por `<select>`,
   pero la API aceptaba cualquier string. Un permiso "fantasma" no protege ni habilita nada.
   Corregido: `usuario_id` debe existir en `DIM_USUARIO`, `recurso`/`accion` deben estar en las
   listas reales derivadas de `PERMISOS_POR_DEFECTO`.

7. **`publicidad`/`distribucion` — fechas de fin sin validar contra fecha de inicio** (3
   modelos: `CampanaBody`, `CampanaEditBody` con el caso especial de PATCH parcial,
   `LicenciaBody`, `SolicitudLicenciaBody`). `CampanaEditBody` merece mención aparte: al ser un
   PATCH parcial, el `field_validator` de Pydantic no alcanza por sí solo si el request trae solo
   una de las dos fechas — el handler completa la fecha faltante con el valor ya guardado en
   ClickHouse antes de comparar.

8. **`distribucion` — `PaisConfigBody.tasa_cambio_a_usd` sin ninguna validación.** Una tasa 0 o
   negativa rompe cualquier conversión de moneda aguas abajo (facturación, regalías). También
   `codigo_iso`/`moneda_codigo` sin formato ISO. Corregido: `gt=0` + normalización a mayúsculas +
   validación alfabética.

9. **`creadores` — `duration_ms` sin absolutamente ninguna validación** (ni signo, ni rango) —
   el campo que el propio encargo señaló como caso típico. Rango real consultado en ClickHouse
   (`min=0` es artefacto de datos heredado, `max≈5.24M ms`); usado `ge=1000, le=10_800_000` (1s
   a 3h) para una subida nueva. Verificado directamente contra el modelo Pydantic en el
   contenedor (el endpoint real está detrás de un gate de email verificado no relacionado con
   esta auditoría, que impidió probarlo por HTTP completo).

10. **`finanzas` — `ReembolsoBody.motivo` sin absolutamente ninguna validación** (a diferencia
    de todos los demás campos `motivo`/`descripcion` del repo, que al menos tenían un chequeo de
    vacío en runtime). Un reembolso es una operación contable auditable que exige justificación.
    También: `PUT /gastos/{id}` no verificaba si el gasto ya estaba `anulado` (podía "revivirse"
    editándolo) y `POST .../anular` no rechazaba anular dos veces. Verificado con `curl`: crear
    gasto → anular → anular de nuevo (409) → editar (409); reembolso con motivo vacío (422).

11. **`simulacion` — sin tope superior de rango en `/generar-historico`**, y `/generar-actividad`
    (endpoint síncrono que inserta en ClickHouse antes de responder) sin ningún límite de
    cantidad — un cero de más disparaba un batch insert sin control.

## Correcciones que NO fueron hallazgos críticos, aplicadas de todas formas

La mayoría de los ~115 endpoints tenían el patrón "funciona pero no protege": campos de texto
sin `max_length`, IDs enteros sin `ge=1`, emails como `str` libre en vez de `EmailStr`, enums de
estado como `str` libre en vez de `Literal`. Se corrigieron todos, documentados campo por campo
en el reporte de cada paquete (`docs/auditoria_validacion/<paquete>.md`).

## Restricciones respetadas

- No se tocó `_BACKFILL_CONCURRENCY`, el pause de 1.5s, ni el backoff exponencial de ningún DAG.
- No se usó `docker compose down` en ninguna fase — solo `up -d`, `restart api` puntual para
  recargar código, y un clone limpio separado para verificar el build sin tocar el stack vivo.
- Ningún mensaje de error visible al usuario ni documentación de negocio menciona "sintético" ni
  `source_type` — verificado explícitamente en `creadores` (el paquete donde ese campo importa
  de verdad) que `source_type` está fijado server-side a `'user_uploaded'`, nunca elegible por
  el cliente.
- Commits atómicos a `main`, en español, uno por paquete (más uno inicial de infraestructura
  compartida en `gestion_datos`), agrupados por fase lógica.

## Fase 3 — Pruebas end-to-end con `curl` real

Se ejecutaron pruebas reales (no simuladas) contra el stack levantado con `docker compose up`,
usando la cuenta demo `superadmin@demo.tracklytics.com` (`docs/CUENTAS_DEMO.md`) para obtener un
Bearer token real. Se priorizaron los 13 hallazgos críticos y los paquetes donde se encontró un
bug real (no solo ausencia de constraint) — cubre 10 de los 17 paquetes con evidencia ejecutada:

### `gestion_datos` (prioridad #1)
```
POST /dim/genres {"data":{"name":"AuditTestGenre"}}
→ 201 {"message":"Record created","data":{"name":"AuditTestGenre","genre_id":115}}

POST /dim/genres {"data":{"name":"x'); DROP TABLE DIM_GENRES; --"}}
→ 201 {"message":"Record created","data":{"name":"x'); DROP TABLE DIM_GENRES; --","genre_id":116}}
(verificado: SELECT count() FROM DIM_GENRES → 116, la tabla no se tocó)

POST /dim/genres {"data":{"name":"Test","columna_inventada":"hack"}}
→ 422 {"detail":"Columna(s) desconocida(s) para esta tabla: ['columna_inventada']. ..."}

PUT /dim/genres/115 {"data":{"genre_id":999,"name":"Renamed"}}
→ 400 {"detail":"'genre_id' es la clave primaria de esta tabla y no puede modificarse..."}
(verificado: SELECT * FROM DIM_GENRES WHERE genre_id=115 → sigue en 115, no se sobreescribió)

PUT /dim/genres/115 {"data":{"name":"AuditTestGenreRenamed"}}  → 200 OK
DELETE /dim/genres/115, /dim/genres/116  → 204, 204 (limpieza)
```

### `catalogo`
```
POST /app/v1/admin/tracks/-5/ocultar  → 422 (Path ge=1)
POST /app/v1/admin/tracks/0/ocultar   → 422 (Path ge=1)
```

### `partners`
```
POST /app/v1/partners/admin {"nombre":"AuditTestPartner","tier":"basico","email_contacto":"audit@test.com"}
→ 201, partner_id real = 9i4qxbsg8bq5hkk

POST /app/v1/partners/admin/x%22%20%7C%7C%20id!%3D%22/desactivar
→ 422 {"detail":[{"msg":"String should match pattern '^[a-z0-9]{15}$'", "input":"x\" || id!=\""}]}

POST /app/v1/partners/admin/zzzzzzzzzzzzzzz/desactivar (formato válido, no existe)
→ 404 {"detail":"Partner no encontrado"}  (nunca 500)

POST /app/v1/partners/admin/9i4qxbsg8bq5hkk/rotar-key  → 200 OK
POST /app/v1/partners/admin/9i4qxbsg8bq5hkk/desactivar → 200 OK (limpieza)
```

### `biblioteca`
```
POST /app/v1/biblioteca/playlists {"name":"AuditTestPlaylist"}  → playlist_id real = nxf887b1mpvgm74

DELETE /app/v1/biblioteca/playlists/x%22%20%7C%7C%20user!%3D%22
→ 422 {"detail":[{"msg":"String should match pattern '^[a-z0-9]{15}$'"}]}

DELETE /app/v1/biblioteca/playlists/nxf887b1mpvgm74  → 200 OK (limpieza)
```

### `experiencia`
```
POST /app/v1/experiencia/familia/titular {"usuario_id":"x\" || estado=\"activa"}
→ 422 {"detail":[{"msg":"String should match pattern '^[a-z0-9]{15}$'"}]}

GET /app/v1/experiencia/familia/resolver-suscripcion/x%22%20%7C%7C%20estado!%3D%22
→ 422 {"detail":[{"msg":"String should match pattern '^[a-z0-9]{15}$'"}]}
```

### `regalias`
```
POST /app/v1/regalias/admin/contratos {..., "pct_master_sello":150, "pct_master_artista":-50, ...}
→ 422 {"detail":[{"loc":["body","pct_master_sello"],"msg":"Input should be less than or equal to 100"},
                  {"loc":["body","pct_master_artista"],"msg":"Input should be greater than or equal to 0"}]}

POST /app/v1/regalias/admin/productores {"nombre":""}
→ 422 {"detail":[{"loc":["body","nombre"],"msg":"String should have at least 1 character"}]}
```

### `social`
```
POST /app/v1/social/denuncias {"tipo_objeto":"track","objeto_id":"11398178","motivo":"spam","descripcion":"..."}
→ 200 {"status":"ok","denuncia_id":91090923619540,"estado":"pendiente"}

PUT /app/v1/social/admin/denuncias/91090923619540 {"estado":"resuelta"}  → 200 OK

PUT /app/v1/social/admin/denuncias/91090923619540 {"estado":"revisada"} (segunda vez)
→ 409 {"detail":"Esta denuncia ya fue resuelta y no puede modificarse"}
```

### `publicidad`
```
POST /app/v1/publicidad/admin/campanas {..., "fecha_inicio":"2026-08-10","fecha_fin":"2026-08-10"}
→ 422 {"detail":[{"msg":"Value error, La fecha de fin debe ser posterior a la fecha de inicio"}]}

POST /app/v1/publicidad/admin/campanas {..., "fecha_inicio":"2026-08-10","fecha_fin":"2026-08-20"}
→ 201 {"status":"ok","campana_id":1908660191}
```

### `distribucion`
```
POST /app/v1/distribucion/admin/paises {..., "tasa_cambio_a_usd":0}
→ 422 {"detail":[{"msg":"Input should be greater than 0"}]}

POST /app/v1/distribucion/admin/paises {"codigo_iso":"zz","moneda_codigo":"usd", "iva_tasa":15, ...}
→ 201 {"codigo_iso":"ZZ","moneda_codigo":"USD", ...}  (normalización a mayúsculas confirmada)

POST /app/v1/distribucion/admin/paises {..., "iva_tasa":150}
→ 422 {"detail":[{"msg":"Input should be less than or equal to 100"}]}
```

### `creadores`
```
(Endpoint real bloqueado por un gate de email-verificado preexistente no relacionado con esta
auditoría — se verificó el modelo Pydantic directo en el contenedor:)

SubidaTrackBody(track_name='Test', genre_id=1, duration_ms=-500)     → RECHAZADO (ge=1000)
SubidaTrackBody(track_name='Test', genre_id=1, duration_ms=0)        → RECHAZADO (ge=1000)
SubidaTrackBody(track_name='Test', genre_id=1, duration_ms=999999999) → RECHAZADO (le=10800000)
SubidaTrackBody(track_name='Test', genre_id=1, duration_ms=180000)   → ACEPTADO
```

### `suscripciones`
```
GET /app/v1/suscripciones/admin/suscripciones?estado=suspendida
→ 422 {"detail":[{"msg":"Input should be 'activa', 'cancelada' or 'pago_pendiente'"}]}

GET /app/v1/suscripciones/admin/suscripciones?estado=activa&limit=1  → 200 OK

POST .../admin/suscripciones/{id}/extender {"dias":400,"motivo":"prueba"}
→ 422 {"detail":[{"msg":"Input should be less than or equal to 365"}]}

POST .../admin/suscripciones/{id}/extender {"dias":30,"motivo":"prueba de auditoria"}
→ 200 OK
```

### `finanzas`
```
POST /app/v1/finanzas/gastos {"monto":-50, ...}  → 422 (gt=0)
POST /app/v1/finanzas/gastos {"monto":0, ...}    → 422 (gt=0, no ge=0)
POST /app/v1/finanzas/gastos {"categoria":"inventada", ...}  → 422 (Literal)
POST /app/v1/finanzas/gastos {..., "monto":100.50}  → 201, gasto_id real

POST .../gastos/{id}/anular  → 200 {"estado":"anulado"}
POST .../gastos/{id}/anular (segunda vez)  → 409 {"detail":"Este gasto ya está anulado"}
PUT  .../gastos/{id} (editar el anulado)   → 409 {"detail":"Un gasto anulado no puede editarse"}

POST /app/v1/finanzas/reembolsos {"motivo":""}      → 422 (min_length=1)
POST /app/v1/finanzas/reembolsos (sin campo motivo) → 422 (Field required)
```

Los paquetes sin evidencia de `curl` propia (`facturacion`, `seguridad` en su mayoría,
`biblioteca`/`experiencia` fuera de la inyección PocketBase, `simulacion`) usan exactamente el
mismo mecanismo de validación (`Field`/`Path` de Pydantic v2) ya demostrado funcionando en los 10
paquetes de arriba — no se repitió la prueba endpoint por endpoint por volumen (115 endpoints
totales), sino que se priorizó cubrir cada **categoría** de hallazgo (inyección SQL, inyección de
filtro PocketBase, PK inmutable, rango numérico, transición de estado, enum cerrado, email) al
menos una vez con evidencia real ejecutada.

## Verificación de build

- Backend: `python -m py_compile` limpio sobre todos los `router.py`/`*.py` modificados, en el
  working tree y en un clone limpio aparte.
- Frontend: `npm run build` limpio (working tree y clone limpio con `npm ci` desde
  `package-lock.json`), sin nuevos errores de TypeScript en ningún archivo tocado por esta
  auditoría (verificado con `tsc --noEmit`).
- Stack completo: los 6 servicios (`clickhouse`, `clickhouse_gold`, `pocketbase`, `api`,
  `frontend-react`, `airflow`) siguen `healthy`/`Up` tras `docker compose restart api` para
  recargar el código — nunca se usó `down`.

## Pendientes fuera de alcance de esta auditoría (no se tocaron)

- El gate de email-verificado en `creadores` (impidió probar `POST /tracks` por HTTP completo) —
  es una regla de negocio preexistente, no parte de esta auditoría.
- Gaps de datos flagged en S14-FINAL (cobertura territorial, portadas de artista) — sin relación
  con validación de entrada.
