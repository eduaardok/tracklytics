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
