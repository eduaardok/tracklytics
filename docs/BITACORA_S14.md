# Bitácora de Desarrollo — Semana 14
**Proyecto:** Tracklytics v2 — Plataforma de Analítica Musical
**Semana académica:** 14 de 16

---

## S14-P1 — Extensión de portadas (playlists/artistas/géneros) + detección de featuring + carga background 9h (30 jul 2026)

Modo autónomo: se decidió y documentó sin pausar a preguntar. S13 se cerró explícitamente en su propio último prompt (S13-P4, "cierre de semana") — esta entrada abre `BITACORA_S14.md` tal como indicaba la regla del enunciado para ese caso.

### Fase 0 — Inspección previa (hallazgos reales vs. premisas del enunciado)

El enunciado describía la arquitectura de portadas de memoria de sesiones anteriores; varios detalles habían cambiado o nunca fueron exactamente así. Se documenta lo real ANTES de escribir código, como pedía la Fase 0:

**1. `etl/gold/portada.py` — cómo resuelve y cómo cachea (con una corrección importante).**
- Resolución por canción: oEmbed público de Spotify (`open.spotify.com/oembed`) por `track_id` real — sin ambigüedad, es un lookup por ID. Respaldo (álbumes/artistas): iTunes Search API y Deezer Search API, sin API key, orden de intento invertido entre entidades (Deezer primero para álbumes, iTunes primero para artistas — asimetría de tasa de éxito confirmada en producción).
- Rate limit real: `_BACKFILL_CONCURRENCY = 1` (secuencial — concurrencia=10 disparó un bloqueo temporal por IP en producción, no solo un límite de ráfaga), `_OEMBED_PAUSA_ENTRE_REQUESTS_S = 1.5` entre requests exitosos, backoff exponencial (base 10s, tope 120s, hasta 6 reintentos) ante 429.
- **Corrección importante sobre el caché**: `portadas_cache.json` está indexado por **nombre** (`{"artistas": {name: url}, "albumes": {name: url}}`), no por `artist_id`/`album_id` como asumía el enunciado — confirmado leyendo `guardar_cache_portadas()`. Y más importante: **no contiene portadas de canción en absoluto** — el `imagen_url` por track (el nivel que "de verdad importa para el catálogo", según el propio docstring del módulo) vive solo en `FACT_TRACKS.imagen_url` (ClickHouse), nunca se vuelca a este JSON. El propósito real del archivo es servir de respaldo para repoblar `DIM_ARTISTS`/`DIM_ALBUMS.imagen_url` tras un `docker compose down -v` que destruye el volumen de ClickHouse (`loader.py` lo usa al crear esas tablas desde cero) — no es una fuente de datos que el frontend pueda leer directamente para portadas de track.
- Endpoints backend: no hay un endpoint dedicado "servir portada" — cada endpoint de catálogo que devuelve tracks/álbumes/artistas ya incluye `imagen_url` vía `coalesce(ft.imagen_url, al.imagen_url, a.imagen_url)` (`api/paquetes/catalogo/queries.py`), y el frontend consume esa URL externa directamente (Spotify/iTunes/Deezer CDN), sin proxy propio.

