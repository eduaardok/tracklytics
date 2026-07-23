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

---

## Bloque 3 — Frontend de los 5 reportes admin (23 jul 2026)

5 páginas nuevas que consumen los endpoints de los Bloques 1 y 2, agregadas como una sección
"Reportes" nueva en el sidebar de `SeguridadShell`. Sigue el patrón exacto de las páginas admin
existentes (`AuditoriaPage`/`UsuariosAdminPage`): `useQuery` de TanStack Query contra un método de
`*.api.ts` (que envuelve `apiClient`, el cual ya inyecta el token de `localStorage` y prefija
`/app/v1`), estado de carga/error/vacío explícito, y estilos vía el CSS module compartido de cada
paquete (`SeguridadPages.module.css` / `ExperienciaPages.module.css` / `SocialPages.module.css`) —
cero CSS ad-hoc por página, cero dependencia nueva.

### Páginas
| Página | Paquete | Ruta | Consume |
|---|---|---|---|
| `ReporteUsuariosPage` | `seguridad` | `/seguridad/reporte-usuarios` | `GET /seguridad/admin/usuarios-reporte` |
| `StrikesGlobalPage` | `seguridad` | `/seguridad/reporte-strikes` | `GET /seguridad/admin/strikes` |
| `AbTestsPage` | `experiencia` | `/seguridad/reporte-ab-tests` | `GET /experiencia/admin/ab-tests` |
| `NotificacionesAdminPage` | `social` | `/seguridad/reporte-notificaciones` | `GET /social/admin/notificaciones` |
| `FamiliasReportePage` | `experiencia` | `/seguridad/reporte-familias` | `GET /experiencia/admin/familias` |

Las 3 últimas viven bajo `/seguridad/*` aunque su código está en `experiencia`/`social` — mismo
patrón ya establecido por `FamiliaAdminPage`/`ModeracionSocialPage`/`DistribucionAdminPage`: el
árbol `/seguridad` es el back-office transversal, no un espejo 1:1 del paquete de código.

### Decisiones de diseño
- **Filtros de `ReporteUsuariosPage` (país/plan/rol) son client-side**: el endpoint no pagina ni
  filtra (es un reporte simple, no un listado administrativo con `WHERE` en ClickHouse) y el
  volumen esperado (usuarios totales, no eventos) no justifica ida y vuelta al backend por cada
  cambio de filtro. Las opciones de cada `<select>` se derivan con `useMemo` de los propios datos
  ya cargados (`Array.from(new Set(...))`), tal como pedía el enunciado — no de un catálogo aparte.
- **Las 5 páginas se agregan al router vía `lazyNamed`** (no import directo), igual que el resto
  del árbol admin en `router.tsx` — ninguna trae Recharts propio, pero se lazy-cargan "por
  consistencia" (comentario ya existente en el archivo para `EtlPage`/`CrudDimensionesPage`): son
  admin-only, nunca están en el camino crítico de carga de un usuario B2C.
- **`SocialPages.module.css` no tenía tabla plana** (solo el patrón `queue*`, pensado para
  denuncias/comentarios uno-por-tarjeta) — se agregó `.tablePanel`/`.table` copiando exactamente
  las mismas reglas ya presentes en `ExperienciaPages.module.css` (el comentario de cabecera de
  ambos archivos ya declara "mismo lenguaje visual" entre ellos, así que no es una convención
  nueva). Igual se agregó `.userCell`/`.userCellName`/`.userCellMeta` a `ExperienciaPages.module.css`
  (celda apilada nombre+email), reutilizando el patrón que ya existía solo en
  `SeguridadPages.module.css`.
- **Separador "Reportes" en el sidebar**: `<span className={styles.sectionLabel}>` + `border-top`,
  usando los tokens reales del theme (`--color-muted`, `--color-border`) en vez de los valores hex
  de fallback sugeridos en el enunciado (`#888`/`#333`) — ese shell ya tiene esos tokens definidos
  y usarlos evita un color fijo que no respetaría un futuro retema.

