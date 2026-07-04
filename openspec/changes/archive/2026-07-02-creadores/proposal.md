## Why

Hoy todo el catálogo de tracks proviene únicamente de la carga por lotes (`ingesta`/`gestion_datos`) sobre el dataset base de streaming. No existe ningún camino para que un usuario final se convierta en creador de contenido y publique su propia música dentro de la plataforma — una pieza central del modelo de negocio (data flywheel B2C) que hoy queda fuera de alcance de cualquier capability existente. `creadores` cierra ese vacío con dos niveles de aprobación administrativa: primero la cuenta de artista, luego cada track que ese artista publica.

## What Changes

- Nueva capability `creadores`: solicitud de cuenta de artista, aprobación/rechazo de esa cuenta por `admin`, subida de tracks por artistas con cuenta aprobada, y aprobación/rechazo de cada track por `admin` con promoción real a `FACT_TRACKS` al aprobar.
- 4 tablas nuevas en ClickHouse: `DIM_CUENTA_ARTISTA`, `FACT_SUBIDA_TRACK`, `DIM_ESTADO_REVISION`, `STG_ARTIST_UPLOADS`.
- **BREAKING**: `FACT_TRACKS.is_synthetic` (boolean) se reemplaza por `source_type` (marca de origen de 3 valores, el tercero introducido por esta capability para el contenido publicado por artistas). Ambos campos no conviven — se migra en el mismo cambio que toca `FACT_TRACKS` por primera vez desde una capability de negocio, según ya quedó decidido en `docs/decisiones-refactorizacion.md` (sección 7). Todo lector existente de `is_synthetic` se migra en este mismo cambio (`catalogo`, `biblioteca`, `gestion_datos`, ETL de carga) — ver design.md.
- Auditoría de ambas aprobaciones (cuenta y track) vía `FACT_AUDIT_LOG`, reutilizando `paquetes.seguridad.audit.record`.
- Autorización admin reutilizando `paquetes.seguridad.deps.require_admin`.
- Paquete backend `api/paquetes/creadores/` (mismo patrón que `seguridad`/`facturacion`) y frontend `frontend/src/packages/creadores/` completado en esta misma ronda.

## Capabilities

### New Capabilities
- `creadores`: solicitud y aprobación de cuenta de artista, subida y aprobación de tracks individuales, con promoción a `FACT_TRACKS` marcada como `source_type='user_uploaded'`.

### Modified Capabilities
- `analitica`: los agregados de atributos de audio (energy, danceability, valence, tempo, loudness, speechiness, acousticness, instrumentalness, liveness) del dashboard de KPIs, perfil de audio por género, comparación de artistas, benchmark de género y tendencias semanales pasan a excluir tracks `source_type='user_uploaded'` — sus atributos de audio son valores por defecto sin análisis real (ver design.md), no mediciones, y de lo contrario distorsionarían exactamente el caso de uso de benchmarking B2B al que sirve esta capability. El conteo de tracks y la popularidad promedio no cambian — siguen incluyendo todo el catálogo.

## Impact

- **ClickHouse**: 4 tablas nuevas (`init_clickhouse.py`); columna `source_type` en `FACT_TRACKS` reemplazando `is_synthetic`.
- **Backend — paquete nuevo**: `api/paquetes/creadores/` (deps, queries, router, promoción a `FACT_TRACKS`), montado en `api/main.py`.
- **Backend — renombre `is_synthetic`→`source_type` en paquetes existentes** (mecánico, preserva el comportamiento actual, no cambia ningún requirement ya especificado en sus spec.md — ver design.md): `api/paquetes/catalogo/queries.py`, `api/paquetes/biblioteca/queries.py`, `api/paquetes/gestion_datos/queries.py`.
- **ETL**: `etl/gold/loader.py`, `etl/gold/synthetic.py` escriben `source_type` en vez de `is_synthetic` al cargar `FACT_TRACKS`.
- **Backend — `analitica`**: `api/paquetes/analitica/queries.py` (las consultas realmente montadas en `router.py`: `DASHBOARD_KPIS`, `GENRE_AUDIO_PROFILE_V1`, `ARTIST_AUDIO_STATS_V1`, `TENDENCIAS_LOAD_WEEK`, `DASHBOARD_AUDIO_AVG`) excluyen `source_type='user_uploaded'` de sus promedios de atributos de audio vía `avgIf(...)`, sin tocar conteos ni `avg_popularity`. Las queries no montadas en `router.py` (`GENRES_TRENDS`, `GENRE_AUDIO_PROFILE`, `TRENDS_WEEKLY`, `ARTIST_STATS`, `ARTIST_GENRE_BENCHMARKS`) son código muerto ya existente y no se tocan en este cambio.
- **Frontend**: `frontend/src/packages/creadores/` (hoy stub) pasa a implementación completa — formularios de solicitud/subida para artista, panel de aprobación para admin.
- **Dependencias cruzadas**: reutiliza `core.deps.get_current_user`, `paquetes.seguridad.deps.require_admin` y `paquetes.seguridad.audit.record` — no se duplica infraestructura de auth ni auditoría.
- **Salvaguarda mínima en `ingesta`**: `_truncate_fact_tables` (en `api/paquetes/gestion_datos/router.py`, invocada por `/etl/clear` y por cada disparo de `ingesta`) deja de vaciar `FACT_TRACKS` sin condición; pasa a preservar las filas `source_type='user_uploaded'` (ver design.md, "Preservación de tracks `user_uploaded`"). No se modifica nada más del pipeline batch (`run_gold`/`run_synthetic` siguen igual).
