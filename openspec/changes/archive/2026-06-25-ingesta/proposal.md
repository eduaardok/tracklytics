## Why

OE3 (Expansión Continua sobre Infraestructura Cloud) exige un pipeline de ingesta idempotente, auditable y de alto rendimiento, capaz de sostener el crecimiento del catálogo (de ~114k a ~1.6M registros durante el semestre) sin afectar la disponibilidad del sistema. Hoy no existe una interfaz operativa para que el Lead Data Engineer dispare, monitoree y audite la integración de nuevos lotes desde fuentes externas de streaming musical, ni para administrar las dimensiones del catálogo.

## What Changes

- Disparo de la ejecución de una ingesta de catálogo desde la interfaz de gestión, identificando el período/lote a integrar.
- Monitoreo en tiempo real del estado de cada etapa del pipeline (extracción, transformación a staging, carga a ClickHouse).
- Control de idempotencia: verificación de si un período/lote ya fue cargado antes de insertar, evitando duplicación salvo recarga forzada explícita.
- Registro de cada ejecución con timestamp, período, registros leídos/insertados/rechazados y duración total.
- Consulta del historial completo de cargas con sus métricas de calidad (tasa de rechazo, duración) e indicador de la última carga.
- Señalización de cargas con tasa de rechazo superior al 1% como pendientes de revisión.
- Administración CRUD de las tablas de dimensión del catálogo, manteniendo la tabla de hechos como solo lectura desde la interfaz de gestión (solo se actualiza vía el pipeline de ingesta).
- Confirmación explícita al eliminar un valor de dimensión referenciado por la tabla de hechos.

## Capabilities

### New Capabilities
- `ingesta`: ejecución, monitoreo y auditoría de la integración de nuevos lotes de datos del catálogo musical desde fuentes externas de streaming, con control de idempotencia y calidad, y administración CRUD de las dimensiones técnicas del catálogo.

### Modified Capabilities
(ninguna; no se modifican requisitos de capabilities existentes)

## Impact

- **ClickHouse**: escritura controlada por el pipeline de ingesta sobre FACT_TRACKS, las 11 dimensiones técnicas, STG_RAW_TRACKS, ETL_LOGS, ETL_BATCH_CONTROL; lectura para auditoría e historial de cargas.
- **PocketBase**: fuente origen de los datos de catálogo (inmutable), sin escritura desde esta capability.
- **Pipeline ETL**: Python (pandas, pyarrow, clickhouse-connect) orquestado con Airflow.
- **FastAPI**: nuevos endpoints de disparo, monitoreo, auditoría de cargas y CRUD de dimensiones.
- **Frontend**: nueva interfaz de gestión para el Lead Data Engineer.