**2. `gold/backfill_portadas.py` — punto de entrada real y su alcance real (más limitado de lo asumido).**
- Entrada exacta: `python -m gold.backfill_portadas` (working directory `/opt/airflow/etl_src` dentro del contenedor `airflow`, `PYTHONPATH` ya apunta ahí). Sin flags — llama a `resolver_portadas_tracks_spotify_todas(client)` con su default `max_horas=9.0` (¡ya viene preparado para exactamente 9h por defecto!).
- **Alcance real: SOLO canciones (`FACT_TRACKS.imagen_url` vía oEmbed).** No toca `DIM_ARTISTS` ni `DIM_ALBUMS` — el enunciado asumía que este backfill "cubriría también los artist_id de perfiles de artista" (Fase 5, punto 1), pero la función que invoca no incluye artistas en absoluto.
- El módulo SÍ tiene una función que cubre canciones+álbumes+artistas juntos, con presupuesto de horas configurable: `resolver_portadas_reload_1h(client, max_horas=1.0)` — pensada originalmente para corridas de 1h, pero el parámetro es libre. Dado que Fase 2 de este prompt (portada de artista) sí necesita cobertura de `DIM_ARTISTS`, se decidió usar **esta función con `max_horas=9.0`** en vez de `backfill_portadas.py` tal cual, para la corrida de 9h de la Fase 5 — ver esa sección para el detalle. Sigue siendo 100% reuso: no se escribió ninguna lógica de resolución nueva, solo se llamó a una función existente con un parámetro distinto y un script de entrada nuevo y mínimo (`etl/gold/reload_portadas_9h.py`, mismo patrón exacto que `backfill_portadas.py`).
- Nota sobre nombres de archivo: el enunciado mencionaba DAGs `reload_portadas_1h.py`/`reload_portadas_5h.py` como si existieran hoy — son remanentes de una convención de nombres de una sesión anterior (quedan `.pyc` viejos en `etl/gold/__pycache__/` con esos nombres), pero el archivo real actual es uno solo: `etl/dags/reload_portadas_dag.py` (`dag_id="reload_portadas"`, `schedule_interval=None`, un solo `PythonOperator` que llama a `run_portada()` — un batch corto de una sola pasada: 60 canciones + 50 álbumes + 50 artistas por corrida, pensado para disparo manual o programado aparte, no para sesiones largas). El nuevo script `reload_portadas_9h.py` retoma ese patrón de nombre "sufijo de duración" para el standalone de esta sesión.

**3. `task_portada` sigue fuera del camino crítico — confirmado, nadie lo revirtió.** `etl/dags/tracklytics_etl.py` no tiene ningún `task_portada`; la cadena real es `task_bronze >> task_silver >> task_gold >> task_synthetic >> task_log`, exactamente como quedó en S11. El propio comentario en ese archivo referencia los nombres viejos `reload_portadas_1h.py`/`reload_portadas_5h.py` (documentación desactualizada, no un bug funcional — se deja así, no es parte del alcance de este prompt).

**4. Modelo de playlists — dos conceptos distintos con el mismo nombre en la UI, solo uno es el real.**
- Las playlists de usuario (PocketBase, colecciones `playlists`/`playlist_tracks`, gestionadas por `api/paquetes/biblioteca/`) **no tienen ningún campo de portada** (`cover_url`/`cover`/`imagen`/`portada`) — confirmado contra el schema real (`pb_init.py`) y las 3 migraciones de playlists existentes. Esta es la que realmente necesita la Fase 1 de este prompt (colección/creada por usuarios, sin artista/álbum fijo).
- La pestaña "Playlists" del catálogo (`CatalogPage.tsx`, `PlaylistsSection`) es una cosa **distinta**: en realidad son álbumes del dataset (`catalogoApi.albumsSearch`), reetiquetados como "playlists" en la UI porque muchos `album_name` del dataset son compilaciones tipo playlist (ver comentario de `portada.py`, línea 12-16). Esa vista ya tiene portada real vía `DIM_ALBUMS.imagen_url` — no requiere ningún cambio en este prompt.
- Hallazgo adicional: `TRACKS_BY_FACT_IDS` (la query que hidrata canciones de playlist/favoritos/historial desde ClickHouse) **no selecciona `imagen_url`** — de hecho `LibraryTrackRow.tsx` ya tiene un comentario propio documentando exactamente esta brecha ("arreglarlo del todo requeriría tocar ese backend — fuera de alcance de este cambio, que es 100% frontend"). Este prompt SÍ toca el backend, así que se cierra esa brecha documentada como parte de la Fase 1.

