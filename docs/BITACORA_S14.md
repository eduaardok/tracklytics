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

---

## S14-P3 — Datos de negocio reales end-to-end + cuentas por rol administrativo (5 ago 2026)

Modo autónomo. Recarga de portadas ya estaba corriendo desde el incidente de reinicio de PC de la conversación anterior (relanzada esa vez) — se dejó correr sin tocar, verificado `Up` durante todo el bloque; conteos de referencia al cierre: `FACT_TRACKS` 1.313.556/2.108 con portada, `DIM_ARTISTS` 29.863/17.634.

### Fase 1 — Inventario (premisas del enunciado vs. repo real)

**Conteo real de `rng_for()`: 19 llamadas en 9 módulos, no 26 en 11** (verificado con `grep`, no supuesto). `financiero.py`, `pipeline.py` y `seguridad.py` ya eran 100% reales desde S13-P3a (cero fabricado — un cero es un valor real cuando no hubo evento, no una estimación). Tabla completa:

| Módulo | Llamadas | Métrica fabricada | Tabla `FACT_*` destino | Filas reales antes de S14-P3 |
|---|---|---|---|---|
| `adquisicion.py` | 4 | registros/país, deserciones, CAC, **suscripciones activas y conversiones por plan (siempre demo, sin condición)** | `DIM_USUARIO` (106, 1 mes), `FACT_CANCELACION_SUSCRIPCION` (1), `FACT_GASTO_OPERATIVO` marketing (3) | — |
| `api_consumo.py` | 1 | llamadas API por partner | `LOG_LLAMADAS_PARTNER` (42) | |
| `comunidad.py` | 4 | moderación, denuncias, tickets, social | `FACT_COMENTARIO` (34), `FACT_DENUNCIA` (2), `FACT_TICKET_SOPORTE` (6), `FACT_COMPARTICION`+`BRIDGE_SEGUIMIENTO_ARTISTA` (16+5) | |
| `consumo_genero.py` | 1 | reproducciones/pop/energía por género-artista | `FACT_ENGAGEMENT_USUARIO` (52.530, 7 semanas) | |
| `contenido.py` | 1 | solicitudes de subida | `FACT_SUBIDA_TRACK` (8) | |
| `engagement.py` | 2 | rollup y por-género de reproducciones/favoritos | `FACT_ENGAGEMENT_USUARIO` (mismo) | |
| `infraestructura.py` | 1 | uptime/incidentes | `FACT_DISPONIBILIDAD` (309) | |
| `producto.py` | 4 | recomendaciones, exposiciones AB, **`metrica_impacto` (siempre demo, incluso en filas `es_estimado=0` — bug de diseño)**, notificaciones | `FACT_IMPRESION_RECOMENDACION` (559), `FACT_AB_TEST_EXPOSICION` (136), `FACT_NOTIFICACION` (4) | |
| `regalias.py` | 1 | streams/monto liquidado | `FACT_LIQUIDACION_REGALIA` (49) | |

Dos casos eran "siempre demo" sin ninguna rama real (no condicionados a que faltara el dato): `adquisicion.py` (plan-level) y `producto.py` (`metrica_impacto`) — ambos resueltos con datos reales en la Fase 4 (ver abajo), no dejados sin resolver.

**`modelo_negocio_sync_dag.py` — premisa falsa del enunciado**: no es una sincronización PocketBase → ClickHouse (el enunciado lo daba por hecho). Genera `FACT_ADQUISICION`/`FACT_DISPONIBILIDAD` sintéticos por "semana académica" (`week_number` 1-16), con `usuario_id` ficticios (`acq_user_wN_XXXX`) que **no existen en `DIM_USUARIO`** — no reusable para `registros_nuevos`. Hallazgo adicional: `FACT_ADQUISICION` (1.650 filas) no lo consulta ningún módulo Gold — tabla huérfana de una capability anterior. Decisión: materializar suscripciones directo en ClickHouse vía `FACT_TRANSACCION_PAGO` (concepto=`suscripcion`), generado por el nuevo `backfill_negocio.py` — ninguna sincronización PocketBase nueva, siguiendo el principio del enunciado ("generar los eventos como filas en las tablas FACT_* del catálogo").

**Constantes de negocio — todas confirmadas reales en el código, ninguna inventada**:

| Constante | Valor | Origen |
|---|---|---|
| IVA global | 0.15 | `api/paquetes/facturacion/queries.py::IVA_RATE` |
| Retención fiscal global | 10.0% | `api/paquetes/regalias/router.py::_resolver_retencion_pct` (default) |
| Tasa de éxito de cobro | 0.9 | `facturacion/queries.py::TASA_EXITO_DEFAULT` |
| Máx. intentos de cobro (dunning) | 3 | `suscripciones/router.py::MAX_INTENTOS_COBRO` |
| Ciclo de facturación | 30 días | `facturacion/router.py::DIAS_CICLO_FACTURACION` |
| Strikes para suspensión | 3 | `seguridad/strikes.py::STRIKES_PARA_SUSPENSION` |
| Pool rightsholders/plataforma | 70/30 | `regalias/router.py::TASA_RIGHTSHOLDERS` |
| Split master/publishing | 80/20 | `regalias/router.py::PCT_MASTER`/`PCT_PUBLISHING` |
| Precios de plan | free=0, estudiante=4.99, premium=9.99, básico=199, pro=499, enterprise=1499 | `suscripciones/planes.py::PLANES_B2C`/`PLANES_B2B`, confirmado en `DIM_PLAN` |

**Descubrimiento clave para la Fase 3**: `api/paquetes/regalias/router.py::liquidar_periodo_interno()` ya existe, probado, y calcula el pool real (transacciones + publicidad del período × 70%, split 80/20, retención por país) — reusado por `simulacion` según su propio design.md. El contenedor `airflow` no tiene el paquete `api/` montado ni FastAPI instalado, así que no se puede importar directo: se llamó por HTTP real (`POST /admin/liquidar`, `httpx`, ya instalado en la imagen de `airflow`) en vez de reimplementar la fórmula — cero duplicación de lógica de negocio.

### Fase 2 — Ventana histórica

`inicio_plataforma()`: primer día del mes, 24 meses antes del mes actual — ancla a límites de mes (no un offset de días crudo) para que la idempotencia y los cortes mensuales de regalías sean estables sin importar la hora del disparo. Ejecutado el 2026-08-05: ventana `2024-08-01 — 2026-08-05` (734 días).

### Fase 3 — Backfill de negocio (`etl/gold/backfill_negocio.py` + `etl/dags/dag_backfill_negocio.py`)

13 dominios en orden de dependencia estricta (usuarios → gasto marketing → suscripciones → publicidad → engagement → regalías → el resto), un único `PythonOperator` (no una tarea por dominio — el propio orden de dependencia exige no paralelizar). Idempotencia: mismo mecanismo que `gold/modelo_negocio_sync.py` (`ETL_BATCH_CONTROL` + `checksum` propio), pero **un flag por dominio, no por período** — es un backfill histórico de una sola corrida, no un proceso recurrente por semana académica; decisión documentada porque el patrón exacto de `modelo_negocio_sync.py` no aplicaba tal cual.

Probado primero en una ventana de 10 días (los 13 dominios + la llamada real a `/admin/liquidar`), limpiados los datos de prueba (`ALTER TABLE ... DELETE` por los marcadores `bf_%`/`sistema_backfill_negocio`), y solo entonces lanzada la corrida completa de 24 meses.

**Resultado real de la corrida completa** (1455.2s ≈ 24.3 min):

| Dominio | Filas/detalle |
|---|---|
| usuarios | 12.956 altas en `DIM_USUARIO` |
| gasto_marketing | 25 filas mensuales |
| suscripciones | 34.199 transacciones, 30.795 facturas, 502 reembolsos, 566 cancelaciones |
| publicidad | 189.172 impresiones + 189.172 filas de ingreso |
| engagement | 952.986 filas (reproducciones + favoritos) |
| regalías | 0 liquidaciones **nuevas** sobre 25 llamadas mensuales — ver hallazgo abajo |
| disponibilidad | 2.936 filas |
| api_partners | 171.682 filas |
| comunidad | 37.719 comentarios, 12.332 comparticiones, 5.731 seguimientos |
| denuncias_tickets | 1.422 denuncias, 162 strikes, 2.442 tickets |
| producto | 119.304 recomendaciones, 94.676 exposiciones AB, 56.673 notificaciones |
| contenido | 180 sumisiones de tracks |
| auditoría | 13.522 filas |

