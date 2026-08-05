## 1. `etl/gold_ch/base.py` — granularidades

- [x] 1.1 `GRANULARIDADES`, `HORIZONTE_POR_GRANULARIDAD`, `VENTANA_ORIGEN_DIAS`, `PERIODOS_RELLENO_DEMO`
- [x] 1.2 `periodo_sql(col, granularidad='semana')` — 5 expresiones ClickHouse (día/semana/mes/trimestre/año)
- [x] 1.3 `fecha_inicio_sql(col, granularidad='semana')` — expresión `Date` por granularidad
- [x] 1.4 `periodos_ventana(granularidad)` — reemplaza `iso_weeks_back()`, devuelve `(etiqueta, fecha_inicio)`
- [x] 1.5 `permite_relleno_demo(etiquetas, periodo)` — acota el relleno demo a los `PERIODOS_RELLENO_DEMO` períodos más recientes
- [x] 1.6 `write_gold(...)`/`log_run(...)` — filtro y registro por `granularidad`

## 2. `create_gold_tables.py` — DDL

- [x] 2.1 Columnas `granularidad`/`fecha_inicio` en las 12 tablas `GOLD_*_PERIODO`, `ORDER BY` reordenado
- [x] 2.2 `granularidad` en `GOLD_ETL_LOG`
- [x] 2.3 Flag `GOLD_RECREATE=1` — `DROP TABLE IF EXISTS` controlado antes de recrear

## 3. Los 12 módulos de agregación + DAG

- [x] 3.1 Cada `run_gold_<dominio>(granularidad='semana')` usa `periodos_ventana`/`permite_relleno_demo`/`VENTANA_ORIGEN_DIAS`
- [x] 3.2 Excepción de proyecciones en `consumo_genero.py` (solo `granularidad == 'semana'`)
- [x] 3.3 Multiplicador de MRR por granularidad en `financiero.py` (adaptación no pedida explícitamente, necesaria para que el número tenga sentido fuera de grano semanal)
- [x] 3.4 `dag_gold_aggregations.py` — 60 tareas (12 dominios × 5 granularidades) vía `op_kwargs`

## 4. API `reportes`

- [x] 4.1 `queries._rango_where`/`fetch_gold` — filtro por `granularidad` + `fecha_inicio`, resolución de etiquetas por subconsulta
- [x] 4.2 30 handlers de `router.py` con `granularidad` opcional (default `semana`)
- [x] 4.3 Endpoint `GET /_meta/periodos?tabla=&granularidad=`

## 5. Verificación

- [x] 5.1 `GOLD_RECREATE=1` — 13 tablas recreadas
- [x] 5.2 DAG disparado, 60 tareas en verde
- [x] 5.3 ClickHouse Gold: filas por granularidad, `fecha_inicio` coherente con `periodo`
- [x] 5.4 `curl` con y sin `granularidad` — compatibilidad hacia atrás confirmada
- [x] 5.5 `npm run build` verde (frontend no tocado en este bloque)