**5. Campo `artists` — no existe en `FACT_TRACKS` como asumía el enunciado.** El separador `";"` sí es real (confirmado en el CSV fuente `dataset/spotify.csv` y en `STG_RAW_TRACKS.artists`, bronze), pero:
- `FACT_TRACKS` tiene un solo `artist_id` por fila (`etl/gold/loader.py`: `stg_df["artists"].str.split(";").str[0]` — se queda solo con el **primer** artista listado, ya normalizado).
- El string crudo multi-artista (`"Bad Bunny; Feid"`) solo sobrevive en la tabla bronze `STG_RAW_TRACKS.artists`, que no está unida a ningún Fact/Dim de Gold y no se expone en ningún endpoint.
- **Impacto en Fase 4**: la detección de featuring no puede analizar un campo `artists` (plural) porque no llega hasta Gold/la API. Se detecta exclusivamente sobre `track_name` (que sí existe en `FACT_TRACKS` y sí viaja en cada respuesta) — ver Fase 4 más abajo para el detalle de esta decisión, documentada como desviación justificada, no oculta.

### Fase 1 — Collage de portadas para playlists de usuario

- Backend (`api/paquetes/biblioteca/`):
  - `queries.py`: `TRACKS_BY_FACT_IDS` extendida con `imagen_url` (`coalesce(ft.imagen_url, al.imagen_url, a.imagen_url)`, mismo patrón que `catalogo/queries.py` — se agregó el `LEFT JOIN DIM_ALBUMS` que antes no tenía). Cierra la brecha ya documentada en `LibraryTrackRow.tsx`.
  - `router.py`: `GET /biblioteca/playlists` ahora calcula `portada_urls: string[]` por playlist — hasta 4 `imagen_url` no nulas de sus primeras canciones por `position`, reusando los mismos datos que ya trae `listar_tracks_de_usuario` (sin request nuevo a PocketBase) más una sola consulta batch a `TRACKS_BY_FACT_IDS` para todos los fact_ids de la primera página de cada playlist del usuario a la vez (no N+1).
- Frontend: `PlaylistCollage.tsx` (nuevo, `shared/components/`) — grid 2×2 con hasta 4 portadas ya resueltas; si hay menos de 4 o ninguna, gradiente determinista por `playlist_id` (`genreGradient`, mismo hash genérico ya usado por género — el nombre del prop es histórico pero la función es agnóstica del dominio). `PlaylistsTab.tsx` migrado de icono plano `♪` a `PlaylistCollage`, cards agrandadas a 160px (mismo mínimo que `TrackGridCard` del catálogo).

### Fase 2 — Portada real en perfil de artista

`ArtistDetailPage.tsx` ya mostraba `artist.imagen_url` (el endpoint de detalle de artista ya lo devuelve — `api/paquetes/catalogo/queries.py`), pero a 96px y sin fallback de gradiente (cae directo al glifo plano `♪` de `AlbumArt`). Cambios: tamaño subido a 200px (mínimo pedido), `genreSeed={String(id)}` (artist_id, no género — mismo hash genérico) para gradiente determinista mientras no hay portada real, y skeleton (`SkeletonLoader`) en el estado de carga en vez del texto plano `// cargando…`. No se agregó ningún mecanismo de "encolar para resolución" nuevo: los artistas sin portada ya están cubiertos por el ciclo normal de `reload_portadas`/la corrida de 9h de la Fase 5 (`WHERE imagen_url IS NULL`), no hace falta un encolado explícito por request.

### Fase 3 — Imagen representativa por género

- Backend: `GENRES_LIST` (`api/paquetes/catalogo/queries.py`) agrega `imagen_url` = portada del track más popular del género que YA tenga `imagen_url` resuelto (`argMaxIf(ft.imagen_url, ft.popularity, ft.imagen_url IS NOT NULL)` — sin requests nuevos, reusa lo que ya está en `FACT_TRACKS`). Si ningún track del género tiene portada aún, el campo queda `NULL` y el frontend mantiene el color plano.
- Frontend: `ExploreCard.tsx`/`GenerosSection` — **corrección de premisa**: el enunciado decía que las cards de género "actualmente usan colores planos por mood/género", pero en el componente real (`ExploreCard` con `kind="genero"`) el ícono era un gradiente de marca fijo, igual para todos los géneros — el color POR género (`genreAccent`) solo se usaba en los chips de filtro de arriba, un componente distinto. Se llevó `genreAccent(name)` al ícono de `ExploreCard` (antes ausente ahí) y, cuando hay `imagen_url`, se superpone como fondo con el overlay de color al 65% de opacidad encima — así se obtiene el efecto pedido ("no perder la identidad visual por color") sin inventar un sistema de color que no existía en ese componente puntual.

