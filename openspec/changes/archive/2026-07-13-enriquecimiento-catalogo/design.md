## Context

Hoy, al crear `DIM_ALBUMS`/`DIM_ARTISTS` (`etl/gold/loader.py`), `release_year` y `country` quedan en un valor no informativo (`0` / cadena vacía) — no hay ninguna lógica que les asigne un valor plausible. Del lado de `FACT_TRACKS`, las características de audio de los registros que se integran en cada nuevo lote (`etl/gold/synthetic.py`) se generan contra una única distribución global (uniforme, normal o remuestreada de los tracks reales), y el género se asigna de forma independiente — no hay ninguna correlación entre el perfil de audio resultante y el género asignado.

Ambas tablas viven en ClickHouse (son parte del modelo dimensional técnico del catálogo). PocketBase no participa en este enriquecimiento: solo contiene el dataset de origen inmutable, no las dimensiones derivadas que arma el pipeline.

El mismo problema de coherencia por género existe también en `creadores`: cuando un artista sube un track (`POST /creadores/tracks`), sus características de audio de partida se toman hoy de `NEUTRAL_AUDIO_DEFAULTS`, un valor fijo idéntico sin importar el género elegido (`api/paquetes/creadores/promocion.py`). Es el mismo hueco de calidad, en un segundo punto de entrada al catálogo.

## Goals / Non-Goals

**Goals:**
- Que `release_year` y `country` de álbumes/artistas nuevos tomen valores plausibles y estables (mismo álbum/artista → mismo valor si se vuelve a calcular).
- Que las características de audio de tracks nuevos sean coherentes con el género que se les asigna, usando el propio catálogo real ya integrado como referencia (sin depender de una fuente externa nueva).
- Dar al Lead Data Engineer una acción explícita para corregir en bloque los registros ya cargados que quedaron con año/país no informativo o un perfil de audio incoherente con su género.
- Que un track subido por un artista (`creadores`) también arranque con un perfil de audio coherente con su género, no un valor neutro fijo.
- Mantener la regla ya vigente de que la tabla de hechos del catálogo nunca se edita directo desde la interfaz de gestión — la recalificación pasa por el pipeline, igual que cualquier otra carga.

**Non-Goals:**
- No se busca biografía real verificable por artista (fecha de debut real, país real documentado) — es un valor plausible dentro de rangos y distribuciones realistas de la industria, igual que el resto del catálogo simulado.
- No se agrega ninguna fuente de datos externa nueva (API de terceros, scraping) para resolver año/país — ver `Fuera de alcance` de la spec de `ingesta`.
- No se toca la lógica de portada real (`etl/gold/portada.py`) ni el pipeline de resolución de imágenes — es un enriquecimiento independiente.

## Decisions

### 1. Asignación de año/país: determinista por hash, no aleatoria pura
`release_year` se deriva de un hash estable del `album_id` (o `artist_id` para `country`), mapeado a una distribución ponderada hacia décadas recientes (coherente con la forma real de un catálogo de streaming, donde la mayoría del volumen es música reciente) dentro de un rango 1950–año actual. `country` se deriva igual, mapeado contra una lista ponderada de países con industria musical relevante.

**Alternativa descartada**: asignar con `random.choice()` sin semilla — se descartó porque una recalificación posterior (o una segunda corrida del pipeline) le cambiaría el año/país a un álbum que ya lo tenía asignado, rompiendo la idempotencia que ya exige la spec de `ingesta` para el resto del pipeline.

### 2. Perfil de audio por género: empírico, calculado sobre el catálogo real ya integrado
Antes de generar características de audio para tracks nuevos, se calcula (agrupado por `genre_id`) la distribución empírica de `energy`, `danceability`, `acousticness`, `instrumentalness`, `valence`, `tempo` sobre los tracks ya integrados desde la fuente de origen (no sobre lotes previos ya corregidos, para no propagar error). Los tracks nuevos remuestrean sus características desde el bucket de su propio género, en vez de un pool global.

**Alternativa descartada**: definir manualmente un perfil fijo por género (tabla de referencia hardcodeada tipo "rock → energy alto"). Se descartó porque el catálogo real ya integrado es una fuente de verdad más rica y específica que una tabla de reglas escrita a mano, y se mantiene consistente aunque cambie la composición de géneros del catálogo.

`api/paquetes/creadores/promocion.py::subir_track` corre en el contenedor de la API, no en el de ETL, y este proyecto ya mantiene lógica intencionalmente duplicada entre `api/` y `etl/` en vez de compartir un entorno Python (mismo criterio que la liquidación de regalías, replicada en `api/paquetes/regalias/router.py` y `etl/gold/regalias_liquidacion.py`). Se aplica el mismo criterio aquí: la API calcula el perfil por género con una consulta propia y liviana directo a ClickHouse (promedio de las 6 características por `genre_id` sobre `source_type='real'`, mismo umbral mínimo de muestra), en vez de importar el módulo de ETL.

### 3. Recalificación administrativa como DAG independiente, no como CRUD directo
La acción de recalificación se expone como un nuevo DAG de Airflow (`tracklytics_recalificacion`), siguiendo el mismo patrón ya usado para tareas de mantenimiento independientes del pipeline principal (sincronización de playlists, generación de engagement). El nuevo endpoint administrativo dispara este DAG (mismo mecanismo de `POST /etl/trigger` ya existente: llamada a la API de Airflow con el lock de ejecución concurrente) en vez de exponer un `UPDATE` directo sobre `FACT_TRACKS` desde la interfaz de gestión.

**Alternativa descartada**: extender el CRUD genérico de dimensiones (`PUT /dim/{table}/{record_id}`) para que también acepte recalificación masiva. Se descartó porque ese endpoint edita un registro a la vez y no aplica a `FACT_TRACKS` (de solo lectura desde la interfaz por requirement ya vigente); la recalificación es una operación de pipeline, no una edición puntual.

### 4. Alcance de la recalificación: solo registros no reales
La recalificación (tanto la que corre al integrar lotes nuevos como la pasada administrativa sobre el catálogo existente) nunca toca los ~114k registros de la fuente de origen (`source_type = 'real'`) — esos ya traen su propio año, país y perfil de audio genuinos. Solo aplica sobre álbumes/artistas con valor no informativo y sobre tracks de lotes integrados posteriormente.

## Risks / Trade-offs

- **[Riesgo]** Recalificar `FACT_TRACKS` a escala (potencialmente cientos de miles de filas) vía `ALTER TABLE ... UPDATE` puede acumular una cola de mutaciones grande en ClickHouse. → **Mitigación**: igual que el resto del pipeline, se procesa en batches (mínimo 50.000 filas) y se registra el resultado en `ETL_LOGS`, consistente con el requirement de rendimiento ya vigente en `ingesta`.
- **[Riesgo]** Un género con muy pocos tracks reales asociados no tiene suficiente muestra empírica para remuestrear un perfil confiable. → **Mitigación**: si el bucket de un género tiene menos de un umbral mínimo de tracks reales, se usa el perfil global como respaldo (mismo comportamiento que hoy, solo para ese caso borde).
- **[Trade-off]** Año/país plausibles no son biográficamente reales — aceptado explícitamente en Non-Goals, coherente con que el resto del catálogo ya es una simulación académica del negocio, no un dataset verificado.
