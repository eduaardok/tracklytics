# Bitácora de Desarrollo — Semana 16
**Proyecto:** Tracklytics v2 — Plataforma de Analítica Musical
**Semana académica:** 16 (post-cierre de S15)

---

## S16-P1 — Acceso a Airflow desde el frontend + schedule automático en Gold (12 ago 2026)

Modo autónomo: se decidió y documentó sin pausar a preguntar, salvo el ajuste de detalle menor
(cadencia exacta del schedule, nombre de la variable de entorno).

### Tarea 1 — Botón "Ver en Airflow"

Componente reutilizable `AirflowLinkButton` (`frontend/src/shared/components/`) usado en 2
páginas que disparan DAGs desde el frontend:

- `EtlPage.tsx` (`/seguridad/ingesta`) — un botón junto a "Disparar ingesta"
  (`tracklytics_etl`) y otro junto a "Recalificar catálogo" (`tracklytics_recalificacion`).
- `SimulacionPage.tsx` (`/seguridad/simulacion`) — un botón junto a "Generar y refrescar Gold"
  (`dag_generar_bajo_demanda`, que ya encadena su propio refresco de `dag_gold_aggregations`).

`dag_backfill_negocio` no tiene UI de disparo en el frontend (solo corre manual desde Airflow
directamente, confirmado — no hay endpoint ni botón que lo dispare), así que no le corresponde
botón.

Cada botón abre `{VITE_AIRFLOW_PUBLIC_URL}/dags/{dag_id}/grid` en pestaña nueva
(`window.open(..., '_blank', 'noopener,noreferrer')`), sin tocar el polling propio existente de
cada página. `VITE_AIRFLOW_PUBLIC_URL` es la URL **pública** de Airflow (la que abre el
navegador), separada a propósito de `AIRFLOW_URL` (`api/core/config.py`,
`http://airflow:8080`), que es interna de red Docker y no resuelve fuera de los contenedores —
confundir ambas habría roto el botón en cualquier navegador real. Como Vite hornea las env vars
en build time, se agregó como build arg real (`frontend/Dockerfile` + `docker-compose.yml`,
`args: VITE_AIRFLOW_PUBLIC_URL: ${AIRFLOW_PUBLIC_URL:-http://localhost:8080}`), no solo un
fallback en código — así si el docente accede desde otra IP/host alcanza con una variable en
`.env`, sin editar fuente. El password de Airflow nunca se expone en frontend; el botón solo
muestra un hint ("Credenciales de Airflow: ver README") — README ya documentaba
usuario/password (línea ~199, sección de servicios).

Estilo: cada página reutiliza su propio patrón de botón secundario existente (`.btnGhost` en
`ingesta`, uno nuevo añadido en `simulacion` porque el `.btnOutline` existente ahí traía un
`margin-top` pensado para otro layout, no apto para un formRow inline).

### Tarea 2 — Schedule automático en `dag_gold_aggregations`

`schedule_interval` pasó de `None` a `"@weekly"` — alineado 1:1 con la cadencia de
`tracklytics_etl` (semana académica simulada); no había motivo de negocio para recalcular Gold
más seguido que la fuente que agrega.

Guarda agregada (`ShortCircuitOperator`, task `hay_batch_nuevo`, primero en el DAG): compara el
último `ETL_LOGS.run_timestamp` exitoso (catálogo, 8123) contra el último
`GOLD_ETL_LOG.ejecutado_en` (Gold, 8124) — si no hay carga más nueva que la última corrida de
Gold, salta las 60 tareas de agregación limpiamente (no falla) y lo deja en el log de la propia
tarea. Sin esto, una corrida semanal automática en una semana sin `tracklytics_etl` disparado
habría recalculado 60 tareas sobre exactamente los mismos datos. La guarda aplica igual a
disparo manual (es una condición de frescura de datos, no del modo de disparo) — sigue siendo
correcto saltar una corrida manual redundante, la agregación es idempotente de cualquier forma.

Los demás DAGs de disparo puntual (`dag_backfill_negocio`, `dag_generar_bajo_demanda`,
`tracklytics_recalificacion`, `reload_portadas`) se dejaron intactos en `schedule_interval=None`
— siguen siendo manuales por diseño.

### Verificación real (no descrita, ejecutada)

- `python -m py_compile etl/dags/dag_gold_aggregations.py` limpio.
- `npm run build` limpio (los 3 errores preexistentes de tipos en `EngagementPage.tsx` se
  confirmaron preexistentes con `git stash` antes/después — no relacionados con este cambio).
- `docker compose build frontend-react` con el build arg nuevo, exitoso; contenedor recreado y
  levantado (`docker compose up -d frontend-react`, sin `down`).
- Airflow (`etl/dags` está montado como volumen, sin rebuild necesario) recogió el DAG
  modificado sin errores de import (`has_import_errors: false` vía API REST), con
  `schedule_interval: @weekly` y 61 tareas (60 + `hay_batch_nuevo`).
- Disparo manual real de `dag_gold_aggregations` vía API REST: `hay_batch_nuevo` corrió y
  registró en su log "última carga exitosa=2026-08-02, última corrida Gold=2026-08-10 → salta
  (nada nuevo que agregar)"; las 60 tareas downstream quedaron en `skipped` (no `failed`) y el
  `dagRun` completo en `success` — confirma que el guardado no bloquea el disparo manual ni
  falla la ejecución.
- `curl` real a `http://localhost:8080/dags/dag_gold_aggregations/grid`,
  `.../tracklytics_etl/grid`, `.../tracklytics_recalificacion/grid` y
  `.../dag_generar_bajo_demanda/grid`: los 4 devuelven `302` a `/login/?next=...` con la URL de
  destino correcta (Airflow exige auth, redirect esperado, no 404).
- Playwright real (login con la cuenta demo `superadmin`, `docs/CUENTAS_DEMO.md`) contra
  `/seguridad/ingesta` y `/seguridad/simulacion`: los 3 botones "Ver en Airflow" existen, cada
  uno abre una pestaña nueva con la URL `{...}/dags/{dag_id}/grid` correcta para su DAG, y el
  hint de credenciales aparece 2 veces en `EtlPage`.

### Archivos nuevos o modificados

