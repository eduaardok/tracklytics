## 1. Infraestructura Gold (dependencia)

- [x] 1.1 Segunda instancia ClickHouse (`clickhouse-gold`, puerto 8124, base `tracklytics_gold`) en `docker-compose.yml`
- [x] 1.2 `api/core/database_gold.py` — cliente de conexión propio, independiente del catálogo
- [x] 1.3 `init_clickhouse_gold.py` con retry + backoff (3 intentos, 5s) — corrige carrera del healthcheck nativo (puerto 9000) vs. interfaz HTTP (8123 interno)
- [x] 1.4 `create_gold_tables.py` — 13 `CREATE TABLE IF NOT EXISTS` (`GOLD_ADQUISICION_PERIODO`, `GOLD_API_CONSUMO_PERIODO`, `GOLD_INFRAESTRUCTURA_PERIODO`, `GOLD_FINANCIERO_PERIODO`, `GOLD_REGALIAS_PERIODO`, `GOLD_PIPELINE_PERIODO`, `GOLD_ENGAGEMENT_PERIODO`, `GOLD_CONSUMO_GENERO_PERIODO`, `GOLD_CONTENIDO_PERIODO`, `GOLD_COMUNIDAD_PERIODO`, `GOLD_SEGURIDAD_PERIODO`, `GOLD_PRODUCTO_PERIODO`, `GOLD_ETL_LOG`)

## 2. DAG de agregación

- [x] 2.1 `etl/dags/dag_gold_aggregations.py` — 12 `PythonOperator` independientes, `schedule_interval=None` (disparo manual)
- [x] 2.2 `etl/gold_ch/base.py` — `periodo_sql` (ISO-semana), `write_gold` (DELETE+INSERT idempotente por período), `log_run`, `rng_for` (seed determinística por demo-fill)
- [x] 2.3 12 módulos de agregación (`adquisicion`, `api_consumo`, `infraestructura`, `financiero`, `regalias`, `pipeline`, `engagement`, `consumo_genero`, `contenido`, `comunidad`, `seguridad`, `producto`) — cada uno real-primero, demo-relleno solo donde el hecho fuente no existe en el catálogo
- [x] 2.4 Verificación de idempotencia: dos corridas consecutivas producen el mismo conteo de filas (excepto `GOLD_ETL_LOG`, append-only por diseño)

## 3. Backend `reportes`

- [x] 3.1 Paquete `api/paquetes/reportes/` (`router.py`, `queries.py`, `schemas.py`, `deps.py`)
- [x] 3.2 `fetch_gold()` — único punto de lectura, siempre `tracklytics_gold`, filtro opcional por rango de período
- [x] 3.3 `armar_respuesta()` — formato estándar (`informe`, `objetivo`, `titulo`, `departamento`, `periodo_inicio/fin`, `datos`, `resumen`)
- [x] 3.4 30 endpoints `GET /app/v1/reportes/compuestos/<departamento>/<informe>`, uno por objetivo táctico
- [x] 3.5 Gating por rol administrativo departamental (`require_rol_admin`), `superadmin` siempre pasa
- [x] 3.6 Los 30 endpoints verificados con curl real: 200 con `datos` no vacío autenticado, 401 sin token

## 4. Frontend `reportes`

- [x] 4.1 6 componentes plantilla en `shared/components/reportes/` (`ReportLayout`, `KpiCards`, `TrendChart`, `RankingTable`, `DistributionChart`, `PredictionChart`)
- [x] 4.2 Hook `useCompoundReport` — trae el informe completo una vez (react-query), filtra período en cliente
- [x] 4.3 30 configuraciones (`departamento`/`informe`/`codigo`/`labelCorto`/`render`) agrupadas en 9 archivos por departamento, servidas por una única ruta genérica `/reportes/:departamento/:informe` (no 30 páginas monolíticas)
- [x] 4.4 Submenú "Informes Compuestos" en el sidebar admin (9 grupos colapsables), separado del registro pesado de componentes (`informesNav.ts` liviano) para no inflar el bundle principal
- [x] 4.5 `npm run build` verde; verificación visual con Playwright (sidebar, filtro de período, badge "Datos estimados", 0 errores de consola)

## 5. Documentación

- [x] 5.1 `docs/BITACORA_S13.md` — decisiones de P3a (tablas, DAG, endpoints, campos no fabricados) y P3b (plantillas, hook, rutas, verificación visual)
- [x] 5.2 README.md actualizado con las nuevas rutas
