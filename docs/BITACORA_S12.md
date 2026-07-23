# Bitácora de Desarrollo — Semana 12
**Proyecto:** Tracklytics v2 — Plataforma de Analítica Musical
**Semana académica:** 12 de 16

---

## Bloque 1 — Reportes administrativos de captación y strikes (23 jul 2026)

Dos endpoints de solo lectura para `seguridad`, pedidos como informes de apoyo a paneles de
negocio externos al catálogo de CU del proyecto (no introducen reglas de negocio nuevas, solo
exponen datos ya modelados).

### `GET /app/v1/seguridad/admin/usuarios-reporte`
Listado enriquecido de usuarios (`require_admin`, i.e. `superadmin`): `usuario_id`, `nombre`,
`email`, `pais`, `estado_cuenta`, `ultimo_acceso`, `rol` (administrativo, por área), `canal_adquisicion`
y `plan_activo`.

`USUARIOS_REPORTE` (`api/paquetes/seguridad/queries.py`) corrige tres discrepancias del enunciado
original contra el esquema real:
- `DIM_USUARIO` no tiene columna `ultimo_acceso` — se deriva de `FACT_SESION`
  (`max(fecha_inicio)` por usuario), mismo criterio que `ULTIMO_LOGIN_USUARIO`.
- `DIM_USUARIO` es `ReplacingMergeTree(actualizado_en)`: leer `estado_cuenta` crudo puede mostrar
  una versión vieja si la parte no fusionó aún — se resuelve con `argMax` por `usuario_id`, mismo
  criterio que `usuarios_admin_listado_sql`.
- `BRIDGE_USUARIO_ROL_ADMIN` no tiene columnas `rol`/`asignado_en` (son `rol_admin`/`fecha`), y la
  revocación es borrado lógico (`revocado`) — se resuelve igual que `ROLES_ADMIN_VIGENTES`. Un
  usuario sin rol administrativo asignado cae en `'usuario'`.

`plan_activo` NO se resuelve con un lookup a PocketBase por fila (N+1 sobre un listado completo de
usuarios) — ese exacto trade-off ya está decidido y documentado en `usuarios_listado_sql`
(`queries.py`, S10 ronda 2). En su lugar, `_mapa_planes_activos()` (`router.py`) hace **una sola**
llamada a `suscripciones.pb_client.list_admin('estado!="cancelada"', ...)` (ya existente, usada por
la gestión comercial de suscripciones) y arma un diccionario `usuario_id -> tipo_plan` en memoria;
cada fila del reporte hace un lookup local a ese diccionario, con `'free'` como default. Si
PocketBase falla, el `try/except` degrada el reporte entero a `'free'` para todos en vez de
tumbarlo (best-effort, mismo criterio que `usuario_360`/`exportar_mis_datos`).

El enunciado original pedía usar `paquetes.seguridad.pb_client` para este lookup — ese módulo solo
habla con la colección `users` de PocketBase (registro/login), no con `suscripciones`; se usó
`paquetes.suscripciones.pb_client` (importado en `router.py` como `susc_pb`), que sí gestiona esa
colección y ya expone `list_admin` con token de superusuario.

### `GET /app/v1/seguridad/admin/strikes`
Listado global de strikes activos (todo el sistema, no por usuario), protegido con
`require_comunidad_admin` (`admin_comunidad`, ya definido en `router.py`). Complementa a
`STRIKES_DE_USUARIO` (por usuario, ya existente) con una vista de moderación transversal.

`STRIKES_ACTIVOS_GLOBAL` (`api/paquetes/seguridad/strikes.py`) resuelve `activo` con `argMax` por
`strike_id` antes de filtrar — `FACT_STRIKE_USUARIO` es `ReplacingMergeTree(actualizado_en)`, y
leer `activo` crudo (como pedía el enunciado original) podría mostrar un strike ya revocado si la
parte todavía no fusionó, mismo bug de fondo que ya evita `STRIKES_ACTIVOS_COUNT`. El `LEFT JOIN` a
`DIM_USUARIO` para nombre/email queda sin resolver, igual que `AUDIT_LOG_RECIENTES`/
`ERRORES_RECIENTES`: es solo para mostrar, no gobierna ninguna decisión.

