## Why

Tracklytics tenía 27 informes simples (uno por objetivo táctico, OT-01 a OT-35), pero el enunciado del programa pide además 30 informes **compuestos**: vistas que cruzan varias dimensiones/métricas de un mismo departamento en un solo reporte (ej. MRR + ARR + margen neto + estado de resultados en una sola vista financiera, en vez de cuatro informes sueltos). Calcular esos cruces en vivo contra el catálogo (ClickHouse `tracklytics`, 8123) en cada request sería costoso y arriesgaría la integridad del dato operativo (RT-01: nunca escribir en el catálogo). Se necesita una capa de agregación precalculada, separada físicamente del catálogo, más un paquete de API nuevo que sirva esos 30 informes.

## What Changes

- **Capability nueva `reportes`**: 30 endpoints de solo lectura bajo `GET /app/v1/reportes/compuestos/<departamento>/<informe>`, agrupados en 9 departamentos (Comercial, Tecnología, Financiero, Ingeniería de Datos, Analítica y BI, Contenido y A&R, Comunidad y Soporte, Seguridad, Producto), cada uno gateado por rol administrativo departamental (`require_rol_admin`, `superadmin` siempre pasa).
- **Infraestructura de soporte (dependencia, no una capability de negocio)**: segunda instancia de ClickHouse ("Gold", puerto 8124, base `tracklytics_gold`) con 13 tablas `GOLD_*` (`periodo` ISO-semana + `updated_at` + `es_estimado`), alimentadas por un DAG de Airflow (`dag_gold_aggregations`) que lee el catálogo (8123, solo lectura) y escribe en Gold de forma idempotente (`DELETE` + `INSERT` por período). Política "real primero, demo después": cada tabla intenta la agregación real; solo si el hecho fuente no existe en el catálogo se completa con datos determinísticos (`seed` fija) marcados `es_estimado=1` — nunca se fabrica silenciosamente.
- **Frontend**: 6 plantillas reutilizables (`ReportLayout`, `KpiCards`, `TrendChart`, `RankingTable`, `DistributionChart`, `PredictionChart`) + hook `useCompoundReport` + 30 configuraciones agrupadas por departamento (no 30 páginas monolíticas) + submenú "Informes Compuestos" en el sidebar admin.

## Capabilities

### New Capabilities

- `reportes`: 30 informes compuestos de solo lectura sobre la capa Gold, uno por objetivo del mapa de `docs/OBJETIVOS_TRACKLYTICS.md`, gateados por rol administrativo departamental.

### Modified Capabilities

(ninguna — `reportes` no modifica el contrato de ninguna capability existente; lee de una base de datos nueva, no de las tablas de negocio de `catalogo`/`facturacion`/etc.)

## Impact

- **Código backend**: paquete nuevo `api/paquetes/reportes/` (`router.py` con los 30 handlers, `queries.py` con `fetch_gold` — único punto de lectura, siempre contra `tracklytics_gold`, nunca contra el catálogo —, `schemas.py` con el formato de respuesta estándar, `deps.py` con el gating por rol departamental); módulo `api/core/database_gold.py` (segunda conexión ClickHouse); `create_gold_tables.py`/`init_clickhouse_gold.py` (DDL + init con retry/backoff); `etl/gold_ch/` (12 módulos de agregación) + `etl/dags/dag_gold_aggregations.py`.
- **Datos**: base ClickHouse nueva `tracklytics_gold` (contenedor `clickhouse-gold`, puerto 8124) — 13 tablas `GOLD_*`. **El catálogo (`tracklytics`, 8123) no se modifica ni en esquema ni en datos.**
- **Frontend**: 6 componentes plantilla + 1 hook + 30 configuraciones + 1 página genérica + 1 ruta dinámica (`/reportes/:departamento/:informe`) + submenú de sidebar de 9 grupos.
- **Compatibilidad**: ningún endpoint ni tabla existente cambia de contrato. Es 100% aditivo.