**Hallazgo real durante la verificación — regalías resultó más escaso de lo esperado, documentado, no ocultado**: `DIM_CONTRATO_REGALIA` solo tiene 3 contratos, y solo 2 están `activo=1`, vigentes recién desde julio de 2026. `liquidar_periodo_interno()` solo liquida tracks con contrato vigente EN el período liquidado — la ventana real donde había, a la vez, contrato vigente y reproducciones del track contratado resultó angosta (unos pocos días de julio). El backfill sí generó liquidaciones reales (6, vía una llamada de prueba manual anterior a la corrida completa) con la fórmula real, pero la corrida completa no encontró más períodos nuevos que liquidar (idempotente: el mes de julio ya estaba cubierto). Además, `FACT_LIQUIDACION_REGALIA.fecha_calculo` (que es lo que usa `regalias.py` para el bucketing por período Gold) se fija en el momento del CÁLCULO, no en el período liquidado — diseño preexistente de S13-P3a, no tocado acá — así que las liquidaciones reales quedan agrupadas en el período Gold correspondiente a cuándo se corrió el backfill, no distribuidas en 24 meses. Verificado en Fase 6: `GOLD_REGALIAS_PERIODO` sí tiene filas reales en varias granularidades (26 en año, 56 en día, etc. — ver tabla de Fase 6), `es_estimado=0` en todas.

### Fase 4 — Limpieza de la capa Gold

Los 9 módulos con `rng_for()` reescritos:
- **`adquisicion.py`**: suscripciones activas/conversiones por plan ahora se derivan de `FACT_TRANSACCION_PAGO` real — el monto de la transacción se mapea a `plan_id` vía `DIM_PLAN.precio_usd` (no existe columna `plan_id` en la tabla de transacciones, el monto es la única señal real disponible). "Activos" = transacciones cuyo ciclo de facturación se solapa con el período Gold; "conversiones" = usuarios cuya primera transacción paga cae en el período. Corrección adicional: la lista de planes tenía `"familiar"` — un plan que **no existe** en `DIM_PLAN`/`PLANES_B2C`/`PLANES_B2B` (premisa falsa del código heredado, no del enunciado); reemplazada por la lista real derivada de `DIM_PLAN`.
- **`producto.py`**: `metrica_impacto` (impacto de un experimento A/B) no tenía ninguna columna de resultado en `FACT_AB_TEST_EXPOSICION` para derivarla — antes se fabricaba con `rng_for()` incluso en filas `es_estimado=0` (la columna mentía sobre su propio flag). Se deriva ahora de una señal real correlacionada: reproducciones promedio por usuario expuesto en el mismo período, por variante (`FACT_ENGAGEMENT_USUARIO`) — `metrica_impacto` es la diferencia % entre la variante con más y la de menos reproducciones promedio; sin al menos 2 variantes con datos, queda en 0.0 (no se inventa, mismo criterio que la excepción de proyecciones de S14-P2).
- Los 7 módulos restantes (`api_consumo`, `comunidad`, `consumo_genero`, `contenido`, `engagement`, `infraestructura`, `regalias`): la rama de relleno demo se eliminó — un período/dimensión sin dato real simplemente no tiene fila.
- `base.py`: `rng_for()`, `permite_relleno_demo()` y `PERIODOS_RELLENO_DEMO` retirados por completo (sin llamadores tras la limpieza de los 9 módulos) — no se dejaron a medias.

### Fase 5 — Cuentas por rol administrativo

7 cuentas creadas por los endpoints reales (`POST /auth/registro` con `rol=user`/`analyst` seguido de `POST /admin/usuarios/{id}/rol-admin` para los 6 roles administrativos), usando de autoridad de bootstrap una cuenta de verificación ya existente de una sesión anterior (`s14p2_admin_verif@test.com`, creada en su momento con `pb_client.crear_usuario`) — las 7 cuentas NUEVAS de esta fase sí pasaron 100% por los endpoints reales, ninguna por PocketBase directo. `docs/CUENTAS_DEMO.md` documenta correo/rol/contraseña/alcance de cada una, con la advertencia de credenciales de demo académica en el encabezado.