### Fase 4 — Detección de featuring

**4A/4B — decisión documentada: solo `track_name`, cálculo en tiempo de consulta.** Dado que `artists` (plural, separado por `;`) no llega a ningún Fact/Dim de Gold ni a la API (ver hallazgo 5 de la Fase 0), la detección se hizo exclusivamente sobre `track_name` — que además es la señal dominante real: el propio enunciado advertía que "múltiples artistas separados por ';' no equivale a featuring" (una banda con varios integrantes también tendría ';'), así que ni siquiera con el campo disponible habría sido la señal correcta por sí sola. `track_name` con patrones `(feat. X)`/`[ft. X]`/`featuring`/`(with X)` es justamente el estándar real de estos datasets para marcar colaboraciones.

Nuevo módulo `api/core/featuring.py` (compartido, no atado a un paquete): `detectar_featuring(track_name, artist_name) -> dict` con regex case-insensitive en dos capas — primero patrón entre paréntesis/corchetes (`\(feat\.?|ft\.?|featuring|with\s+...\)`, `with` SOLO en esta forma, tal como pedía el enunciado), si no hay match se prueba el patrón sin encerrar (`feat.`/`ft.`/`featuring` sueltos, sin `with` suelto — evita falsos positivos con la palabra común en inglés). Devuelve `es_featuring`, `artista_principal` (el artista ya resuelto del track — no hay una "lista" de la que tomar el primero, así que se usa el único artist_name disponible) y `artistas_feat` (nombres extraídos, separados por `,`/`&`, recortados).

Aplicado en tiempo de consulta (no se creó tabla materializada): se decidió sin necesitar medir por separado, porque los 3 endpoints donde se aplica (`catalogo` tracks list/grid, artista, biblioteca playlists) ya son paginados (20-60 filas por respuesta) — el regex corre sobre un puñado de filas por request, no sobre el total de 313k+ filas de una sola vez, así que el costo es despreciable por diseño del propio patrón de paginación existente, no por una optimización nueva. `FACT_TRACKS` no se tocó — la detección es 100% derivada en la capa de API.

Frontend: `TrackCard.tsx`, `TrackGridCard.tsx` y `LibraryTrackRow.tsx` (esta última ganó también su primer `AlbumArt`, que no tenía) muestran un badge "feat." pequeño junto al nombre cuando `es_featuring`, con los artistas de feat. como texto secundario debajo del artista principal.

### Fase 5 — Carga en background (9h)

**Ajuste sobre el mecanismo pedido**: `backfill_portadas.py` (`python -m gold.backfill_portadas`) es el comando "de siempre", pero solo cubre canciones (`resolver_portadas_tracks_spotify_todas`) — no toca `DIM_ARTISTS`, y Fase 2 de este prompt necesita justo eso. Se creó `etl/gold/reload_portadas_9h.py` (mismo patrón exacto de archivo que `backfill_portadas.py`, cero lógica de resolución nueva) que llama a `resolver_portadas_reload_1h(client, max_horas=9.0)` — la función que YA cubre canciones + álbumes/playlists + artistas juntos, normalmente usada con presupuesto de 1h, aquí con 9h.

- **Lanzado**: `docker compose run -d --name tracklytics_reload_portadas_9h etl python -u -m gold.reload_portadas_9h`, 2026-07-31 06:14 UTC (01:14 hora local). Requirió reconstruir la imagen `etl` primero (`docker compose build etl`) porque su Dockerfile copia `etl/` al build (`COPY etl/ .`), no la monta en vivo — el script nuevo no existía en la imagen anterior.
- **Verificado activo, no solo "corriendo"**: además del contenedor en estado `Up`, se confirmó progreso real consultando `DIM_ARTISTS`/`FACT_TRACKS` directamente en ClickHouse antes de que aparecieran logs (el primer ciclo tarda ~1-2 min en imprimir su resumen) — los conteos ya habían crecido, prueba de que el proceso escribe de verdad, no solo que el contenedor sigue vivo.
- **Rate limit respetado, sin acelerarlo**: mismo `_BACKFILL_CONCURRENCY = 1`, misma pausa de 1.5s entre requests de oEmbed, mismo backoff exponencial — no se tocó ningún parámetro de `portada.py` para esta corrida.
- **Comportamiento observado, ya documentado en el propio código**: iTunes empezó a devolver 429/403 tras varios ciclos sostenidos (degradación ya conocida y documentada en `resolver_portadas()`), Deezer sigue resolviendo la mayoría de los artistas igual — no es una regresión de esta sesión.

