## Why

Los 30 informes compuestos (capability `reportes`) solo podían filtrarse por semana ISO y solo cubrían 12 semanas de historia — `etl/gold_ch/base.py::periodo_sql()` calculaba siempre `'%G-W%V'` y `PERIODOS_VENTANA = 12` era la única ventana soportada en toda la capa Gold. Un Lead de departamento que quisiera ver una tendencia de 6 meses o comparar años no podía: la capa de agregación no tenía el grano ni la historia para responder esa pregunta.

## What Changes

- **`etl/gold_ch/base.py`**: modelo de período parametrizado por granularidad (`dia`/`semana`/`mes`/`trimestre`/`anio`), con horizonte propio por granularidad (90/52/24/8/3 períodos respectivamente) y una ventana de origen única (`VENTANA_ORIGEN_DIAS = 1095`) que reemplaza los `INTERVAL 90 DAY`/`180 DAY` dispersos en los 12 módulos.
- **Las 12 tablas `GOLD_*_PERIODO`**: dos columnas nuevas (`granularidad`, `fecha_inicio`), `ORDER BY` reordenado para empezar por ellas. `periodo` se conserva como etiqueta legible. `GOLD_ETL_LOG` suma `granularidad`.
- **Los 12 módulos de `etl/gold_ch/`** y el DAG `dag_gold_aggregations`: cada dominio corre una vez por granularidad (12×5 = 60 tareas). El relleno demo (`rng_for`, `es_estimado=1`) se acota a los 12 períodos más recientes de cada granularidad — los períodos más antiguos sin dato real no se escriben, en vez de inventar historia hacia atrás.
- **Excepción documentada**: la proyección por regresión lineal de `GOLD_CONSUMO_GENERO_PERIODO` (OT-18) solo se calcula para granularidad `semana`; para las demás, las columnas de proyección quedan en 0/vacío.
- **API (`api/paquetes/reportes/`)**: los 30 endpoints aceptan `granularidad` opcional (default `semana`, compatible hacia atrás — sin ese parámetro la respuesta es idéntica a antes de este cambio). Endpoint nuevo `GET /app/v1/reportes/compuestos/_meta/periodos` para que el frontend (bloque siguiente) liste períodos reales disponibles por tabla/granularidad.

## Capabilities

### Modified Capabilities

- `reportes`: grano temporal configurable (día/semana/mes/trimestre/año) en vez de semana fija; ventana de historia más larga; relleno demo acotado a los períodos recientes; nuevo endpoint de metadatos de períodos.

## Impact

- **Código ETL**: `etl/gold_ch/base.py` (reescrito), los 12 módulos de `etl/gold_ch/*.py`, `etl/dags/dag_gold_aggregations.py`, `create_gold_tables.py` (DDL + flag `GOLD_RECREATE`).
- **Código API**: `api/paquetes/reportes/queries.py`, `api/paquetes/reportes/router.py`.
- **Datos**: las 13 tablas `GOLD_*` de `tracklytics_gold` se recrean desde cero (capa 100% derivada, sin backfill — se repueblan corriendo el DAG). El catálogo (`tracklytics`, 8123) no se toca.
- **Frontend**: sin cambios en este bloque — el selector de granularidad es el bloque siguiente (S14-P3). La API es compatible hacia atrás, así que el frontend actual sigue funcionando sin modificaciones.
- **Compatibilidad**: ningún endpoint cambia de contrato para un llamador que no manda `granularidad` — mismo comportamiento que antes de S14-P2.