### Por qué no hay spec nueva de OpenSpec
Ninguno de los dos endpoints introduce un caso de uso o regla de negocio nueva: reorganizan datos
ya cubiertos por requirements existentes de `openspec/specs/seguridad/spec.md` (gestión
administrativa de usuarios, historial de sanciones) en una forma de reporte/exportación para un
panel externo al catálogo de CU del proyecto. Se optó por no crear un delta de spec para no
inflar el catálogo con requirements de "vista adicional sobre datos ya especificados" — mismo
criterio editorial ya aplicado a otros paneles de solo lectura del proyecto (p. ej. el dashboard
de RT-04 no tiene un requirement por cada cifra que expone).

### Verificación
`docker compose up --build -d`: stack completo saludable. Login real contra
`s10r2_admin@test.com` (superadmin) vía `POST /app/v1/seguridad/auth/login`:
- `GET /admin/usuarios-reporte` → 200, filas con `estado_cuenta`, `ultimo_acceso` real,
  `rol` (`superadmin` para las cuentas admin, vacío para el resto), `plan_activo: "free"`
  (sin suscripciones activas en los datos de prueba).
- `GET /admin/strikes` → 200, 3 strikes activos reales de `p89msmlxf27052p` (Bob P2), consistente
  con los strikes sembrados en S11 (`p2-descubrimiento-comunidad`).
- Ambos endpoints devuelven `401` con un token inválido (`Bearer garbage`), igual que el resto de
  endpoints `/admin/*` — sin regresión en el gating existente.
- Sin errores ni tracebacks en logs del contenedor `api` durante las pruebas.
- Stack detenido (`docker compose down`) al cierre de la verificación.

### Artefactos entregados (Bloque 1)

| Artefacto | Estado |
|---|---|
| `api/paquetes/seguridad/queries.py` | Ampliado — `USUARIOS_REPORTE` |
| `api/paquetes/seguridad/strikes.py` | Ampliado — `STRIKES_ACTIVOS_GLOBAL` |
| `api/paquetes/seguridad/router.py` | Ampliado — `GET /admin/usuarios-reporte`, `GET /admin/strikes`, `_mapa_planes_activos` |

---

## Bloque 2 — Reportes administrativos de A/B tests, notificaciones y plan familiar (23 jul 2026)

Tres endpoints más de solo lectura, mismo criterio que el Bloque 1: reorganizan datos ya
modelados para paneles de negocio, sin reglas nuevas.

### `GET /app/v1/experiencia/admin/ab-tests`
`AB_TESTS_RESUMEN` (`api/paquetes/experiencia/queries.py`) agrupa `FACT_AB_TEST_EXPOSICION` por
`experimento`/`variante` con exposiciones, usuarios únicos y rango de fechas. Tabla `MergeTree`
simple (no versionada), sin discrepancias de esquema — se implementó tal cual el enunciado.
Protegido con `require_admin` (`paquetes.experiencia.deps`, ya usado por el resto de `/admin/*`
de esta capability).

**Hallazgo de verificación:** el endpoint devuelve `{"tests": []}` porque `FACT_AB_TEST_EXPOSICION`
no tiene ningún productor en el código — ninguna parte de `api/` ni de `etl/` escribe en esa tabla
desde que se creó (`init_clickhouse.py`, change `experiencia` de S9). No es un bug de esta sesión:
es una tabla declarada sin backfill/escritor real, mismo tipo de gap ya documentado para el avance
incompleto de portadas en S11. Queda fuera de alcance corregirlo aquí — la tarea pedía el endpoint
de lectura, no instrumentar la emisión de exposiciones A/B.