### Fase 6 — Verificación

- `npm run build`: verde (bundle principal 542.14 kB, +2 kB vs. la línea base de S13 por los componentes nuevos — sin regresión de code-splitting).
- `npm run type-check`: los únicos 3 errores de TS preexistentes están en `EngagementPage.tsx` (archivo no tocado en esta sesión, confirmado con `git status`) — cero errores en los 13 archivos modificados/creados de S14-P1.
- Se reconstruyeron `frontend` y `api` (`docker compose up --build -d frontend-react api`); no se agregó ningún DAG de Airflow en este prompt (Fase 5 usa un script standalone, no un DAG), así que no hizo falta reconstruir `airflow`.
- Verificación visual con Playwright (cuenta `s13_admin_verif@test.com`, sesión inyectada igual que un login real) — **0 errores de consola en las 5 capturas**:
  - `/biblioteca` → pestaña "Playlists": collage 2×2 con 3 portadas reales (playlist de prueba con 3 canciones, eliminada al cerrar la verificación) — confirmado también el caso "menos de 4 canciones" (la 4ª celda queda vacía dentro del grid, sin romper el layout).
  - `/catalog` → búsqueda "feat.": badge `FEAT.` visible en "Unholy (feat. Kim Petras)" y "Left and Right (Feat. Jung Kook of BTS)", con "con Kim Petras" como texto secundario debajo del artista — y, tan importante como lo anterior, **confirmado que NO aparece** en filas donde "feat." está en el nombre del ARTISTA (ej. "Future Funk Squad feat. Mojo"), exactamente el comportamiento pedido: solo se analiza `track_name`.
  - `/catalogo/artista/{id}` (J Balvin): portada real 200×200 en el header, sin fallback necesario (artista ya cacheado).
  - `/catalog` → pestaña "Géneros": las 12 cards destacadas muestran color por género (antes plano) con la portada del track más popular de fondo al 65% de opacidad — identidad visual por color preservada, imagen visible mezclada debajo.
- Proceso `reload_portadas_9h` confirmado corriendo (`docker ps`, `Up`) al momento de cerrar la verificación — no se esperó a que termine, como pedía la regla.

### Fase 7 — Cobertura

Medida antes de lanzar el proceso de 9h vs. al momento de escribir esta entrada (~15 min después de iniciado, sesión sigue corriendo en background):

| Entidad | Antes | Después (parcial, +15 min) | Total |
|---|---|---|---|
| Canciones con portada | 38.498 | 38.634 (+136) | 89.741 reales |
| Artistas con portada | 14.067 | 14.153 (+86) | 29.863 |
| Álbumes con portada | 3.411 | 3.411 (sin cambio neto — este ciclo reemplaza, no solo rellena `NULL`) | 46.596 |

**Corrección sobre la cifra del enunciado**: el contexto decía "~20k portadas resueltas" — la cobertura real de canciones YA estaba en 38.498 (43% del catálogo real) antes de este prompt, casi el doble de lo asumido. La corrida de 9h debe dejar el catálogo bastante más cerca de completo para cuando termine (no se espera su finalización en esta sesión, por diseño).

### Archivos nuevos o modificados (S14-P1)