**Matriz de gating (Fase 5/6) — sin fallos de seguridad**: 7 cuentas × 9 departamentos (un endpoint representativo de cada uno) + sin autenticación. Cada cuenta obtuvo `200` únicamente en el/los departamento(s) de su rol y `403` en el resto; `superadmin` obtuvo `200` en los 9; sin token, `401` en los 9. Ningún `403` esperado devolvió `200`.

### Fase 6 — Verificación real

1. `dag_gold_aggregations` (60 tareas) corrido con los módulos limpios — verde, sin reintentos.
2. **`sum(es_estimado)` = 0 en las 12 tablas Gold, en las 5 granularidades** (60 combinaciones tabla×granularidad, todas en cero) — verificado con `SELECT granularidad, sum(es_estimado), count() ... GROUP BY granularidad`, no una muestra.
3. `curl` real a los 30 informes compuestos en `granularidad=mes`: **29/30 con datos, 1 vacío**. El vacío es `C17` (`analitica/proyeccion`) — **por diseño, no un bug de este bloque**: la proyección por regresión lineal (OT-18) solo se calcula para `granularidad='semana'`, decisión explícita de S14-P2 (`docs/BITACORA_S14.md`, P2) — confirmado que `C17` sí devuelve 15 filas en `granularidad=semana`.
4. Matriz de gating: ver Fase 5.
5. `npm run build`: verde (frontend no tocado en este bloque).

### Archivos nuevos o modificados (S14-P3)

**ETL nuevo**: `etl/gold/backfill_negocio.py`, `etl/dags/dag_backfill_negocio.py`.
**ETL modificado**: `etl/gold_ch/base.py` (retiro de `rng_for`/`permite_relleno_demo`), `etl/gold_ch/{adquisicion,api_consumo,comunidad,consumo_genero,contenido,engagement,infraestructura,producto,regalias}.py`.
**Docs nuevos**: `docs/CUENTAS_DEMO.md`, `docs/NOTA_METODOLOGICA.md`.
**OpenSpec**: `openspec/changes/2026-08-05-s14-p3-datos-reales-cuentas-rol/` (`reportes`, `simulacion`, `seguridad`, `ingesta` — `ingesta` y `seguridad` no estaban en el enunciado explícito pero su contrato cambió de verdad: `ETL_BATCH_CONTROL` se reusa para el backfill, y la asignación de roles ganó el escenario de cuenta de referencia verificable; validado `openspec validate --all --strict`, 18/18, sin archivar).

---

## S14-P4 — Correcciones de S14-P3 + generación de datos bajo demanda (5-6 ago 2026)

Modo autónomo. Recarga de portadas ya venía corriendo de la conversación anterior — se dejó
terminar su ciclo natural (~512 min de 540) y se relanzó automáticamente al cerrar (watcher en
background, sin intervención manual, sin `docker compose down` en ningún momento). Conteos de
referencia: `FACT_TRACKS` 19.332/1.313.556 con portada al iniciar este bloque (los artistas
siguen estancados en 17.634/29.863 — iTunes degradado tras ciclos sostenidos, ya documentado en
S14-P1/P3, no un hallazgo nuevo).

### Fase 1 — Credenciales fuera del código

`SUPERADMIN_EMAIL`/`SUPERADMIN_PASSWORD` en `etl/gold/backfill_negocio.py:104-105` estaban en
texto plano, confirmado con `grep` antes de tocar nada. Pasaron a `os.getenv("SUPERADMIN_DEMO_EMAIL", ...)`/
`os.getenv("SUPERADMIN_DEMO_PASSWORD", "Demo12345!")`, declaradas en `docker-compose.yml`
(servicio `airflow`) con el mismo default demo — mismo patrón ya usado por `AIRFLOW_PASSWORD`/
`AIRFLOW_SECRET_KEY` en el mismo archivo (`${VAR:-default}`), no una convención nueva.

**Auditoría del resto del repo** (`git grep` por patrones de password/secret/api_key en duro,
más una búsqueda de formatos reales de API key — `AIza`, `sk-`, `ghp_`): sin otros hallazgos.
El único otro texto con "Demo12345" en el repo es el propio default declarado en
`docker-compose.yml` — exactamente donde el enunciado pedía que viviera.

### Fase 2 — Cuentas demo creadas automáticamente