- `frontend/src/shared/components/AirflowLinkButton.tsx` + `.module.css` — nuevo, reutilizable.
- `frontend/src/packages/ingesta/pages/EtlPage.tsx` + `.module.css` — 2 botones + `.btnGhost`.
- `frontend/src/packages/simulacion/pages/SimulacionPage.tsx` + `.module.css` — 1 botón +
  `.btnGhost` nuevo (sin tocar `.btnOutline`, que sigue sirviendo el Link de "Ver impacto en
  P&L").
- `frontend/Dockerfile`, `docker-compose.yml` — build arg `VITE_AIRFLOW_PUBLIC_URL`.
- `README.md` — `AIRFLOW_PUBLIC_URL` documentado en el template de `.env`.
- `etl/dags/dag_gold_aggregations.py` — schedule `@weekly` + guarda `hay_batch_nuevo`.

3 commits atómicos a `main`: `feat(ingesta): botón de acceso a Airflow`,
`feat(simulacion): botón de acceso a Airflow`, `feat(etl): schedule automático en
dag_gold_aggregations`.

---

## S16-P2 — Benchmark SQL vs Gold + polish visual + verificación UX por rol (12 ago 2026)

Nota sobre numeración: el prompt de este bloque asumía que la bitácora activa seguía siendo
S15 ("no crear S17"). Se verificó primero (`ls docs/BITACORA_S*.md`) — S15 ya estaba cerrado
("reporte final consolidado", último commit antes de esta sesión) y esta misma sesión ya había
abierto `BITACORA_S16.md` en el bloque anterior (S16-P1, Airflow/Gold). Se continúa acá, no en
S15 ni en un S17 nuevo.

Modo autónomo, 3 fases secuenciales, cada una cerrada con commit(s) antes de avanzar a la
siguiente (la sesión anterior se había cortado por límite de gasto a mitad de una tarea
similar — priorizar checkpoints commiteados sobre completitud de una fase larga sin cortes).

### Fase 1 — Benchmark SQL directo vs. Gold (prioridad más alta)

3 informes reales medidos, cada uno ya expuesto como endpoint Gold (`paquetes.reportes.router`,
C14/C15/C18), con su equivalente SQL directo escrito desde cero sobre `FACT_ENGAGEMENT_USUARIO`/
`FACT_TRACKS`/`DIM_GENRES` (1M/1.3M/114 filas reales) — nunca la tabla Gold. La ventana de
tiempo (y, para el ranking de géneros, el conjunto exacto de géneros) se lee del contenido real
de la propia tabla Gold en el momento de medir, no se fija a mano, para que "los resultados
coinciden" sea una comprobación real. Cada camino corre 3 veces reales (`time.perf_counter()`) y
se promedia; `filas_leidas` sale de `result.summary['read_rows']` de `clickhouse-connect`
(encabezado real de ClickHouse, no estimado).

Nuevo endpoint `POST /app/v1/analitica/benchmark-sql/{informe_id}/ejecutar` (`require_staff`,
`api/paquetes/analitica/benchmark_sql.py`) + `GET .../informes`. Nunca automático: el frontend
(`/analitica/benchmark-sql`, sección staff del sidebar de Analítica — **no confundir con
`/analitica/benchmark`, que ya existía y es otra cosa**, comparación de artistas) dispara la
medición solo con el botón "Medir ahora" por informe.

Resultados reales (`docs/BENCHMARK_SQL_VS_GOLD.md`): **11.7x** y **10.8x** de mejora en los 2
informes con joins entre `FACT_ENGAGEMENT_USUARIO`/`FACT_TRACKS`/`DIM_GENRES` (2M y 1.27M filas
escaneadas en el camino directo vs. ~2-4K en Gold), pero solo **1.7x** en el agregado simple sin
join (`avg(popularity)` sobre `FACT_TRACKS` completo — ClickHouse columnar ya es rápido para eso
por sí solo). Los 3 informes coinciden exactamente (o por redondeo de punto flotante) entre
ambos caminos.

### Fase 2 — Polish visual

`KPICard.tsx` y `PageTransition.tsx` existían con "0 usos" según la pre-inspección del prompt —
al verificar antes de tocar nada, `PageTransition` en realidad **ya estaba montado en los 3
shells** desde S14 (commit `f7b69f2`), pre-inspección desactualizada, cero cambios necesarios
ahí. `KPICard` sí tenía 0 usos reales: se aplicó en `DashboardPage` (`/analitica`, "Escala del
catálogo" + "Audio promedio", que mostraban `<dl>` de texto plano) y en la página nueva de
benchmark (Fase 1). Bug propio encontrado en verificación visual con Playwright: números de 7
dígitos (1.313.556 tracks) se salían de la card con el font-size fijo — resuelto con notación
compacta condicional (`fmtKpi`, solo compacta a partir de 1M; para números de 6 dígitos la
notación compacta en es-ES escribe la unidad como palabra — "29,9 mil" — y ocupa MÁS espacio que
el número completo, así que compactar siempre habría sido peor, no mejor).

Auditoría de EmptyState: ~30 pantallas con "sin datos" en texto plano fuera del componente;
corregidas las 5 de analítica (mencionada explícita en el prompt) + el caso más claro de panel
admin (`AdminTracksPage`, patrón `<tr><td colSpan><EmptyState/></td></tr>` ya establecido en
otras 6 páginas admin). El resto queda fuera — no es tarea de rediseño total del panel admin, y
gran parte de las restantes ya tienen su propio tratamiento visual (íconos/ilustraciones), no un
hueco real.

Recharts, hover de KPICard y framer-motion: auditados, sin cambios de código porque ya estaban
resueltos. Los 8 archivos que usan `recharts` directo (fuera de los wrappers compartidos) ya
tienen Tooltip custom + paleta del tema en los 8. `KPICard` ya hereda hover (glow de borde +
sombra) de la utilidad global `.card-glass`. `framer-motion` sigue sin instalar — todo lo pedido
ya está resuelto en CSS puro, y el proyecto ya lo había evaluado y descartado antes por costo de
bundle (+43kB gzip, `docs/BITACORA_S14.md`).

4 commits atómicos: KPICard, EmptyState, SkeletonLoader en la pantalla nueva de benchmark
(hueco real: cargaba con un `<div>` vacío en vez de `SkeletonCard`, ya en uso en 12 archivos).

### Fase 3 — Verificación de UX por rol

Login real por navegador (Playwright, no Bearer token) con las 7 cuentas demo: landing
post-login, `RoleBadge`, y **cada** link visible del sidebar correspondiente navegado de
verdad para detectar 403 en su propia carga. El gating de sidebar (`SeguridadShell`,
`roles:[...]`) y landing (`roles.ts`, `LANDING_POR_ROL`) resultaron sólidos — sin rediseño —
pero aparecieron 2 huecos reales de permisos backend (no de diseño de sidebar):

1. `/seguridad/disponibilidad` (visible a cualquier admin, sin `roles:`) heredaba
   `require_b2b_panel_access`, que solo reconoce staff bootstrap o superadmin — los 5 admins de
   área recibían 403 pese a ver el link. Fix: `require_cualquier_admin` (nuevo
   `router_infra` en `analitica/router.py`) — cualquier rol admin vigente, o delega en
   `require_b2b_panel_access` sin duplicarlo (verificado explícitamente que no rompe el consumo
   B2B original del mismo endpoint).
2. `RegaliasAdminPage` (`admin_finanzas`) llama a 2 endpoints `admin_contenido`-only para poblar
   selects (sellos, cuentas de artista) — dropdowns vacíos sin error visible, el tipo de bug más
   difícil de encontrar sin login real por rol. Fix puntual (2 nuevos dependencies que suman
   `admin_finanzas` SOLO a esas 2 lecturas, sin tocar las escrituras admin_contenido-only).

Los 30 informes compuestos (`DEPTO_ROLES`) ya calcaban exactamente
`api/paquetes/reportes/deps.py` — confirmado campo a campo, sin discrepancias. Detalle completo,
con evidencia real (curl antes/después de cada fix) en `docs/VERIFICACION_UX_ROLES.md`.

### Verificación final (las 3 fases)

- `python -m py_compile` limpio en los 12 archivos backend tocados en la sesión.
- `npm run build` limpio en el árbol de trabajo Y en un clon aparte (`git clone` local + `npm ci`
  desde `package-lock.json`) — los 3 errores de tipos de `EngagementPage.tsx` siguen siendo
  preexistentes (confirmado con `git stash` en la tarea S16-P1 de esta misma sesión), no
  relacionados con ningún cambio de esta sesión.
- `docker compose build api frontend-react` exitoso desde el clon aparte (sin levantarlo, para
  no chocar de puertos con el stack ya corriendo del árbol de trabajo) — confirma que no hay
  ningún archivo gitignored del que dependa el build (mismo tipo de bug que ya había aparecido
  una vez en S13-P4 con `package-lock.json`).
- Los 6 servicios del stack de trabajo (`docker compose ps`) siguieron `healthy` durante toda la
  sesión — nunca se usó `down`, solo `up -d --build <servicio>` puntual tras cada cambio de
  frontend y reloads automáticos de `uvicorn --reload` para los cambios de backend.

### Archivos nuevos o modificados

- `api/paquetes/analitica/benchmark_sql.py` — nuevo.
- `api/paquetes/analitica/router.py`, `deps.py` — endpoints de benchmark + `router_infra` +
  `require_cualquier_admin`.
- `api/paquetes/creadores/deps.py`, `router.py`, `api/paquetes/distribucion/router.py` —
  lecturas cross-departamento para Regalías.
- `api/main.py` — registro de `router_infra`.
- `frontend/src/packages/analitica/pages/BenchmarkSqlPage.tsx` + `.module.css` — nuevo.
- `frontend/src/packages/analitica/pages/DashboardPage.tsx` + `.module.css` — KPICard.
- `frontend/src/packages/analitica/pages/{AdquisicionPage,ChurnPage,DisponibilidadInfraPage,
  ReporteDiarioPage,TendenciasPage}.tsx` + `.module.css` — EmptyState.
- `frontend/src/packages/catalogo/pages/AdminTracksPage.tsx` — EmptyState.
- `frontend/src/app/router.tsx`, `src/app/layout/AnalyticaShell.tsx` — ruta y nav de benchmark.
- `docs/BENCHMARK_SQL_VS_GOLD.md`, `docs/VERIFICACION_UX_ROLES.md` — nuevos.

8 commits atómicos a `main`: `feat(analitica): benchmark SQL directo vs Gold pre-agregado`,
`feat(ui): aplicar KPICard en el dashboard operativo de analítica`,
`feat(ui): usar EmptyState consistentemente en analítica y catálogo admin`,
`feat(ui): SkeletonLoader en la pantalla nueva de benchmark SQL vs Gold`,
`docs(validacion): verificación UX por rol + 2 huecos de permisos corregidos`, más este cierre
de bitácora.

---

## S16-P3 — Auditoría de Open Code + cierre de huecos + GOLD_CREADORES_PERIODO (18 ago 2026)

Un prompt anterior corrió con Open Code (no Claude Code) sobre el mismo working directory, sin
commitear: paginación real en 4 endpoints admin (tickets, transacciones recientes, anunciantes,
campañas, strikes), resolución de IDs a nombre/email real en comentarios (`social`) y
suscripciones admin, y fix del doble encabezado en exportación PDF. Este bloque audita ese
trabajo campo por campo contra el diff real (no contra el resumen de texto de Open Code), cierra
los huecos que quedaron sin tocar, y agrega el único ítem de diseño nuevo del prompt: la 14ª
tabla Gold y el KPI de retención de creadores del BSC.

### Auditoría del trabajo de Open Code

Los 5 cambios de paginación (tickets, transacciones-recientes, anunciantes, campañas, strikes) y
los 2 de resolución de IDs (comentarios con JOIN a `FACT_TRACKS`/`DIM_ARTISTS`, suscripciones con
batch a `DIM_USUARIO`) estaban implementados correctamente — verificados con `curl` real
comparando `page=1` vs `page=2` en los 5 endpoints (`data` cambia, `total` es coherente) y
confirmando nombres/emails reales (no vacíos) en comentarios y suscripciones.

**Un bug real encontrado y corregido en la auditoría**: `seguridad/router.py` llamaba
`strikes.activos_global_sql()`, pero la función que Open Code definió en `strikes.py` se llama
`strikes_activos_global_sql` — `AttributeError` en cada request a
`GET /seguridad/admin/strikes` (500 real, no un hallazgo cosmético). El fix del doble encabezado
PDF (`data-pdf-export-ignore="true"` en el `<header>` de `ReportLayout.tsx`) sí estaba aplicado
correctamente.

### Huecos cerrados (Fase 0.4 del prompt)

- **(a) `historial_transacciones` sin paginar**: el prompt original pedía paginar DOS endpoints
  de facturación (`transacciones_recientes` Y `historial_transacciones`/
  `TRANSACCIONES_POR_USUARIO`) — Open Code solo hizo el primero. Se completó con el mismo patrón
  (`LIMIT`/`OFFSET` + `TRANSACCIONES_POR_USUARIO_COUNT`), incluyendo footer de paginación nuevo
  en `AuditoriaFacturacionPage.tsx` para el historial de un usuario buscado. Verificado con curl:
  `usuario_id=test-user` tiene 64 transacciones reales, `page=1` y `page=2` devuelven filas
  distintas.
- **(b) Diagnóstico de márgenes de PDF y lentitud del dashboard táctico** (sin Playwright, por
  instrucción explícita del prompt — solo lectura de código + curl):
  - **Márgenes**: `ExportPDFButton.tsx` fuerza `imgWidthMm = contentWidthMm` siempre (la imagen
    capturada se reescala completa al ancho de página menos márgenes), así que un desborde
    horizontal literal más allá del margen es estructuralmente imposible desde ese código. El
    vector real de "contenido que se pierde" es otro: `RankingTable.module.css` envuelve la
    tabla en `.wrap { overflow-x: auto }` con celdas `white-space: nowrap` — cuando la tabla
    real es más ancha que el contenedor visible, `html2canvas-pro` captura solo la caja visible
    recortada (comportamiento documentado de la librería con `overflow:auto`), no el
    `scrollWidth` completo, así que las columnas que quedan detrás del scroll horizontal
    simplemente no aparecen en el PDF. Afecta a informes con tablas de ranking anchas (muchas
    columnas numéricas); no es un crash, es contenido faltante en el export.
  - **Lentitud**: `GET /dashboard/executive` tardó 6.8s en frío y 0.1s en la segunda llamada —
    tiene `@cached(ttl=60)`. No depende de ningún endpoint de paginación de este prompt: la
    lentitud es el costo de varias agregaciones `COUNT`/`avg` secuenciales sobre ClickHouse en
    la primera llamada de cada ventana de 60s, ya mitigado por el cache existente. Cosmético,
    fuera de alcance de este prompt.
  - **(c) `GET /experiencia/playlists/top-tracks?limit=20`**: verificado con curl real (no solo
    repetir el resumen de Open Code) — 200 OK, `data` con 7 filas reales (Daddy Yankee, Alkaline,
    Paul Kalkbrenner, etc.), no vacío.

### GOLD_CREADORES_PERIODO + KPI "Retención de creadores activos"

Único ítem de diseño nuevo del prompt (el resto del BSC no se tocó — "Respuesta a decisiones
estratégicas" sigue `sin_datos` a propósito, métrica de gobernanza no medible por ningún
pipeline, documentado así desde que existe el BSC de S16-Prompt-05).

Pre-inspección confirmó el esquema real de `FACT_SUBIDA_TRACK` (`cuenta_artista_id`,
`fecha_subida`, `ReplacingMergeTree`) y el patrón compartido de las 13 tablas `GOLD_*_PERIODO`
existentes (`granularidad`/`fecha_inicio`/`periodo`/`es_estimado`/`updated_at`,
`MergeTree ORDER BY (granularidad, fecha_inicio, <dimensión>)`).

**Diseño**: `GOLD_CREADORES_PERIODO` — grano por creador (`cuenta_artista_id`), no un `COUNT` ya
reducido, porque el KPI de retención necesita el CONJUNTO de creadores activos de cada período
para calcular el overlap contra el período anterior (mismo criterio que
`GOLD_API_CONSUMO_PERIODO` con `partner_id`, que ya usa `_kpi_retencion_b2b`). Columnas:
`granularidad`, `fecha_inicio`, `periodo`, `cuenta_artista_id`, `subidas_total` (conteo de
subidas del creador en el período), `es_estimado`, `updated_at`. "Creador activo" = al menos una
fila en `FACT_SUBIDA_TRACK` con `fecha_subida` dentro de la ventana, sin exigir aprobación de la
subida (mide actividad de subida, no throughput de moderación — eso ya lo cubre
`GOLD_CONTENIDO_PERIODO`).

Job de agregación: `etl/gold_ch/creadores.py` (`run_gold_creadores`), mismo patrón que
`api_consumo.py` — se agregó como 13er dominio de `dag_gold_aggregations.py` (65 tareas en
total, 13 dominios × 5 granularidades). `_kpi_retencion_creadores()` en `bsc.py` reemplaza el
`_kpi_sin_datos(...)` anterior: overlap de `groupUniqArray(cuenta_artista_id)` entre trimestre
actual y anterior, sobre el total del trimestre anterior — mismo esquema de semáforo (80/50) y
misma estructura de retorno que `_kpi_retencion_b2b()`.

Corrida real contra el stack (`create_gold_tables.py` vía el contenedor de Airflow, que ya tiene
`etl/` montado en vivo) y verificación directa a `GOLD_CREADORES_PERIODO` (puerto 8124,
granularidad `trimestre`):

| periodo | creadores | subidas |
|---|---|---|
| 2024-Q3 | 8 | 14 |
| 2024-Q4 | 10 | 29 |
| 2025-Q1 | 10 | 27 |
| 2025-Q2 | 9 | 20 |
| 2025-Q3 | 10 | 25 |
| 2025-Q4 | 10 | 18 |
| 2026-Q1 | 9 | 19 |
| 2026-Q2 | 10 | 19 |
| 2026-Q3 | 14 | 47 |

`GET /analitica/bsc/resumen` verificado con curl real: "Retención de creadores activos" ahora
trae `valor_actual: 90.0`, `semaforo: "verde"`, `tendencia: [80.0, 88.9, 90.0, 80.0, 88.9, 90.0]`
— ya no `sin_datos`. "Respuesta a decisiones estratégicas" se mantuvo `sin_datos` sin tocar,
como pedía el prompt explícitamente.

### Verificación

- `npx tsc --noEmit` limpio en el frontend tras los cambios de paginación de `historial_transacciones`.
- Los 5 endpoints paginados de Open Code + el 6º (`historial_transacciones`) verificados con curl
  real, `page=1` vs `page=2` con datos distintos y `total` coherente.
- `strikes.strikes_activos_global_sql()` (bug de Open Code) verificado corregido: `GET
  /seguridad/admin/strikes` devuelve 200 con datos reales tras el fix.
- `GOLD_CREADORES_PERIODO` poblado en las 5 granularidades (`dia`/`semana`/`mes`/`trimestre`/
  `anio`) y verificado con query directa a ClickHouse Gold.
- `GET /analitica/bsc/resumen` verificado con curl: KPI de retención de creadores con datos
  reales, resto del BSC sin regresión (13 KPIs, 1 solo `sin_datos` — el intencional).

### Hallazgos pendientes (fuera de alcance de este prompt)

- **Cosmético**: tablas de ranking anchas (`RankingTable`) pueden perder columnas al exportar a
  PDF por el recorte de `overflow-x:auto` de html2canvas — no es el prompt de esta sesión, pero
  queda documentado para un fix futuro (opciones: capturar `el.scrollWidth` real en vez del
  `clientWidth` visible, o forzar `overflow: visible` temporalmente antes de capturar, como ya
  hace `aplicarTemaClaro` con el tema).
- **Ignorable**: la primera carga de `GET /dashboard/executive` cada 60s tarda ~6.8s (agregaciones
  secuenciales sobre ClickHouse) — ya mitigado por el cache existente, impacto real bajo.
- **Filtros client-side sobre datos paginados**: `PublicidadAdminPage.tsx` filtra
  `campanasFiltradas` (estado/tipo/búsqueda) solo sobre la página actual de `campanasData` — con
  paginación real, los filtros ya no ven las campañas de otras páginas. Preexistente al alcance
  de este prompt (Open Code no lo introdujo, lo hizo más visible), no se tocó.

### Archivos nuevos o modificados

- `api/paquetes/seguridad/router.py` — fix del `AttributeError` en `strikes_activos_global_sql`.
- `api/paquetes/facturacion/queries.py`, `router.py` — paginación de `historial_transacciones`.
- `frontend/src/packages/facturacion/api/facturacion.api.ts`,
  `pages/AuditoriaFacturacionPage.tsx` — paginación del historial de transacciones por usuario.
- `create_gold_tables.py` — DDL de `GOLD_CREADORES_PERIODO` (14ª tabla).
- `etl/gold_ch/creadores.py` — nuevo, job de agregación.
- `etl/dags/dag_gold_aggregations.py` — 13er dominio (`creadores`).
- `api/paquetes/analitica/bsc.py` — `_kpi_retencion_creadores()`, reemplaza el `sin_datos`.
- `docs/BITACORA_S16.md`, `README.md` — este cierre.

Commits atómicos a `main` (paginación de Open Code, fixes de IDs, PDF, huecos cerrados,
`GOLD_CREADORES_PERIODO` + KPI) — ver historial de `git log` para los hashes.

## S16-P4 — Fixes de flujos B2C (F1/F2/F7/F8/F9), glosario español y estados de carga A6+A8 (22 ago 2026)

### Contexto

Sesión de implementación sobre las dos auditorías S16 (lógica de flujos + visual/completitud):
los 5 fixes priorizados F1/F2/F7/F8/F9, un extra de glosario técnico, dos regresiones
detectadas en verificación visual posterior, y el primer tramo del ranking de mejoras
pendientes (A6 estados de carga de Monetización + A8 estados de carga y animaciones de
Analítica), ejecutado con la skill impeccable (registro product).

### Fixes entregados (commits atómicos)

- `f531245` — **T1/F1**: comentarios accesibles desde el detalle del track (`TrackDetailPage`,
  lista + formulario, vuelta al catálogo). Conteo vía API directa para no arrastrar el bundle
  social al paquete catálogo.
- `e320ed9` — **T2/F2**: hub de artista agrupa música, comentarios y ganancias en pestañas
  (`ArtistaHubTabs`), puente ida y vuelta entre `/creadores` y detalle de catálogo.
- `fd0abdb` — **T3/F7**: checkout de método de pago unificado (`FormMetodoPago`) con Luhn y
  dirección fiscal en Mi Plan; elimina la bifurcación legacy.
- `01eb9a4`+`bd5a65e` — **T4/F8**: follow consolidado en el perfil de catálogo
  (`POST /social/seguimiento/{id}`), botón compartir con copiar-enlace, redirect
  `/social/artista/:id` → `/catalogo/artista/:id`, eliminación de `ArtistaSocialPage.tsx`,
  READMEs de los paquetes actualizados. `bd5a65e` corrige el export huérfano del barrel.
- `f5f9df5` — **T5/F9**: feed de actividad clicable hacia el hilo del track —
  `track_fact_id` en el SELECT externo y ambas ramas del UNION (`api/paquetes/social/
  queries.py`), filas de `SeguidosSocialPage` convertidas en Links.
- `f1e73f9` — **Extra**: glosario de atributos técnicos al español con patrón `InfoHint`
  compartido (Baile/Energía/Valencia/Acústica/Habla/Instrumental/En vivo, con término
  original entre paréntesis); renombres en Dashboard/Tendencias/Géneros/Comparación;
  `.featureDesc` muerto eliminado. EtlPage y "Balanced Scorecard" se dejan en inglés a
  propósito (jerga operativa/BI).
- `5bfa2e9` — fix ETL relacionado (bind mount `./etl:/app` para que `portadas_cache.json`
  persista al host).

### Regresiones detectadas en verificación visual (Playwright)

- `1824ade` — el hero de las páginas de detalle recortaba el menú "Compartir"
  (`overflow:hidden` + decorados ::before/::after). Los decorados se movieron a una capa
  `.heroBg` propia (inset 0, overflow oculto propio, border-radius heredado, z-index 0);
  el hero ya no recorta nada ni se desplaza al tabular.
- `6468eb8` — "Ver comentarios" usaba `.btnGhost` (texto blanco calibrado para el gradiente
  del hero) y era invisible en modo claro fuera de él. Nuevo selector compartido
  `.btnBack, .btnGhostPage` + hover con borde primario en `DetailPages.module.css`.

### Estados de carga A6+A8 (impeccable, registro product)

- **A8** `555e678`: los 14 archivos de Analítica usaban paneles `minHeight` vacíos (sin
  pulso, no comunicaban carga). Ahora envuelven `SkeletonChart`/`SkeletonCard` del sistema
  compartido, mismo vocabulario que BalancedScorecard y las tablas admin. Se quitan los tres
  `isAnimationActive={false}` (TrendPanel, DisponibilidadInfra, AudioRadarChart): la
  animación de montura termina antes de cualquier ExportPDF (captura bajo demanda) y el
  precedente BSC ya exportaba bien con transiciones activas.
- **A6** `c3542a9`: MisGanancias, Planes (card activa, grid de planes, métodos) e
  InvoiceDetail mostraban "Cargando…" plano. Ahora anticipan el layout final con
  `SkeletonCard`/`SkeletonLoader`/`SkeletonTableRows`. En InvoiceDetail la toolbar
  (Volver) permanece visible durante la carga.

### Verificación

- `npx tsc --noEmit` limpio y `npm run build` OK (37.8s) tras cada lote.
- Smoke Playwright contra el dev server (:5199) con retardo artificial de red de 2.5s en
  `/app/v1/**` para observar el estado de carga: Planes 4 bloques shimmer (= card activa +
  3 planes) y contenido real después; Mis ganancias 32 (= totalCard + retiro + 5×6 celdas);
  Géneros ciclo completo shimmer→radar SVG; Churn shimmer sostenido; Tendencias línea
  dibujada con animación reactivada; 0 errores JS en todas las pasadas. Capturas en
  `smoke_s17/`.
- Cuentas demo: `usuario@` (flujos B2C) y `superadmin@` (analítica). Hallazgo:
  `analyst@demo` no puede entrar a `/analitica` (suscripción sin activar + email sin
  verificar → gate de onboarding) — gap de datos para demos, no de código.
- InvoiceDetail no se smokeó en runtime (requiere invoice_id real); usa los mismos
  primitivos verificados en las otras páginas.

### Hallazgos pendientes (fuera de alcance de este prompt)

- Quedan "Cargando…" inline en otros paquetes: ingesta ×3, finanzas ×5 tabs/charts,
  partners métricas, admin varios — candidatos a un pase de consistencia igual al A6/A8.
- P12 (recorte de columnas en PDF de rankings anchos) sigue abierto, sin tocar.
- Feed con algunos `fact_id` muertos (filas apuntan a tracks fuera de DIM_TRACKS) y
  portadas de artista 404/503: gaps de datos que restan realismo a los flujos.
- Openspec: sin cambios de spec que sincronizar (estados de carga y fixes de UI no alteran
  requisitos ni comportamiento documentado).

### Archivos nuevos o modificados

- `frontend/src/packages/catalogo/pages/TrackDetailPage.tsx`, `ArtistDetailPage.tsx`,
  `AlbumDetailPage.tsx`, `DetailPages.module.css` — comentarios, hero/.heroBg,
  .btnGhostPage, share.
- `frontend/src/packages/creadores/components/ArtistaHubTabs.tsx` (nuevo),
  `RegaliasPages.module.css` — hub de artista.
- `frontend/src/packages/facturacion/components/FormMetodoPago.tsx`,
  `pages/FacturacionPage.tsx`, `pages/InvoiceDetailPage.tsx` — checkout unificado,
  esqueleto de factura.
- `frontend/src/packages/social/pages/ArtistaSocialPage.tsx` (eliminado),
  `index.ts`, `SeguidosSocialPage.tsx`; `api/paquetes/social/queries.py` — T4/T5.
- `frontend/src/shared/components/InfoHint.tsx` + `.module.css` (nuevos);
  renombres de etiquetas en analitica/regalias/catalogo — glosario.
- `frontend/src/packages/analitica/pages/*` (14 archivos) y
  `components/AudioRadarChart.tsx` — A8.
- `frontend/src/packages/regalias/pages/MisGananciasPage.tsx`,
  `frontend/src/packages/suscripciones/pages/PlanesPage.tsx` — A6.

## S16-P5 — Lote rápido: loaders transversales + gaps de datos de demo (23 ago 2026)

### Contexto

Primera entrega del ranking de mejora post-S16 (ver `docs/PENDIENTES.md` modernizado):
consistencia de estados de carga en el resto del panel (extensión del criterio A6/A8) y los
tres gaps de datos que restaban realismo a las demos. El bloque dinero F3–F6/F10–F13 sigue
**congelado por decisión del stakeholder**.

### Estados de carga consistentes (`2281fe4`, 21 archivos)

- **Ingesta**: `EtlPage` ×3 paneles (historial, distribución, muestra), `DataQualityPage`
  (panel + donut con animación reactivada), `CrudDimensionesPage` — mismos
  `SkeletonChart`/paneles que Analítica.
- **Finanzas**: `ReembolsosTab`/`GastosTab` (colSpan 6), `CuentasTab` (×2, colSpan 5) pasan de
  celda "Cargando…" a `SkeletonTableRows`; `PresupuestoTab` muestra 3 `SkeletonCard` en el
  grid de gauges; animaciones reactivadas en `ReembolsosScatter` (×2), `RadialGauge` e
  `IndicadoresRadar` (captura PDF es bajo demanda, post-animación — mismo criterio A8).
- **Partners**: `PartnersMetricasPage` panel → `SkeletonChart`.
- **Celdas admin inline** ("Cargando…" en `<td>`): AdminSuscripciones, RegaliasAdmin,
  AdminTracks, FamiliasReporte, AbTests, NotificacionesAdmin, Disponibilidad(distribución),
  EmpresaConfig y ProfilePage (×2) → `SkeletonTableRows`/`SkeletonLoader`.
- **Feed con fact_ids muertos** (fallback UI): `TrackSocialPage` distingue 404 de error real —
  un track retirado del catálogo ahora muestra `EmptyState` "Este contenido ya no está
  disponible" en vez de banner rojo + link roto; la conversación se conserva visible.

### Gaps de datos

- **Portadas 404/503**: diagnóstico con muestreo HTTP real — tracks con portada 10/10 URLs
  vivas (spotifycdn), artistas 9/9 vivas (iTunes/Deezer; George Jones incluido); solo 2,5%
  de los 1,61M tracks tiene imagen resuelta, y `AlbumArt` ya degrada con gradiente por
  género + glifo ♪. Conclusión: **no hay fix que hacer** — el ruido observado fue transitorio
  y el fallback UI existía; queda como tarea operativa opcional correr
  `reload_portadas_dag`/`backfill_portadas.py` para ampliar cobertura.
- **`analyst@demo` inservible para demos B2B** (`cb20550`): el gate de `/analitica` exige
  email verificado + suscripción activa y la cuenta sembrada no tenía ninguna de las dos.
  `_activar_analyst_b2b()` en `seed_cuentas_demo.py` ejecuta el flujo real del producto:
  `reenviar-verificacion` → `verificar-email` (tokens simulados), alta de método de pago demo
  (solo metadatos, pasa Luhn) y checkout del plan `basico`. Idempotente en cada compose up.
  Verificado: login aterriza en `/analitica`, `GET /analitica/tendencias` 200, perfil
  `email_verificado=True`, plan activo. `docs/CUENTAS_DEMO.md` actualizado.

### Documentación

- `docs/PENDIENTES.md` reescrito al estado S16 (`62c5d0b`): resueltos marcados (trial +
  plan estudiante ya existían), hallazgos nuevos (A9/A10/A11, R2, gaps), bloque dinero
  congelado anotado, ranking de mejora propuesto.

### Verificación

- `npx tsc --noEmit` limpio tras cada tanda; `npm run build` OK (1m07s).
- Smoke Playwright: analyst entra a `/analitica/tendencias` y renderiza la línea (0 errores
  JS). Capturas previas del lote A6/A8 en `smoke_s17/`.

### Pendientes que quedan

- Cobertura de portadas (operativa, opcional): backfill para ampliar del 2,5% actual.
- Resto del ranking: Biblioteca → R2 → A9/A10/A11 (ver PENDIENTES.md).

## S16-P6 — Rediseño de Biblioteca (A5) + hallazgos de performance del core (23 ago 2026)

### Rediseño (`449d747`)

La pantalla B2C más visitada tras el catálogo era también la más plana (hallazgo A5):
statCards anónimos sin icono arriba, barra de tabs aparte, cambio de tab sin transición y
`// cargando…` en los tres tabs.

- **Chips stat+tab**: los dos controles redundantes se fusionan en uno. Cada chip muestra
  icono lucide con acento propio (favoritos=rojo, playlists=violeta, escuchadas=teal sobre
  tintes `oklch` translúcidos), el conteo real (con skeleton pulsante mientras carga) y ES el
  tab — un solo punto de decisión.
- **Tablist WAI-ARIA completo**: roving tabindex y navegación con ←/→.
- **Transición de panel** fade+slide al cambiar de tab (respetada por el
  `prefers-reduced-motion` global).
- Estados compartidos: `SkeletonLoader`/`SkeletonCard` reemplazan los tres `// cargando…`;
  las cajas `.blocked` rojas pasan a `ErrorState` (patrón único); iconos de EmptyState
  armonizados a lucide.
- Fix copy: "canciónes" → "canciones" (también en PerfilPublicoPage).

Verificado: tsc + build limpios; smoke Playwright como `usuario@demo` — 8 favoritos
renderizados, chips con conteos, 2 playlists ("Mix demo" pública / "Foco total" privada) con
collage, detalle de playlist navegable, historial 5 filas, teclado ← funciona, 0 errores JS.
Capturas en `smoke_biblioteca/`.

### Biblioteca demo con contenido (`4fd11c5`)

`usuario@demo` abría Mi Biblioteca en blanco. El seed ahora siembra 8 favoritos y 2
playlists con tracks reales del catálogo (popularidad ≥85, con portada) vía los endpoints
reales — idempotente.

### Hallazgos de performance del core (documentados, NO corregidos hoy)

- `FACT_TRACKS` tiene `ORDER BY genre_id`: cualquier lookup por `fact_id` o `track_id`
  escanea la tabla completa (~1.6M filas). Consecuencias medidas: `GET /biblioteca/favoritos`
  ~1.4–2.9s caliente (subquery `ga` con IN vacío cuesta sola ~0.5–1s); historial ~0.9s; y
  bajo concurrencia las agregaciones de descubrimiento (top artistas/álbumes, perfil de
  audio) se apilan — se observaron queries de 5 minutos y el threadpool del API quedó
  ahogado hasta reiniciar el contenedor.
- Camino de fix recomendado (infra ETL, requiere coordinación): projection de FACT_TRACKS
  ordenada por `fact_id` (+ otra por `track_id` o reordenar la sorting key), con backfill y
  ajuste del CREATE TABLE del pipeline para que sobreviva recargas. Queda en PENDIENTES.

### Incidente operado durante la sesión

El API dejó de responder por saturación de scans concurrentes (ClickHouse en Docker Desktop,
CPU limitada). Se mataron las 4 queries atascadas vía `KILL QUERY` y se reinició
`tracklytics_api`; login volvió a ~0.5s. Sin pérdida de datos.

## S16-P7 — Hub Facturación/Mi plan, tarjeta realista, Para ti en rails y performance de experiencia resuelta (23 ago 2026)

### Performance del core: fix aplicado (continuación de P6)

El camino recomendado en P6 se ejecutó completo (`1b669aa`):

- **DDL**: `init_clickhouse.py` ahora crea `PROJECTION p_by_fact_id` (SELECT * ORDER BY
  fact_id) y `p_by_track_id` (ORDER BY track_id) sobre FACT_TRACKS. Aplicado en vivo con
  `ALTER TABLE ... ADD PROJECTION` + `MATERIALIZE PROJECTION SETTINGS mutations_sync=2`
  (32s/41s). `portada.py` y `recalificacion.py` rematerializan las projections al terminar.
- **Queries**: FAVORITOS_ACTUALES y HISTORIAL_RECIENTE reescritas como CTEs donde toda
  lectura de FACT_TRACKS lleva predicado IN podable. Medido: favoritos 1.4–2.9s →
  190–440ms; historial ~0.9s → ~390ms; TRACKS_BY_FACT_IDS 314ms; FACT_ID_EXISTS 17ms.
  EXPLAIN confirma poda: 6–7 de 200 granulas.

### Performance de experiencia: Para ti / Mix diario (este lote)

Hallazgo midiendo la UI: GET /experiencia/recomendaciones tardaba **~10.5s** y mix-diario
hasta **~52s frío** — eran exactamente las agregaciones que ahogaron el threadpool en P6.
Causas: JOINs engagement→FACT_TRACKS sin predicate podable (scan de ~1.6M filas por query,
las projections no ayudan a un JOIN), MIX_EXPLORACION con `genre_id NOT IN` (tampoco poda)
agregando ~900k filas, y dedup de catálogo completo para elegir 12 tracks.

Fixes (`api/paquetes/experiencia/{queries,router}.py`, semántica documentada como
equivalente en cada punto):

- **SENALES_USUARIO**: UNA pasada por FACT_ENGAGEMENT_USUARIO deriva favoritos vigentes
  (argMax), escuchados (presencia), perfil, género dominante y candidatos de Redescubre;
  el router los separa en Python (`_senales_usuario`). Las queries viejas se eliminaron.
- **Lookups con IN**: FEATURES_DE_FACT_IDS, GENEROS_DE_FACT_IDS,
  GENERO_DOMINANTE_DE_FACT_IDS y TRACKS_RESUMEN_DE_FACT_IDS consultan FACT_TRACKS por
  {fact_ids} — poda granular vía las projections de P6.
- **POPULARIDAD_MIN_CANDIDATOS = 40**: piso de popularidad para afinidad/populares/mix
  (conserva ~32k de ~74k tracks); la agregación baja proporcionalmente.
- **Mix exploración**: muestreo determinista de 6 géneros ajenos con la MISMA semilla
  (usuario+fecha) → `genre_id IN {...}` poda; el mix del día sigue estable.
- **Paralelización**: señales independientes corren en ThreadPoolExecutor; el muro pasó
  a ser la query más lenta, no la suma.

Medido tras reiniciar el API: recomendaciones 10.5s → **~2–4.5s** (máquina ruidosa; el
resto es la agregación de catálogo + inserts de impresiones), mix-diario 52.6s →
**1.3–2.0s**. Smoke UI: Para ti renderiza las 3 miradas con sus carriles, 0 errores JS.

### Frontend

- **Para ti rediseñado** (pedido "mejóralo, organizalo mejor, agrega algo más"):
  carriles horizontales con snap (vocabulario de rails del catálogo), tarjeta con portada,
  overlay de play y chip de motivo con acento por género; chips de filtro por género
  client-side; skeleton rail; stagger de entrada respetando prefers-reduced-motion.
- **Hub Facturación ⇄ Mi plan** (pedido explícito): FacturacionPage gana tablist con dos
  chips (icono lucide, roving tabindex con ←/→) y `?tab=plan` deep-linkable. PlanesPage se
  monta embebida ocultando su cabecera propia — toda su lógica quedó intacta (bloque
  dinero F3–F6/F10–F13 sin tocar).
- **FormMetodoPago realista**: tarjeta visual en vivo sobre el formulario (marca inferida
  visa/mastercard/amex/discover, grupos del número formateados con los ya escritos más
  brillantes, titular/expiración reflejados al instante, flip 3D al dorso al enfocar el
  CVV, banda magnética + franja de firma + caja CVV). Grid 2 columnas. Verificado con
  Playwright: frente/dorso, deep-link del hub, h1 único, 0 errores JS.

### Nota operativa nueva

`tracklytics_frontend_react` sirve el dist COPIADO dentro de la imagen (sin volumen ni
watcher): tras cada build hace falta
`docker cp frontend/dist/. tracklytics_frontend_react:/usr/share/nginx/html/` o rebuild.
Quedó anotado en PENDIENTES como brecha operativa.

---

## S16-P8 — Feedback de stakeholder: hub invertido, tarjeta por bloques, estudiante, Para ti arrastrable, Perfil hero (23 ago 2026)

Lote dirigido por feedback directo del stakeholder sobre lo entregado en P7. El bloque
dinero sigue CONGELADO en lógica (F3–F6/F10–F13): todo lo de este lote es presentación,
flujo de UI y validación cliente — ninguna mutación financiera nueva.

### Hub invertido: Suscripciones vuelve a ser principal, Facturación acoplada

En P7 el hub quedó al revés de lo que el stakeholder quería (Facturación principal con
"Mi plan" embebida). Se invirtió: `/suscripciones` renderiza "Mi plan" (PlanesPage,
dueña del hub) y Facturación es una TAB acoplada dentro del mismo page shell
("Mi plan" con Crown / "Facturación" con CreditCard, roving ←/→, `?tab=facturacion`
deep-linkable). FacturacionPage se adelgazó: perdió sus tabs y ahora expone
`{ embebido }` para ocultar su h1 cuando vive dentro de Suscripciones. La ruta vieja
`/facturacion` redirige a `/suscripciones?tab=facturacion` (Navigate bajo RequireAuth).
Nav secundaria limpiada: "Facturación" y "Mis ganancias" salieron de NAV_SECONDARY —
llegan por sus dueños reales (Suscripciones y Creadores), no repetidas en el menú.

### Formulario de método de pago armonizado (pedido explícito)

FormMetodoPago reorganizado en dos bloques etiquetados — "Datos de la tarjeta" y
"Dirección de facturación" — cada uno con su grid 2 columnas. Validaciones EN VIVO
mientras se tipea: número (Luhn ≥12 dígitos → hint verde "Número válido"), expiración
(rango MM válido + no vencida) y CVV (largo según marca, amex=4); estados fieldHintOk
(verde + Check) vs fieldHintSoft (neutro mientras falta completar). Chip de marca junto
al label del número. La tarjeta visual flip 3D de P7 se conserva intacta encima.
Verificado: chip VISA al tipear 4242…, hints correctos, flip al enfocar CVV.

### Verificación de plan Estudiante (flujo en vivo)

El CTA de estudiante ya no confirma a ciegas: wizard de 2 pasos embebido en el confirmForm
(solo en el camino "Suscribirme", usuarios sin suscripción activa). Paso 1: correo
institucional con hint en vivo (regex + debe contener ".edu") que habilita Continuar;
Paso 2: zona de comprobante (pdf/jpg/png ≤5MB, chip con nombre de archivo) + nota de
revisión ≤24h; el submit queda deshabilitado hasta completar ambos pasos y su texto pasa
a "Enviar solicitud". Es simulación cliente: el endpoint vigente solo recibe
email_institucional; el comprobante es evidencia local del paso (pendiente real de
backend anotado).

### Para ti arrastrable + planes vivos + Perfil hero

- Rails de Para ti adoptan el patrón de arrastre del catálogo (`useDragScroll`): sin
  scrollbar visible, sin snap, cursor grab, pointer-events off mientras arrastra.
- Grid de planes con vida: stagger de entrada (delay idx*90ms), hover lift, Premium
  destacado con filete de gradiente y badge "Más popular".
- Perfil rediseñado como página viva: hero de identidad (avatar con iniciales, nombre,
  email, chips de rol/plan, stat tiles "Miembro desde"/"País"), títulos de sección
  con icono lucide, paneles con entrada escalonada y hover; danger zone animada;
  respeta prefers-reduced-motion. Link de facturas apunta al nuevo deep-link.

### Verificación (Playwright, smoke completo verde)

NAV sin duplicados · H1 "Mi plan" · tabs [Mi plan|Facturación] · badge "Más popular"
· `?tab=facturacion` ida y vuelta · redirect /facturacion · secciones del formulario ·
chip VISA · hint número · flip CVV · wizard estudiante completo (hint email, paso 2,
submit bloqueado sin comprobante) · rails {drag:true, scrollbar oculto, 12 tarjetas} ·
perfil hero · 0 errores JS. Capturas en `smoke_p8/`.

Hallazgo operativo: el API devuelve 401 transitorio esporádico bajo carga y el api-client
limpia sesión → redirect a /login. Los smokes ahora reintentan re-inyectando sesión;
queda observado (no reproducible a demanda, no bloqueante).

---

## S16-P9 — R2: analítica propia del artista + transiciones transversales capa 2 (23 ago 2026)

Feature nueva pedida por el stakeholder (R2 del ranking): el artista hoy solo ve streams
LIQUIDADOS (regalías, con retraso de ciclo); le faltaba ver lo que pasa HOY con su música.
Se cubre el hueco que CuentaArtistaPage tenía documentado desde F2 ("no existe endpoint de
likes/plays por track propio").

### Backend: `GET /app/v1/creadores/mi-analitica`

En `creadores` (su dominio natural, no analitica — ese módulo es B2B/staff). Gating con el
criterio de mis-ganancias: cuenta de artista aprobada o **403**. Devuelve `{data:{totales,
serie, tracks}}`:

- `ANALITICA_ARTISTA_POR_TRACK` (`queries.py`): UNA pasada por FACT_ENGAGEMENT_USUARIO con
  `fact_id IN {fact_ids:Array(UInt64)}` (mismo patrón IN podable de S16-P7) → plays
  (countIf reproduccion), likes, favoritos NETOS (favorito_add − favorito_remove, saldo por
  track) y oyentes únicos (uniqIf user_id).
- `ANALITICA_ARTISTA_SERIE`: plays por día, últimos 30 días, misma poda.
- Solo subidas promovidas a FACT_TRACKS tienen engagement posible; sin ellas responde en
  ceros. Tracks ordenados por plays desc.

### Frontend: tab "Analítica" en el hub de creadores

`ArtistaHubVista` gana `analitica` (`/creadores?vista=analitica`, deep-linkable). El panel
nuevo (`PanelAnaliticaArtista`) muestra: 4 KPIs (streams totales, oyentes únicos, likes,
favoritos netos), gráfico de área recharts con la serie de 30 días y tabla por track.
Skeleton mientras carga, empty states para "sin tracks publicados" y "sin reproducciones",
mensaje de degradación si una revalidación falla con datos ya en pantalla. El gating 403 no
se ve nunca como error: los usuarios sin cuenta aprobada ni llegan al panel (la página solo
monta el hub cuando hay cuenta aprobada).

### Transiciones transversales — capa 2

El flip 3D y los rails arrastrables eran la capa 1; esta añade dos patrones globales:

- **Reveal-on-scroll**: hook compartido `useReveal.ts` (IntersectionObserver, se desconecta
  tras revelar) + clases globales `.reveal-base` / `.reveal-in` en index.css. Con
  prefers-reduced-motion el hook agrega la clase inmediatamente (el guard global anula la
  transition) y el contenido nunca queda oculto. Aplicado al panel de analítica (KPIs,
  gráfico y tabla se revelan al entrar en viewport).
- **Count-up**: ya existía `useCountUp.ts` (S16 Fase 3, hero de catálogo/Acerca de) — NO se
  reescribió; se reaprovechó en dos sitios nuevos: KPIs del panel de analítica y los valores
  de MisGananciasPage (saldo disponible + total acumulado artista/sello).

Nota de proceso: al crear el hook nuevo se pisó accidentalmente el `useCountUp` existente;
detectado por tsc (AboutPage/KPICard rompían), restaurado desde git SIN cambios — los
consumidores previos quedaron intactos y el existente ya aceptaba undefined durante carga.

### Hallazgo operativo (bug latente anotado)

Un usuario registrado directo en PocketBase (sin pasar por `/seguridad/auth/registro`) no
tiene fila espejo en DIM_USUARIO; `EMAIL_VERIFICADO_USUARIO` es un agregado SIN GROUP BY y
ClickHouse devuelve una fila igualmente (valor default 0) → `require_email_verificado` lo
bloquea con 403 aunque jamás se haya verificado nada. Afecta a cualquier flujo de prueba con
usuarios crudos; el registro real de la app sí crea el espejo. Quedó en PENDIENTES (no se
arregló aquí: tocar seguridad escapa al alcance del lote).

### Verificación (Playwright, smoke verde)

E2E real completo antes de UI: usuario→cuenta→aprobación admin→track promovido
(fact_id 14100017)→engagement sintético→endpoint. Smoke UI: tabs [Música|Analítica|
Comentarios|Ganancias], deep-link `?vista=analitica`, KPIs finales exactos vs API
(29/1/1/0), gráfico renderizado, tabla ordenada por plays, reveal activo (los bloques bajo
el pliegue esperan scroll), ganancias con count-up, usuario sin cuenta ve su formulario de
solicitud, 0 errores JS. Captura en `smoke_p9/`.

### Hotfix posterior al lote — el hallazgo se arregla en caliente

El bug del espejo no quedó solo anotado: se arregló ese mismo día en
`seguridad/queries.py`. `EMAIL_VERIFICADO_USUARIO` ahora agrupa por `usuario_id`, de modo
que un usuario sin espejo produce **cero filas** y el dep falla abierto (mismo criterio que
`_rechazar_si_cuenta_inactiva` cuando no hay estado: la ausencia de información no bloquea).
Un espejo real con `email_verificado=0` sigue bloqueando exactamente igual — la verificación
genuina no se afloja. Verificado E2E en ambas direcciones con usuarios frescos: sin espejo
sube tracks OK; con espejo en 0 recibe el 403 `email_no_verificado` correcto.

Observación adicional capturada durante la prueba: si una cuenta se crea y se aprueba dentro
del MISMO segundo, `argMax(estado_cuenta, actualizado_en)` puede empatar y leer el estado
viejo (flap pendiente/aprobada). No se tocó: DateTime tiene resolución de segundos y en uso
real las aprobaciones ocurren minutos después; solo afecta scripts automatizados muy rápidos.

## S16-P10 — Cierre de brechas P2 + hallazgos S16 abiertos (23 ago 2026)

### Auditoría previa: la mayoría ya estaba resuelta

Antes de tocar código se auditó (Explore, contra el código real, no contra `PENDIENTES.md`)
el estado de las 8 brechas P2 y los 3 hallazgos A9/A10/A11. Resultado: **búsqueda unificada**
(`GET /catalogo/search`, tracks+artistas+álbumes+playlists en paralelo con `asyncio.gather`),
**radio/mix diario** (`/experiencia/radio/track/{fact_id}`, `/experiencia/mix-diario`),
**recomendaciones por similitud real** (`RECOMENDACIONES_POR_AFINIDAD`/`RADIO_POR_TRACK`/
`MIX_AFINIDAD` — distancia euclidiana sobre audio features, no heurística), **export GDPR**
(`api/paquetes/seguridad/exportacion.py` + endpoint), y los tres hallazgos **A9** (funnel con
filtros de fecha en vivo), **A10** (simulación con inputs editables) y **A11** (finanzas ya
usa 100% tokens `var(--color-*)`) ya estaban implementados en código — `PENDIENTES.md` no se
había actualizado tras los lotes que los cerraron. Lo mismo con "Loaders restantes" y "Gaps de
datos": ambos resueltos en S16-P5 (`2281fe4`, `cb20550`), confirmado en el árbol de trabajo
actual (`SkeletonTableRows`/`SkeletonChart` presentes, `TrackSocialPage` con `EmptyState` para
404, `analyst@demo` con plan+email verificado). `docs/PENDIENTES.md` se corrigió con la
evidencia (archivo:línea) en vez de re-implementar nada de esto.

Lo que sí faltaba de verdad, y se implementó en este lote:

### 1. Preferencias de notificación — opt-out por tipo

Tabla nueva `DIM_PREFERENCIA_NOTIFICACION` (`ReplacingMergeTree` por `actualizado_en`,
`ORDER BY (usuario_id, tipo)`) — modelo **opt-out**: ausencia de fila = activo, para no
requerir que cada usuario existente "opte por entrar" a algo que ya recibía.
`GET/PUT /social/notificaciones/preferencias[/{tipo}]` (`social/router.py`).
`notificaciones.crear()`/`crear_para_seguidores_de_artista()` (`social/notificaciones.py`)
ahora consultan la preferencia ANTES de insertar — `crear_para_seguidores_de_artista` filtra
en una sola query batch (`PREFERENCIAS_DESACTIVADAS_DE_USUARIOS` con `usuario_ids IN`), no
una consulta por seguidor. Frontend: ícono de engranaje nuevo en `NotificationBell` abre un
mini-panel con toggle por los 3 tipos existentes (`nuevo_track_artista_seguido`,
`comentario_en_tu_contenido`, `nuevo_colaborador_playlist`).

### 2. Verificación de email — envío real (antes simulado)

`docker-compose.yml` gana el servicio `mailpit` (imagen `axllent/mailpit`, SMTP sin auth en
1025, bandeja web en `:8025`) — no requiere credenciales de un proveedor real para que el
flujo sea real de punta a punta en local. `api/core/email.py` (`enviar()`, nunca lanza —
un fallo de SMTP no debe tumbar un registro/login real, mismo criterio que `audit.record`).
`/auth/registro` y `/auth/reenviar-verificacion` (`seguridad/router.py`) ahora envían el
correo real ADEMÁS de seguir devolviendo el token en la respuesta (conveniencia de demo,
consumida por `VerificacionEmailBanner.tsx` y por `seed_cuentas_demo.py`). Verificado E2E:
registro real → `GET :8025/api/v1/messages` trae el mensaje real con el token correcto.

### 3. Comprobante de estudiante real (antes solo el campo `email_institucional`)

El checkout de `estudiante` sigue autoservido por dominio de email (regla de negocio ya
decidida, sin tocar) — esto es un canal AUDITABLE aparte. Tabla nueva
`SOLICITUD_VERIFICACION_ESTUDIANTE` (`MergeTree`, `estado` mutado in-place vía `ALTER
UPDATE`, mismo patrón que `leido` en `FACT_NOTIFICACION`). `POST
/suscripciones/estudiante/comprobante` (multipart, `admin_comercial`-adjacent pero abierto a
cualquier usuario autenticado): valida dominio institucional, extensión (pdf/jpg/jpeg/png) y
tamaño (≤5MB), guarda el archivo a `api/uploads/comprobantes_estudiante/` (persistido al host
vía el bind mount `./api:/app` ya existente, gitignored). `GET .../mi-solicitud` para el
usuario; `GET/PATCH /suscripciones/admin/estudiante/solicitudes[...]` (`admin_comercial`)
para aprobar/rechazar. `apiClient` ganó `postForm()` (el `request()` existente fuerza
`Content-Type: application/json` siempre, incompatible con el boundary de un `FormData`).
`PlanesPage.tsx`: el paso 2 del wizard de estudiante ahora sube el archivo real ANTES de
confirmar el plan (`subirComprobante.mutateAsync`, si falla no se llega a confirmar).
`AdminSuscripcionesPage.tsx` gana una sección nueva de revisión (filtro por estado,
aprobar/rechazar). Verificado E2E con curl: subida real → archivo confirmado en disco →
admin lista pendientes → aprueba → estado actualizado.

### 4. Shuffle inteligente (radio y mix diario ya existían; shuffle no)

`shuffleQueue()` en `PlayerContext.tsx`: Fisher-Yates sobre la cola restante + una pasada de
"declumping" que evita dos tracks consecutivos del MISMO artista (busca el próximo índice con
artista distinto y lo intercambia) — la diferencia real entre un shuffle "inteligente" y
`Math.random()` uniforme, que sí puede repetir artista por azar. Botón "Mezclar" nuevo en
`QueuePanel` (visible con 2+ tracks en cola).

### Verificación

- `python -m py_compile` limpio en los 7 archivos backend tocados.
- `npx tsc --noEmit` y `npm run build` limpios (31s), sin regresión en los bundles existentes.
- DDL aplicado en vivo (`init_clickhouse.py` vía el contenedor `api`, `MSYS_NO_PATHCONV=1`
  para la ruta `/tmp` — quirk ya documentado): las 2 tablas nuevas confirmadas con
  `DESCRIBE TABLE`. El único error del run (`FACT_TRACKS`, sintaxis `PROJECTION` inline) es
  preexistente y no relacionado — la tabla ya tiene las projections aplicadas en vivo desde
  S16-P7, el script solo falla al re-parsear el `CREATE TABLE IF NOT EXISTS` completo antes
  de comprobar que la tabla ya existe.
- `docker compose up -d mailpit api` (recreate de `api` por las env vars SMTP nuevas) —
  ambos `healthy`/`Up` sin tocar el resto del stack.
- E2E real contra el stack (curl, no descrito): registro → email real en Mailpit; login →
  preferencias por defecto (los 3 tipos `activo:true`) → PUT opt-out → GET refleja el cambio;
  subida de comprobante → archivo real en `api/uploads/` → admin lista/aprueba.
- Sin Playwright en este lote (instrucción explícita del prompt: no gastar tokens en
  verificación por imágenes) — la verificación fue build limpio + curl real end-to-end.

### Documentación

- `docs/PENDIENTES.md`: reescrito con evidencia real de qué ya estaba resuelto (archivo:línea)
  vs. qué se implementó en este lote; ranking de mejora actualizado.

### Archivos nuevos o modificados

- `init_clickhouse.py` — `DIM_PREFERENCIA_NOTIFICACION`, `SOLICITUD_VERIFICACION_ESTUDIANTE`.
- `api/paquetes/social/queries.py`, `notificaciones.py`, `router.py` — preferencias opt-out.
- `api/core/email.py` (nuevo), `api/core/config.py` — SMTP.
- `api/paquetes/seguridad/router.py` — envío real en registro/reenvío.
- `api/paquetes/suscripciones/router.py` — comprobante de estudiante (subida + admin).
- `.gitignore` — `api/uploads/`.
- `docker-compose.yml` — servicio `mailpit`, env SMTP en `api`.
- `README.md` — Mailpit en la tabla de servicios.
- `frontend/src/shared/lib/api-client.ts` — `apiClient.postForm()`.
- `frontend/src/shared/context/PlayerContext.tsx` — `shuffleQueue()`.
- `frontend/src/shared/components/QueuePanel.tsx`, `.module.css`, `PlayerBar.tsx` — botón Mezclar.
- `frontend/src/packages/social/api/social.api.ts`,
  `components/NotificationBell.tsx`, `.module.css` — preferencias de notificación.
- `frontend/src/packages/suscripciones/api/suscripciones.api.ts`,
  `pages/PlanesPage.tsx`, `pages/AdminSuscripcionesPage.tsx` — comprobante real.
- `frontend/src/packages/seguridad/components/VerificacionEmailBanner.tsx` — copy actualizado.
- `docs/PENDIENTES.md`, `docs/BITACORA_S16.md` — este cierre.

---

## S16-P10 ronda 2 - Producto P2: co-ocurrencia, radio en todas las superficies, shuffle persistente, suggest de busqueda y hotfix de notificaciones (23 ago 2026)

Segunda pasada sobre las brechas P2 con verificacion Playwright end-to-end (esta vez si, contra
el stack levantado tras la caida de Docker).

### Backend

- **Recomendaciones por co-ocurrencia** (experiencia): query nueva
  CO_REPRODUCIDOS_DE_SEMILLAS (CTEs semillas -> colegas, dedup por track+artista quedando
  el maximo de oyentes, excluidos/popularidad_min/synthetic iguales al resto de secciones,
  limit_colegas = min(limit*4, 48)). Integrada en obtener_recomendaciones como seccion
  "escuchadas_por_tu_gente" ("Escuchadas por tu gente", motivo "quienes comparten tus gustos
  lo estan escuchando"), en paralelo con las otras via max_workers 4->5. Pipeline CTE medido
  en 0.54s; endpoint completo con 4 secciones en ~2s.
- **Hotfix PREFERENCIAS_DESACTIVADAS_DE_USUARIOS** (social/queries.py): llevaba
  ORDER BY n.fecha_creacion DESC con alias inexistente (copy-paste de NOTIFICACIONES_ADMIN)
  -> ClickHouse rechazaba la query -> sin try/except en el helper, TODA creacion de
  notificacion/comentario devolvia 500 desde que entro el opt-out. Fix: ORDER BY fuera (queda
  LIMIT 200). Verificado E2E: POST /social/comentarios 201 (antes 500 garantizado).
- **Dump GDPR ampliado** (seguridad/exportacion.py): agrega 
otificaciones (ultimas 200) y
  preferencias_notificacion (argMax activo por tipo) a la exportacion de datos personales.

### Frontend

- **Shuffle persistente** (PlayerContext.tsx + PlayerBar.tsx): modo aleatorio permanente
  (shuffleMode + ref para closures largos) que elige indice aleatorio en cada dvanceQueue
  con anti-racha por artista; boton con ria-pressed junto al repeat. Diferencia con el
  Mezclar one-shot de QueuePanel (Fisher-Yates puntual, ya existia).
- **Radio en todas las superficies**: boton en TrackGridCard (overlay, esquina inferior,
  con stopPropagation), en LibraryTrackRow y en el hero de TrackDetailPage. Todos
  reutilizan useRadio().iniciarRadio(factId) (auth-prompt/toast/playList centralizados).
- **Suggest del buscador global** (GlobalSearch.tsx): dropdown as-you-type con debounce
  250ms reutilizando /search con limit chico (tracks x4, artistas x2, albumes x2, playlists
  x1), combobox/listbox ARIA, Escape/outside-click, atajo "/" intacto, "Ver todos los
  resultados" navega a /buscar.
- **"Ver mas" por grupo** (SearchResultsPage.tsx): ?grupo=canciones|artistas|albumes|
  playlists amplia ese grupo a 20 resultados con navegacion de vuelta; links "Ver mas ->"
  por seccion en la vista completa.
- **PreferenciasNotificacion extraido** a componente compartido
  (social/components/PreferenciasNotificacion.tsx, exporta TIPO_LABEL): la campanita lo usa
  igual que antes y ProfilePage gana seccion "Notificaciones" como ajuste de cuenta. Misma
  query key -> cambiar un switch en un lugar se refleja en el otro.

### Verificacion (Playwright, _smoke_p10.mjs, borrado tras correr)

- PARA TI muestra las 4 secciones incluyendo "Escuchadas por tu gente" (12 items).
- Suggest renderiza items para "love"; "Ver mas" de artistas llega con h1 correcto.
- Detalle de track muestra "Iniciar radio"; al pulsarlo arranca reproduccion y aparece el
  PlayerBar; toggle Aleatorio pasa a "(activado)".
- Perfil muestra la seccion Notificaciones con los 3 tipos.
- 0 errores JS de pagina en todo el recorrido. 	sc --noEmit + 
pm run build limpios;
  deploy via docker cp dist/. tracklytics_frontend_react:/usr/share/nginx/html/.

Nota operativa: entrar por / con localStorage recien inyectado dispara peticiones anonimas
cuyo interceptor 401 hace clearSession() y borra la sesion recien seteada - en smokes,
inyectar sesion con ddInitScript (corre antes del boot en cada navegacion).

### Archivos nuevos o modificados

- pi/paquetes/experiencia/queries.py, outer.py - CO_REPRODUCIDOS_DE_SEMILLAS + seccion.
- pi/paquetes/social/queries.py - hotfix ORDER BY.
- pi/paquetes/seguridad/exportacion.py - GDPR ampliada.
- rontend/src/shared/context/PlayerContext.tsx, components/PlayerBar.tsx - shuffle mode.
- rontend/src/packages/catalogo/components/GlobalSearch.tsx + css,
  pages/SearchResultsPage.tsx + css, components/TrackGridCard.tsx + css,
  components/LibraryTrackRow.tsx, pages/TrackDetailPage.tsx.
- rontend/src/packages/social/components/PreferenciasNotificacion.tsx (nuevo),
  components/NotificationBell.tsx, packages/seguridad/pages/ProfilePage.tsx.
- docs/PENDIENTES.md, docs/BITACORA_S16.md - este cierre.