**Backend nuevo**: `api/core/featuring.py`, `etl/gold/reload_portadas_9h.py`.
**Backend modificado**: `api/paquetes/catalogo/queries.py` (+`imagen_url` en `GENRES_LIST`), `api/paquetes/catalogo/router.py` (featuring en 5 endpoints de tracks), `api/paquetes/biblioteca/queries.py` (+`imagen_url` en 3 queries, fix del INNER JOIN de género que descartaba tracks sintéticos en `FAVORITOS_ACTUALES`/`TRACKS_BY_FACT_IDS`), `api/paquetes/biblioteca/router.py` (`portada_urls` en listado de playlists, featuring en detalle), `api/paquetes/social/router.py` (featuring en perfil público).
**Frontend nuevo**: `shared/components/PlaylistCollage.tsx`+`.module.css`.
**Frontend modificado**: `packages/catalogo/types.ts` (campos nuevos en `Track`/`LibraryTrack`/`Playlist`/`Genre`), `packages/catalogo/components/{PlaylistsTab,ExploreCard,TrackCard,TrackGridCard,LibraryTrackRow}.tsx`+`.module.css`, `packages/catalogo/pages/{ArtistDetailPage,CatalogPage,DetailPages.module.css,BibliotecaPage.module.css}.tsx`.

---

## S14-P2 — Grano temporal configurable en la capa Gold (5 ago 2026)

Modo autónomo. Recarga de portadas de 9h relanzada primero (patrón fijo de cada sesión), como pedía el Paso 0.

### Paso 0 — Recarga de portadas 9h

`docker compose build etl && docker compose run -d --name tracklytics_reload_portadas_9h etl python -u -m gold.reload_portadas_9h`, 2026-08-05 ~08:33 UTC. Verificado con conteos reales en ClickHouse catálogo (8123), no solo `docker ps`:

| Entidad | Al lanzar | ~50 min después |
|---|---|---|
| Canciones con portada (`FACT_TRACKS.imagen_url`) | 0 / 1.313.556 | 1.477 / 1.313.556 |
| Artistas con portada (`DIM_ARTISTS.imagen_url`) | 17.628 / 29.863 | 17.634 / 29.863 |
| Álbumes con portada (`DIM_ALBUMS.imagen_url`) | 4.375 / 46.596 | 4.375 / 46.596 (sin cambio neto — ciclo de reemplazo, no solo relleno de `NULL`, mismo comportamiento documentado en S14-P1) |

**Hallazgo no esperado**: la cobertura de `FACT_TRACKS.imagen_url` partió de **0** en esta sesión, muy por debajo de los 89.741 reales con los que había cerrado S14-P1 (30 jul 2026) — el catálogo (`FACT_TRACKS`, 1.313.556 filas ahora vs. ~313k entonces) fue recargado entre sesiones, perdiendo el progreso de portadas de canción acumulado. `DIM_ARTISTS`/`DIM_ALBUMS` sí conservaron su cobertura previa casi intacta. No es parte del alcance de este bloque investigar la causa — se deja documentado como línea base real para la próxima sesión. Proceso confirmado corriendo (`docker ps`, `Up`) al cerrar esta entrada, sin haber sido detenido ni tocado en ningún momento del bloque.

### Fase 0 — Inspección previa (hallazgos reales vs. premisas del enunciado)

Casi todo lo descrito en el enunciado coincidió con el repo real. Dos diferencias encontradas y adaptadas:

1. **`etl/gold_ch/pipeline.py` usaba `INTERVAL 180 DAY`, no 90** (el doble que los otros 11 módulos, que sí usaban 90/`today()-90`). El enunciado asumía 90 DAY en todos. Se unificó: los 12 módulos ahora usan `VENTANA_ORIGEN_DIAS = 1095` (incluido `pipeline.py`), documentado en su docstring.
2. **`financiero.py` calcula `mrr = ingresos_suscripciones × 4.348`** (semanas/mes), una aproximación que solo tiene sentido para grano semanal — el enunciado no mencionaba adaptarla, y con grano `mes` habría dejado el MRR mensual 4.3× inflado (`ingresos_suscripciones` de un mes completo, multiplicado otra vez por semanas/mes). Se generalizó a un multiplicador por granularidad (`MULTIPLICADOR_MRR`: dia=365.25/12, semana=4.348, mes=1.0, trimestre=1/3, anio=1/12) — verificado en Fase 5 (`mrr == ingresos_suscripciones` exacto en grano `mes`, `mrr == ingresos_suscripciones × 4.348` en grano `semana`).