`seed_cuentas_demo.py` + servicio `seed-cuentas-demo` (mismo patrón `pb-init`/`init-db`:
`restart: no`, imagen mínima propia). Healthcheck nuevo en `api` (Python vía `urllib`, sin
`curl`/`wget` en `python:3.11-slim`) — `seed-cuentas-demo` depende de `api: condition:
service_healthy`, cero `sleep`.

**Hallazgo real durante el diseño**: `POST /auth/registro` bloquea a propósito autoregistrarse
con `rol=admin` (`ROLES_AUTO_REGISTRABLES = ("user", "analyst")`, CU-O01), y asignar un rol
administrativo requiere YA ser `superadmin` — un sistema recién levantado no tiene ninguno, así
que el círculo "cuentas solo por los 2 endpoints reales" no se puede cerrar completo para la
PRIMERA cuenta. Se documentó como excepción explícita (no oculta): `superadmin` se crea llamando
a la misma API pública de PocketBase que `pb_client.crear_usuario()` ya usa internamente
(`POST /api/collections/users/records`, `role=admin`) — no un `INSERT` a ClickHouse, el mismo
mecanismo de creación de cuenta del resto del sistema. Las otras 6 cuentas pasan 100% por los
dos endpoints reales, con el token de `superadmin` recién creada.

Probado idempotente contra el stack ya poblado de S14-P3 (las 7 cuentas ya existían): las 7
correctamente detectadas como "ya existía", cero duplicados, cero fallos.

### Fase 3 — Mapeo monto → plan robusto

`etl/gold_ch/adquisicion.py`: `DIM_PLAN` ya no se filtra por `activo=1`. Contador
`transacciones_no_mapeadas` calculado UNA vez sobre el universo completo de transacciones (no
dentro del loop por período, que lo habría contado varias veces según la granularidad),
registrado siempre en `GOLD_ETL_LOG.detalle` (`estado='advertencia'` si > 0) y en el `print` del
módulo — nunca en silencio.

**Resultado real, confirmado tras correr el DAG completo (60 tareas)**: **42 transacciones de
suscripción sin plan mapeado**, consistente en las 5 granularidades (`GOLD_ETL_LOG` muestra la
misma cifra en cada corrida). No se investigó la causa raíz en este bloque (fuera de alcance de
la Fase 3, que pedía visibilidad, no una cacería); candidato más probable: `DIM_PLAN` tiene dos
filas para `plan_id='premium'` (9.99 y 12.99, un cambio de precio histórico) — no todas las
transacciones antiguas necesariamente coinciden con el precio vigente.

### Fase 4 — Volumen de regalías

`etl/gold/expandir_contratos_regalias.py` (corrida única, no forma parte del pipeline
recurrente): retrofecha los 3 contratos existentes (`vigente_desde` repartido en el primer
tercio de la ventana, no el mismo día) e inserta 19 contratos nuevos sobre contrapartes 100%
reales — **8 sellos** (todas las filas de `DIM_SELLO_DISCOGRAFICO`) + **11 cuentas de artista**
(todas las filas de `DIM_CUENTA_ARTISTA`) — **22 contratos totales**, `fact_id_track` asignado
de los 40 tracks reales con más reproducciones (no al azar sobre las ~113k canciones, la
mayoría sin ninguna reproducción en la ventana).

**Hallazgo real durante la verificación, no anticipado por el enunciado**: `FACT_LIQUIDACION_
REGALIA.fecha_calculo` es "cuándo se corrió el cálculo" (`DEFAULT now()`), no el período que la
liquidación cubre — bucketear `GOLD_REGALIAS_PERIODO` por ahí (como hacía el módulo desde
S13-P3a) dejaba TODAS las liquidaciones de una corrida en batch agrupadas en el período Gold de
"hoy", sin importar que `periodo_inicio`/`periodo_fin` cubrieran 24 meses distintos. Con más
contratos esto se iba a notar todavía más (398 liquidaciones nuevas, casi todas cayendo en un
solo período). Se cambió `etl/gold_ch/regalias.py` para bucketear por `periodo_inicio` — sin
este cambio, ampliar los contratos no habría resuelto el problema real de la Fase 4.

