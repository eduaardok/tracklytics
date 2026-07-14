## Why

El catálogo tiene dos huecos de calidad que afectan directamente a los casos de uso de analítica y exploración: los álbumes y artistas no traen año de lanzamiento ni país de origen reales (quedan en un valor vacío/no informativo), y las características de audio (energía, bailabilidad, acústica, etc.) de los lotes que se van integrando no guardan relación con el género musical que se les asigna — un track de un género enérgico puede terminar con un perfil de audio típico de una balada. Esto le resta credibilidad al catálogo de cara a Cliente B2B / Data Analyst-BI Lead (comparativas por género, tendencias temporales, perfiles de audio) y no hay hoy ninguna vía para que el Lead Data Engineer corrija en bloque los registros ya cargados que quedaron con esos datos poco realistas.

## What Changes

- **Enriquecimiento de año y país al integrar nuevos álbumes/artistas**: cuando la ingesta crea un álbum o artista nuevo, el sistema asigna un año de lanzamiento y un país de origen con valores plausibles (dentro de rangos y distribuciones reales de la industria musical), en vez de dejar el campo vacío o en cero.
- **Coherencia entre características de audio y género musical**: cuando la ingesta integra nuevos registros de tracks, sus características de audio (energía, bailabilidad, acústica, instrumentalidad, valencia, tempo) SHALL calibrarse contra el perfil típico del género musical asignado a ese track, en vez de generarse de forma independiente al género.
- **Recalificación administrativa del catálogo existente**: nueva acción para el Lead Data Engineer que dispara, a través del pipeline de ingesta (no como edición directa de la tabla de hechos), una pasada de corrección sobre registros ya cargados que quedaron con año/país no informativo o con un perfil de audio incoherente respecto a su género — dejando registro auditable del resultado (cuántos registros se corrigieron). Esta pasada también corrige, con el mismo criterio de perfil por género, los tracks subidos por artistas (`source_type='user_uploaded'`).
- **Valores por defecto por género al subir un track**: cuando un artista sube un track nuevo, sus características de audio de partida SHALL calibrarse contra el perfil típico del género elegido (mismo perfil empírico por género que usa la ingesta), en vez de un valor neutro fijo idéntico para cualquier género.

## Capabilities

### New Capabilities
(ninguna)

### Modified Capabilities
- `ingesta`: se agregan tres requirements — asignación de año/país plausibles al crear dimensiones de álbum/artista, calibración de características de audio por género al integrar tracks, y una nueva acción administrativa de recalificación en bloque del catálogo existente (CU-O79). El requirement "Fuera de alcance" que hoy excluye explícitamente "enriquecimiento externo" se acota para permitir este enriquecimiento basado en el propio catálogo real ya integrado (no una fuente externa nueva).
- `creadores`: el valor de partida de las características de audio al subir un track (hoy un `NEUTRAL_AUDIO_DEFAULTS` fijo) pasa a calibrarse contra el perfil empírico del género elegido, con el mismo criterio de respaldo al perfil global si el género no tiene muestra suficiente. Amplía el requirement existente de subida de track (CU-O26), sin agregar un CU-O nuevo.

## Impact

- **ETL** (`etl/gold/loader.py`, `etl/gold/synthetic.py`, `etl/gold/enriquecimiento.py` nuevo): lógica de asignación de año/país al crear `DIM_ALBUMS`/`DIM_ARTISTS`; generación de características de audio calibrada por género (perfil empírico por género calculado sobre los tracks reales ya integrados) en vez de un pool global.
- **API** (`api/paquetes/gestion_datos/`): nuevo endpoint administrativo para disparar la recalificación en bloque, reutilizando el mecanismo de ejecución/monitoreo de ingesta ya existente (CU-O13) en vez de exponer un CRUD directo sobre la tabla de hechos.
- **API** (`api/paquetes/creadores/promocion.py`, `api/paquetes/creadores/router.py`): `subir_track` consulta el perfil empírico del género elegido (misma fuente que usa el pipeline) en vez de aplicar `NEUTRAL_AUDIO_DEFAULTS` fijo; se conserva como respaldo si el género no tiene muestra suficiente.
- **ClickHouse**: `DIM_ALBUMS.release_year`, `DIM_ARTISTS.country`, y las columnas de características de audio de `FACT_TRACKS` para los registros afectados (incluidos los `user_uploaded`).
- **Airflow**: el DAG de ingesta gana un modo de recalificación además del modo de carga normal.