### `GET /app/v1/social/admin/notificaciones`
`NOTIFICACIONES_ADMIN` (`api/paquetes/social/queries.py`): últimas 200 notificaciones de todo el
sistema (a diferencia de `NOTIFICACIONES_DE_USUARIO`, que es autoservicio de la propia bandeja).
`FACT_NOTIFICACION` es `MergeTree` simple, así que el `LEFT JOIN` a `DIM_USUARIO` no necesita
`argMax` — mismo criterio que `AUDIT_LOG_RECIENTES`/`ERRORES_RECIENTES` de `seguridad`. Protegido
con el `require_admin` local de `social/router.py` (`= require_rol_admin("admin_comunidad")`,
verificado contra los demás endpoints `/admin/*` de ese router — `/admin/dashboard`,
`/admin/comentarios`, `/admin/denuncias` — para no introducir un segundo criterio de autorización
en el mismo router).

### `GET /app/v1/experiencia/admin/familias`
`FAMILIAS_RESUMEN` (`api/paquetes/experiencia/queries.py`): una fila por `suscripcion_id` de
`BRIDGE_SUSCRIPTOR_FAMILIA`, con el titular resuelto vía `maxIf(..., es_titular = 1)` — mismo
shape que `MIEMBROS_DE_SUSCRIPCION` pero agregado por familia en vez de expandido por miembro.
`plan` no vive en ClickHouse (`BRIDGE_SUSCRIPTOR_FAMILIA` no tiene esa columna, es dato de
PocketBase) — se enriquece en el router con **un lookup por familia** (no por miembro) a
`suscripciones.tipo_plan` vía PocketBase, con `'familiar'` como default best-effort si falla o no
hay registro. Se agregó `pb_client.obtener_por_id(suscripcion_id)` en
`api/paquetes/experiencia/pb_client.py` (mismo cliente ya usado por `suscripcion_activa_de_usuario`
en el resto del router, en vez de importar el `pb_client` de `suscripciones` — evita mezclar dos
tokens de superusuario cacheados distintos para la misma colección dentro del mismo router).
El enunciado pedía extraer el campo `"plan"`; el campo real en la colección `suscripciones` de
PocketBase es `tipo_plan` (`pb_init.py`) — se lee `tipo_plan` y se expone como `plan` en la
respuesta, tal como pedía el enunciado.

### Por qué no hay spec nueva de OpenSpec
Mismo criterio que el Bloque 1: los tres son vistas de reporte sobre datos ya cubiertos por
requirements existentes (`openspec/specs/experiencia/spec.md` ya especifica el plan familiar;
`social/spec.md` ya especifica notificaciones) o sobre una tabla sin requirement propio porque
nunca tuvo un flujo de escritura real (`FACT_AB_TEST_EXPOSICION`). No se crea un delta para no
inflar el catálogo con "vista adicional sobre datos ya especificados".

### Verificación
`docker compose up --build -d`: stack saludable. Login real (`s10r2_admin@test.com`, superadmin)
vía `POST /app/v1/seguridad/auth/login`:
- `GET /experiencia/admin/ab-tests` → 200, `{"tests": []}` (sin productor de datos, ver hallazgo
  arriba — no es un fallo del endpoint).
- `GET /social/admin/notificaciones` → 200, notificaciones reales de S10/S11 con
  `destinatario_nombre` resuelto.
- `GET /experiencia/admin/familias` → 200, familias reales de pruebas previas con `plan: "premium"`
  resuelto vía PocketBase (único plan que admite plan familiar).
- Los tres devuelven `401` con un token inválido (`Bearer garbage`), sin regresión de gating.
- Sin errores ni tracebacks en logs del contenedor `api`.
- Stack detenido (`docker compose down`) al cierre.

### Artefactos entregados (Bloque 2)

| Artefacto | Estado |
|---|---|
| `api/paquetes/experiencia/queries.py` | Ampliado — `AB_TESTS_RESUMEN`, `FAMILIAS_RESUMEN` |
| `api/paquetes/experiencia/pb_client.py` | Ampliado — `obtener_por_id` |
| `api/paquetes/experiencia/router.py` | Ampliado — `GET /admin/ab-tests`, `GET /admin/familias` |
| `api/paquetes/social/queries.py` | Ampliado — `NOTIFICACIONES_ADMIN` |
| `api/paquetes/social/router.py` | Ampliado — `GET /admin/notificaciones` |