**Resultado real**: `FACT_LIQUIDACION_REGALIA` pasó de 55 a 453 filas. `GOLD_REGALIAS_PERIODO`
en granularidad `mes` tiene datos en los 24 meses reales de la ventana (`2024-09` a `2026-08`,
verificado con `count(DISTINCT periodo)` sobre el rango vigente); en `trimestre`, los 8
trimestres vigentes también. Sin períodos vacíos dentro de la ventana oficial de cada
granularidad.

### Fase 5 — Generación bajo demanda con relleno de huecos

**Decisión de alcance, documentada**: de los 13 dominios de `backfill_negocio.py`, solo 10
soportan relleno de huecos por mes (`usuarios`, `gasto_marketing`, `publicidad`, `engagement`,
`regalias`, `disponibilidad`, `api_partners`, `comunidad`, `denuncias_tickets`, `producto`).
Quedan fuera, con motivo real: `suscripciones` simula el ciclo de vida COMPLETO de una
suscripción por usuario en una sola pasada (volver a invocarla por mes duplicaría
transacciones); `contenido` genera un N fijo disperso al azar en todo el rango, no una cantidad
por mes; `auditoria` deriva de otros dominios ya generados, no tiene generación propia.

Mecanismo: las 13 funciones de `backfill_negocio.py` ganaron un parámetro `clave_control`
(idempotencia parametrizable — `ETL_BATCH_CONTROL` con checksum `backfill_negocio:<dominio>:<mes>`,
conviviendo con el flag de todo-el-dominio que ya usa el backfill histórico de S14-P3, sin
pisarse). `generar_actividad_rango()` recorre el rango pedido mes a mes, salta los ya cubiertos.