El resto coincidió exactamente con el enunciado: `periodo_sql()` fijo en semana ISO, `PERIODOS_VENTANA = 12`, 13 DDL en `create_gold_tables.py` (12 `GOLD_*_PERIODO` + `GOLD_ETL_LOG`), los 12 módulos (9 con relleno demo vía `rng_for`: `adquisicion`, `api_consumo`, `comunidad`, `consumo_genero`, `contenido`, `engagement`, `infraestructura`, `producto`, `regalias`; 3 sin relleno demo, 100% real con cero como valor real: `financiero`, `pipeline`, `seguridad`), `queries.py`/`router.py` exactamente como se describía, DAG con 12 `PythonOperator` sin dependencias.

### Fase 1-2 — Granularidades y DDL

| id | Etiqueta `periodo` | Horizonte (períodos) |
|---|---|---|
| `dia` | `2026-08-05` | 90 |
| `semana` | `2026-W32` | 52 |
| `mes` | `2026-08` | 24 |
| `trimestre` | `2026-Q3` | 8 |
| `anio` | `2026` | 3 |

`etl/gold_ch/base.py` reescrito: `periodos_ventana(granularidad)` reemplaza `iso_weeks_back()`, devuelve `(etiqueta, fecha_inicio)`; `permite_relleno_demo(etiquetas, periodo)` acota el relleno demo a los `PERIODOS_RELLENO_DEMO = 12` períodos más recientes de cada granularidad. Las 12 tablas `GOLD_*_PERIODO` suman `granularidad LowCardinality(String)` + `fecha_inicio Date` como primeras columnas, `ORDER BY (granularidad, fecha_inicio, ...)`. `GOLD_ETL_LOG` suma `granularidad`. `create_gold_tables.py` acepta `GOLD_RECREATE=1` → `DROP TABLE IF EXISTS` de las 13 tablas antes de recrearlas (capa 100% derivada, repoblada corriendo el DAG — sin backfill).

**Decisión sobre el acotamiento del relleno demo**: ampliar el horizonte de 12 semanas a hasta 90 períodos (`dia`) no debía multiplicar por 7.5 el volumen de datos inventados. Se limitó `rng_for()` a los 12 períodos más recientes de cada granularidad — períodos más antiguos sin dato real en el catálogo simplemente no generan fila (verificado en Fase 5: para `trimestre` y `anio`, cuyo horizonte completo es ≤ 12, TODOS los períodos tienen fila incluso en dimensiones "siempre demo"; para `dia`/`semana`/`mes`, exactamente 12).

**Excepción de proyecciones**: la regresión lineal de `GOLD_CONSUMO_GENERO_PERIODO` (OT-18) solo corre para `granularidad == 'semana'` — para las otras 4, `pendiente_regresion`/`intercepto_regresion` quedan en 0 y `prediccion_4sem` vacío en todas las filas (verificado: `countIf(length(prediccion_4sem)>0)` es 15 en `semana` y 0 en las otras 4).

### Fase 3-4 — Módulos, DAG y API

Los 12 módulos migrados a `run_gold_<dominio>(granularidad='semana')`. `dag_gold_aggregations.py` expandido a 60 tareas (`PythonOperator` por dominio×granularidad, `op_kwargs={'granularidad': g}` — no closures de Python, que habrían capturado el último valor de `g` en las 60 tareas). `queries.py`: `_rango_where` filtra por `granularidad` + `fecha_inicio`, resolviendo etiquetas de período con una subconsulta a la misma tabla (`fetch_gold` sigue aceptando etiquetas en `periodo_inicio`/`periodo_fin`, no fechas). `router.py`: los 30 handlers suman `granularidad: str = "semana"`; endpoint nuevo `GET /_meta/periodos?tabla=&granularidad=`, gateado con `require_seguridad` (= `require_admin`, la dependencia más permisiva de las 9 del módulo — no hay una dependencia común a los 9 departamentos, y este endpoint no pertenece a ninguno en particular).

