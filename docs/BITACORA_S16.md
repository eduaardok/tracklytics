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