### Hallazgo real corregido en verificación: `canal_adquisicion`/`rol` siempre vacíos
Verificando `ReporteUsuariosPage` con datos reales, las columnas Canal y Rol aparecían vacías para
usuarios sin canal de adquisición o sin rol administrativo asignado, en vez de mostrar los defaults
`'directo'`/`'usuario'` que `USUARIOS_REPORTE` (Bloque 1) ya declaraba con `ifNull(...)`. Causa
raíz: un `LEFT JOIN` en ClickHouse sin fila que matchee NO rellena el lado derecho con `NULL`
sino con el valor por defecto del tipo de la columna — `''` para una `String` no-Nullable
(`cm.nombre`/`r.rol_admin`, ambas `String` sin `Nullable()`) — así que `ifNull` nunca se disparaba:
el valor ya "existía" como cadena vacía, no como NULL. Corregido envolviendo ambas columnas con
`nullIf(columna, '')` antes del `ifNull` (`api/paquetes/seguridad/queries.py`, `USUARIOS_REPORTE`).
Sin este fix, el filtro de "Canal"/"Rol" del frontend habría mostrado una opción `""` fantasma en
vez de agrupar correctamente esas filas bajo "directo"/"usuario".

### Verificación
`docker compose up --build -d` (backend) + `npm run dev -- --port 5173` (frontend, proxy ya
apuntaba a `localhost:8000`). `npm run build` sin errores — las 5 páginas salen como chunks lazy
independientes (1.6–2.9 kB cada una); el bundle principal (`index-*.js`) queda en 528.86 kB, en
línea con el crecimiento esperado de agregar 5 rutas lazy (S11 lo dejó en 526.7 kB).

Verificación real de UI con Playwright (login real contra `s10r2_admin@test.com`, sesión inyectada
en `localStorage` como hace la app tras un login real, no mockeada): las 5 rutas cargan su `<h1>`
correcto, su tabla con filas reales (96/3/1/4/5 respectivamente — `reporte-ab-tests` muestra el
estado vacío esperado, ver Bloque 2), el sidebar muestra la sección "Reportes" con los 5 enlaces,
y cero errores de consola en las 5 navegaciones. Se verificó además que el filtro de país de
`ReporteUsuariosPage` reduce correctamente las filas (96 → 44 al filtrar `EC`) y que las opciones
de los 3 `<select>` reflejan valores reales del dataset (incluyendo datos de prueba "sucios" como
`Narnia`/`Ecuador` junto a `EC`, evidencia de que se derivan dinámicamente y no de un catálogo
curado). Frontend detenido (`Ctrl+C` al proceso de `vite`) y stack de Docker detenido
(`docker compose down`) al cierre de la sesión.

### Artefactos entregados (Bloque 3)

| Artefacto | Estado |
|---|---|
| `frontend/src/packages/seguridad/pages/ReporteUsuariosPage.tsx` | Nuevo |
| `frontend/src/packages/seguridad/pages/StrikesGlobalPage.tsx` | Nuevo |
| `frontend/src/packages/experiencia/pages/AbTestsPage.tsx` | Nuevo |
| `frontend/src/packages/experiencia/pages/FamiliasReportePage.tsx` | Nuevo |
| `frontend/src/packages/social/pages/NotificacionesAdminPage.tsx` | Nuevo |
| `frontend/src/packages/seguridad/types.ts` | Ampliado — `UsuarioReporte`, `StrikeGlobal` |
| `frontend/src/packages/experiencia/types.ts` | Ampliado — `AbTestResumen`, `FamiliaResumen` |
| `frontend/src/packages/social/types.ts` | Ampliado — `NotificacionAdmin` |
| `frontend/src/packages/seguridad/api/seguridad.api.ts` | Ampliado — `usuariosReporte`, `strikesGlobal` |
| `frontend/src/packages/experiencia/api/experiencia.api.ts` | Ampliado — `abTests`, `familiasReporte` |
| `frontend/src/packages/social/api/social.api.ts` | Ampliado — `notificacionesAdmin` |
| `frontend/src/packages/experiencia/pages/ExperienciaPages.module.css` | Ampliado — `.userCell`/`.userCellName`/`.userCellMeta` |
| `frontend/src/packages/social/pages/SocialPages.module.css` | Ampliado — `.tablePanel`/`.table` |
| `frontend/src/app/layout/SeguridadShell.tsx` | Ampliado — sección "Reportes" (5 `NavLink`) |
| `frontend/src/app/layout/SeguridadShell.module.css` | Ampliado — `.sectionLabel` |
| `frontend/src/app/router.tsx` | Ampliado — 5 rutas lazy nuevas bajo `/seguridad/*` |
| `api/paquetes/seguridad/queries.py` | Corregido — `USUARIOS_REPORTE`: `nullIf(..., '')` antes de `ifNull` |