### Fase 5 — Verificación real

1. **`docker compose up -d`** (stack completo estaba abajo al iniciar la sesión) + **`GOLD_RECREATE=1`** vía `docker compose run --rm -e GOLD_RECREATE=1 init-db-gold` (rebuild previo de esa imagen) → `13/13 tablas GOLD_* listas`.
2. **Quirk de infra reencontrado** (ya documentado en sesiones anteriores, "el scheduler de Airflow puede morir en silencio"): tras `docker compose restart airflow`, el proceso `airflow scheduler` murió en el arranque por `sqlite3.OperationalError: database is locked` (carrera entre `airflow db migrate` y el propio scheduler dentro de `airflow standalone`, mismo contenedor). Confirmado con `ps`-equivalente vía `/proc` (no había `ps` en la imagen): solo quedaban vivos `webserver`/`triggerer`/`standalone`, sin `scheduler`. Un segundo `docker compose restart airflow` lo recuperó. La tarea disparada durante la ventana muerta quedó en cola (`dag_run` en estado `queued`) y arrancó sola en cuanto el scheduler volvió — no se perdió.
3. **DAG disparado, 60/60 tareas verdes**, sin reintentos. Corrida real: 09:13:08–09:21:46 UTC (~8m38s de ejecución efectiva sobre `SequentialExecutor`, ~8.6s/tarea en promedio).
4. **ClickHouse Gold (8124)** — filas por granularidad en las 12 tablas, todas con las 5 presentes. Ejemplo (`GOLD_FINANCIERO_PERIODO`, 100% real sin demo-fill): `dia=90, semana=52, mes=24, trimestre=8, anio=3` — coincide EXACTO con `HORIZONTE_POR_GRANULARIDAD`, como se espera de un módulo que escribe una fila por período sin importar si hay dato real. `fecha_inicio` coherente con `periodo` verificado por muestreo en las 5 granularidades (ej. `mes='2026-08'` → `fecha_inicio='2026-08-01'`; `anio='2026'` → `'2026-01-01'`; `semana='2026-W21'` → `'2026-05-18'`, lunes ISO correcto).
5. **`curl` real, 3 departamentos / 3 granularidades** (cuenta admin de prueba creada con `pb_client.crear_usuario(rol="admin")`, sin tocar `.env`): `financiero/mrr-arr` (semana/mes/anio), `analitica/ranking-generos` (mes), `comunidad/moderacion` (anio) — las 5 respuestas con `datos` no vacíos y `periodo_inicio`/`periodo_fin` en orden cronológico correcto.
6. **Compatibilidad hacia atrás confirmada por diff, no solo inspección visual**: `curl` sin `granularidad` vs. `curl` con `granularidad=semana` explícito en los mismos 3 endpoints → los 3 pares de respuestas son **byte-idénticos** (`diff` vacío). Las respuestas SÍ incluyen 2 campos nuevos por fila (`granularidad`, `fecha_inicio`) que no existían antes de S14-P2 — aditivo, no rompe consumidores existentes que leen campos específicos por nombre (el frontend actual no lee esos 2 campos nuevos, no se ve afectado).
7. **`npm run build`**: verde, 24,88s. Único warning preexistente (chunks > 500kB, no relacionado a este bloque). Frontend no tocado en S14-P2 — el build solo confirma que no se rompió nada al cambiar la API.

### Archivos nuevos o modificados (S14-P2)

**ETL**: `etl/gold_ch/base.py` (reescrito), `etl/gold_ch/{adquisicion,api_consumo,comunidad,consumo_genero,contenido,engagement,financiero,infraestructura,pipeline,producto,regalias,seguridad}.py`, `etl/dags/dag_gold_aggregations.py`, `create_gold_tables.py`.
**API**: `api/paquetes/reportes/queries.py`, `api/paquetes/reportes/router.py`.
**OpenSpec**: `openspec/changes/2026-08-05-s14-p2-granularidad-gold/` (proposal, tasks, delta spec `reportes` — validado `openspec validate --all --strict`, 17/17, sin archivar en este bloque).
