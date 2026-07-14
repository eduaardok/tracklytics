## 1. ETL: asignación determinista de año y país

- [x] 1.1 Crear `etl/gold/enriquecimiento.py` con `asignar_release_year(album_id: int) -> int` — hash estable de `album_id` (`hashlib.sha256` o `zlib.crc32`, no `random` sin semilla) mapeado a una distribución ponderada hacia décadas recientes, rango 1950–año actual.
- [x] 1.2 Agregar `asignar_country(artist_id: int) -> str` en el mismo módulo — hash estable de `artist_id` mapeado a una lista ponderada de países con industria musical relevante (reutilizar/extender la lista de países ya existente en el proyecto si aplica, ej. `DIM_REGION`/`FACT_DISPONIBILIDAD` o el catálogo de países de `distribucion`, en vez de inventar una nueva).
- [x] 1.3 Modificar `etl/gold/loader.py` (creación de `DIM_ALBUMS`, línea ~186) para usar `asignar_release_year(album_id)` en vez de `0`.
- [x] 1.4 Modificar `etl/gold/loader.py` (creación de `DIM_ARTISTS`, línea ~209) para usar `asignar_country(artist_id)` en vez de `""`.
- [x] 1.5 Test rápido: correr `asignar_release_year`/`asignar_country` dos veces con el mismo id y confirmar que devuelven el mismo valor (idempotencia).

## 2. ETL: perfil de audio empírico por género

- [x] 2.1 En `etl/gold/enriquecimiento.py`, agregar `calcular_perfiles_por_genero(client) -> dict[int, dict]` — agrupa por `genre_id` los tracks con `source_type = 'real'` en `FACT_TRACKS` y arma, por género, el pool de valores reales de `energy`, `danceability`, `acousticness`, `instrumentalness`, `valence`, `tempo` (mismo criterio que el modo `empirical` ya existente en `synthetic.py`, pero agrupado por género en vez de global). Definir un umbral mínimo de tracks por género (ej. 30) bajo el cual ese género no tiene perfil propio.
- [x] 2.2 Modificar `etl/gold/synthetic.py` para que, cuando a un track se le asigna un `genre_id`, sus características de audio se remuestreen del pool de `calcular_perfiles_por_genero` correspondiente a ese género (si existe perfil) en vez del pool global — reordenar la generación actual (hoy genera features y género por separado, líneas ~125-173) para que el género se asigne primero y las features dependan de él.
- [x] 2.3 Si el género no tiene perfil propio (bajo el umbral de 2.1), usar el pool global como respaldo (comportamiento actual).

## 3. Airflow: DAG de recalificación

- [x] 3.1 Crear `etl/gold/recalificacion.py` con `run_recalificacion(**context)`: (a) selecciona `DIM_ALBUMS`/`DIM_ARTISTS` con `release_year = 0` o `country = ''` y les aplica `asignar_release_year`/`asignar_country` en batches (mínimo 50.000 filas o el total si es menor); (b) selecciona tracks de `FACT_TRACKS` con `source_type != 'real'` cuyo perfil de audio se desvíe del perfil de su género (ej. fuera de un rango de percentiles del pool de `calcular_perfiles_por_genero`) y los recalibra vía `ALTER TABLE ... UPDATE`; (c) nunca toca filas con `source_type = 'real'`; (d) registra en `ETL_LOGS` cuántos álbumes/artistas/tracks corrigió y la duración total.
- [x] 3.2 Crear `etl/dags/recalificacion_dag.py` — DAG independiente `tracklytics_recalificacion`, `schedule_interval=None`, mismo patrón que `etl/dags/engagement_dag.py`, una sola tarea `task_recalificacion` que llama a `run_recalificacion`.

## 4. API: endpoint administrativo de recalificación

- [x] 4.1 En `api/paquetes/gestion_datos/router.py`, agregar `POST /app/v1/ingesta/recalificacion` (en `v1_router`, protegido por `require_lead_data_engineer` como el resto del router) que dispara `tracklytics_recalificacion` vía la API de Airflow, reutilizando el mismo mecanismo de lock de `_trigger_guarded` (evitar dos recalificaciones concurrentes) pero apuntando al nuevo DAG en vez de `AIRFLOW_DAG`.
- [x] 4.2 Agregar `GET /app/v1/ingesta/recalificacion/{ejecucion_id}` para consultar el estado, mismo patrón que `estado_ejecucion` (línea ~419).

## 5. Frontend: acción de recalificación en el panel de ingesta

- [x] 5.1 En `frontend/src/packages/ingesta/api/ingesta.api.ts`, agregar `dispararRecalificacion()` y `estadoRecalificacion(ejecucionId)` apuntando a los endpoints de la tarea 4.
- [x] 5.2 En `frontend/src/packages/ingesta/pages/EtlPage.tsx`, agregar una sección/botón "Recalificar catálogo" (mismo patrón visual que "Disparar ingesta"), con su propio estado de polling de progreso y mensaje de resultado (cuántos registros se corrigieron).

## 6. API: perfil por género también en `creadores`

- [x] 6.1 En `api/paquetes/creadores/queries.py`, agregar una query que calcule, para un `genre_id` dado, el promedio de `energy`/`danceability`/`acousticness`/`instrumentalness`/`valence`/`tempo` sobre `FACT_TRACKS` con `source_type = 'real'` de ese género (y el conteo de tracks usados), más una variante sin filtro de género para el perfil general de respaldo.
- [x] 6.2 En `api/paquetes/creadores/promocion.py`, agregar `perfil_audio_por_genero(genre_id: int) -> dict` que use esa query: si el género tiene al menos el umbral mínimo de tracks (mismo umbral que `etl/gold/enriquecimiento.py`, tarea 2.1), retorna el promedio por género; si no, retorna el promedio general del catálogo. Mantiene el resto de `NEUTRAL_AUDIO_DEFAULTS` (key, mode, loudness, speechiness, liveness, time_signature) sin cambios — son atributos que la spec ya declara sin análisis de audio real, el ajuste por género aplica solo a las 6 características cubiertas por el perfil empírico.
- [x] 6.3 En `api/paquetes/creadores/router.py::subir_track`, reemplazar el uso directo de `NEUTRAL_AUDIO_DEFAULTS` para esas 6 características por el resultado de `perfil_audio_por_genero(body.genre_id)`.

## 7. Specs y verificación

- [x] 7.1 Sincronizar las delta specs de `ingesta` y `creadores` (`openspec-sync-specs`) hacia `openspec/specs/ingesta/spec.md` y `openspec/specs/creadores/spec.md`, incluyendo la fila de trazabilidad CU-O79 (recalificación administrativa) y acotando la sección "Fuera de alcance" de `ingesta` (ya no excluye enriquecimiento basado en el propio catálogo real, solo enriquecimiento desde fuentes externas nuevas).
- [x] 7.2 Verificar con una carga real (`docker compose up`, disparar una ingesta de una semana sintética nueva) que los álbumes/artistas nuevos ya no quedan con `release_year = 0` / `country = ''`, y que una muestra de tracks por género cae dentro del rango esperado de su perfil.
- [x] 7.3 Disparar la recalificación sobre el catálogo ya existente y confirmar en ClickHouse que bajó el conteo de álbumes/artistas con año/país sin informar, sin alterar ninguna fila `source_type = 'real'`, y que también corrigió tracks `user_uploaded` incoherentes.
- [x] 7.4 Subir un track real como artista de prueba (con una cuenta de artista aprobada) para un género con perfil propio y confirmar que sus características de audio caen dentro del perfil de ese género, no en el valor neutro fijo anterior.
