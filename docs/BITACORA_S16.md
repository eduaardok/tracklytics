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