**Bug real encontrado y corregido durante la verificación**: la primera versión de
`dag_generar_bajo_demanda` encadenaba el refresco de Gold con `TriggerDagRunOperator(...,
wait_for_completion=True)`. La tarea que espera compite por el mismo SQLite de metadata de
Airflow que el propio `SequentialExecutor` está usando para correr las 60 tareas del refresco —
mismo quirk de infraestructura ya documentado en sesiones anteriores ("el scheduler puede morir
en silencio" por `database is locked`). Un lock transitorio hizo fallar la tarea durante el
polling; el reintento automático (`retries=1` heredado de `default_args`) volvió a intentar
`trigger_dag()` con el mismo `run_id` determinístico que el intento anterior YA había creado
con éxito → `DagRunAlreadyExists`. La corrida de `dag_gold_aggregations` en sí terminó bien sola
(confirmado en `airflow dags list-runs`), pero la tarea que "encadenaba" quedó marcada `failed`.
Corregido: `wait_for_completion=False` (dispara y sigue, sin bloquear un slot del executor),
`retries=0` en esa tarea puntual (un reintento de un disparo *fire-and-forget* no aporta nada y
puede duplicar el `dag_run`), sin `trigger_run_id` fijo (Airflow genera uno único por disparo).
El estado del refresco se consulta aparte, vía `GET /simulacion/estado` (con refetch espaciado
cada 15s en el frontend, no polling apretado).

`POST /simulacion/generar-historico` + `GET /simulacion/estado`: router propio
(`router_bajo_demanda`) en `api/paquetes/simulacion/router.py`, gateado por
`require_rol_admin("admin_datos")` (más permisivo que el `require_admin` del router original —
`superadmin` también pasa siempre). `SimulacionPage.tsx` gana una sección de generación
histórica (selector de rango + dominios) y una tabla de estado (última corrida por dominio de
negocio y por tabla Gold) — panel interno, sin ningún concepto de generación/seeds/DAGs
expuesto fuera de esa página.

**Circuito probado de punta a punta, dos veces** (la primera reveló el bug de arriba, la
segunda —ya con el fix— corrió limpia): se borró `FACT_DISPONIBILIDAD` + `GOLD_
INFRAESTRUCTURA_PERIODO` de un mes real (marzo y abril de 2026, uno por corrida), se disparó
`POST /simulacion/generar-historico` como `admin_datos`, y se confirmó por consulta directa a
ClickHouse que ambas capas volvieron a su conteo real exacto (120 filas en `FACT_
DISPONIBILIDAD`, 4 en `GOLD_INFRAESTRUCTURA_PERIODO`, en los dos casos).

### Fase 6 — Verificación real

1. **Prueba de arranque limpio** — ver Fase 6.1 abajo (la más importante del bloque).
2. **`sum(es_estimado) = 0`** en las 12 tablas Gold, confirmado de nuevo tras los cambios de
   Fase 3/4 (0/0/0/.../0 — las 12 en cero).
3. **Contador de transacciones no mapeadas**: **42**, consistente en las 5 granularidades (ver
   Fase 3).
4. **Regalías sin períodos vacíos**: confirmado en `mes` (24/24 meses reales con datos) y
   `trimestre` (8/8 trimestres reales con datos) — ver Fase 4.
5. **Circuito de relleno de huecos**: ver Fase 5 — probado de punta a punta, dos veces.
6. **`npm run build`**: verde. `npm run type-check`: los mismos 3 errores preexistentes de
   `EngagementPage.tsx` (no tocado en este bloque, ya documentados en S14-P1) — cero errores en
   `packages/simulacion/*`.

### Fase 6.1 — Prueba de arranque limpio (la más importante del bloque)

Clon nuevo en `/tmp/tracklytics_s14p4_clean` (5 commits de este bloque ya aplicados, sin push
todavía), stack levantado con `docker compose -p tracklytics_s14p4test up --build -d` en paralelo
al stack principal (nombres de contenedor y puertos remapeados +10000 solo en el clon, para no
chocar — footnote de metodología de prueba, no cambio de producto).

**Dos bugs reales de producto encontrados, ambos invisibles hasta esta prueba** porque el volumen
`pb_data` del stack principal lleva semanas vivo con un superusuario de PocketBase creado a mano
en algún momento — ningún camino de código lo había ejercitado desde cero:

1. **PocketBase no crea ningún superusuario en un volumen `pb_data` genuinamente vacío.** Sin él,
   `pb-init` no puede autenticarse (`400` contra `_superusers/auth-with-password`) y no agrega los
   campos custom `role`/`pais` a la colección `users`. La imagen (`ghcr.io/muchobien/pocketbase`)
   ya soporta bootstrap automático vía `PB_ADMIN_EMAIL`/`PB_ADMIN_PASSWORD` (confirmado leyendo su
   `entrypoint.sh`) — el servicio `pocketbase` de `docker-compose.yml` simplemente no los pasaba.
   Fix: agregar esas dos variables, reutilizando `POCKETBASE_EMAIL`/`POCKETBASE_PASSWORD` (las
   mismas que `pb-init` ya usa para autenticarse).
2. **Carrera entre `pb-init` y `seed-cuentas-demo`.** `pb-init` es quien agrega `role`/`pais` a la
   colección `users`; `seed-cuentas-demo` solo dependía de `api: service_healthy`, que no espera a
   `pb-init`. En un arranque genuinamente limpio ambos podían arrancar casi al mismo tiempo:
   `seed-cuentas-demo` creaba la cuenta `superadmin` (bootstrap directo a PocketBase, ver Fase 2)
   ANTES de que esos campos existieran en el esquema — PocketBase descarta en silencio los campos
   desconocidos al insertar, así que la cuenta quedaba sin `role` en absoluto. El auto-backfill a
   superadmin (`deps.py::_asegurar_superadmin`, que depende de `record.role == "admin"`) nunca se
   disparaba, y las 6 asignaciones de rol siguientes fallaban con `403 "Esta operación requiere un
   rol administrativo distinto"`. Fix: `seed-cuentas-demo` ahora también depende de
   `pb-init: condition: service_completed_successfully`.

Con los dos fixes, se repitió la prueba desde cero (`down -v` + `up --build -d`): las 7 cuentas se
crearon y **las 7 recibieron su rol administrativo correctamente**, confirmado con login real de
cada una contra la API del clon. Dos reintentos idempotentes de `seed-cuentas-demo` fueron
necesarios por `httpx.ReadTimeout` — artefacto de correr dos stacks completos en paralelo en la
misma máquina (contención de recursos, no un bug de lógica): cada reintento retomó exactamente
donde el anterior se había quedado (cuentas/roles ya creados detectados y saltados), sin duplicar
nada — el propio comportamiento idempotente pedido en la Fase 2 absorbió la inestabilidad del
entorno de prueba.

`dag_backfill_negocio` disparado en el clon: **el paso de regalías corrió limpio, sin fallar**
(`ETL_BATCH_CONTROL` registra `backfill_negocio:regalias` completado, seguido de
`disponibilidad`/`api_partners` — la cadena siguió avanzando después de regalías, la prueba
explícita que pedía el enunciado). `DIM_CONTRATO_REGALIA` tiene 0 filas en este clon (los 22
contratos de la Fase 4 se insertaron a mano solo contra el ClickHouse del stack principal, nunca
como parte del DDL versionado) — la liquidación de ese paso corrió sin error y sin liquidaciones,
comportamiento correcto ante cero contratos, no una falla.

**Hallazgo nuevo, real, y explícitamente fuera de alcance de este bloque**: el DAG sí falló más
adelante, en `backfill_comunidad` (`ValueError: a cannot be empty unless no samples are taken`
sobre `rng.choice(fact_ids)`). Causa raíz: `fact_ids` sale de `FACT_TRACKS WHERE source_type =
'real'`, vacía en el clon porque el catálogo principal (113.550 tracks reales) se carga vía el DAG
de Airflow `tracklytics_etl` (bronze→silver→gold→synthetic→log) — no vía el servicio `etl` de
Docker Compose, que está huérfano desde hace tiempo (`python: can't open file '/app/main.py'`,
confirmado que también sale así, sin romper nada, en el stack principal — quirk ya documentado).
El README promete que `docker compose up -d` "es suficiente para levantar todo", pero
`tracklytics_etl` no se dispara solo en un volumen ClickHouse vacío — en el stack principal ya
había corrido hace semanas. Esto es un gap real de arranque limpio, pero de una capability
distinta (`catalogo`/ETL principal, no `simulacion`/`seguridad`/`regalias`) y no lo que este
bloque pedía verificar (que `dag_backfill_negocio` no fallara en regalías por falta de cuentas,
que sí se resolvió). Queda documentado para un bloque futuro, no forzado a entrar aquí bajo
presión de tiempo/recursos — dos stacks completos corriendo en paralelo en la misma máquina
durante esta prueba ya venían generando timeouts por contención; forzar además la carga completa
del catálogo (113k tracks, más lenta que `pb-init`) no era razonable en esa misma ventana.

Verificado y luego **detenido sin borrar** (`docker compose stop`, no `down`) — datos y volúmenes
del clon de prueba intactos por si hace falta reinspeccionar.

### Archivos nuevos o modificados (S14-P4)

- `etl/gold/backfill_negocio.py` — credenciales por env var (Fase 1); `clave_control` en las 13
  funciones + `generar_actividad_rango()` (Fase 5).
- `etl/gold/expandir_contratos_regalias.py` — nuevo, corrida única (Fase 4).
- `etl/gold_ch/adquisicion.py` — sin filtro `activo=1`, contador `transacciones_no_mapeadas`
  (Fase 3).
- `etl/gold_ch/regalias.py` — bucketing por `periodo_inicio` en vez de `fecha_calculo` (Fase 4).
- `etl/dags/dag_generar_bajo_demanda.py` — nuevo, `wait_for_completion=False` (Fase 5).
- `api/paquetes/simulacion/router.py` — `router_bajo_demanda`, `/generar-historico`, `/estado`
  (Fase 5).
- `api/main.py` — registra `router_bajo_demanda`.
- `seed_cuentas_demo.py` + `seed_cuentas_demo_Dockerfile` — nuevo, siembra idempotente (Fase 2).
- `docker-compose.yml` — healthcheck de `api`; servicio `seed-cuentas-demo`; `SUPERADMIN_DEMO_*`
  en `airflow` (Fase 1-2); `PB_ADMIN_EMAIL`/`PB_ADMIN_PASSWORD` en `pocketbase` y dependencia
  `seed-cuentas-demo → pb-init: service_completed_successfully` (Fase 6.1, los dos bugs reales de
  arranque limpio).
- `frontend/src/packages/simulacion/{types.ts,api/simulacion.api.ts,pages/SimulacionPage.tsx,
  pages/SimulacionPage.module.css}` — sección de generación histórica + tabla de estado (Fase 5).
- `docs/CUENTAS_DEMO.md` — nota de auto-siembra.
- `openspec/changes/2026-08-05-s14-p4-correcciones-generacion-bajo-demanda/` — deltas de
  `simulacion`, `seguridad`, `regalias`.
