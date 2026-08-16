## 1. Multi-género en subida de artista

- [x] 1.1 `ALTER TABLE STG_ARTIST_UPLOADS ADD COLUMN genre_ids Array(UInt16) DEFAULT [genre_id]` en la base viva + backfill de filas existentes
- [x] 1.2 Actualizar DDL de `init_clickhouse.py` para clones nuevos
- [x] 1.3 `SubidaTrackBody`/`EditarTrackBody`: `genre_id` → `genre_ids: list[int]` (máx. 5), validando existencia de cada género
- [x] 1.4 `promover_a_fact_tracks`: una fila de `FACT_TRACKS` por género, mismo `track_id`
- [x] 1.5 `retirar_track`: takedown por `track_id` (todas las filas), no por `fact_id_promovido` (un solo género)
- [x] 1.6 Frontend: selector multi-género (checkboxes) en el formulario de subida y en la edición de track

## 2. Badge de contenido explícito en catálogo

- [x] 2.1 Exponer `explicit_id` en las queries de listado/detalle de catálogo (`TRACKS_TOP`, `TRACKS_BY_ARTIST`, `TRACKS_BY_ALBUM`, `TRACKS_BY_GENRE`, `TRACK_DETAIL`, `TRACK_DETAIL_BY_FACT_ID`, `tracks_search_sql`, búsqueda unificada)
- [x] 2.2 Badge "E" en `TrackName` (componente compartido), consumido por TrackCard/TrackGridCard/TrackDetailPage/SearchResultsPage

## 3. Notificación de respuesta a comentario

- [x] 3.1 `_notificar_comentario`: la rama de respuesta referencia `referencia_tipo="track"` + `fact_id_track`, igual que la de comentario raíz

## 4. Vista de artista: comentarios recibidos

- [x] 4.1 Enlace "Comentarios" por track propio ya promovido, hacia la página de comentarios ya existente (`/social/track/:factId`)

## 5. Relevancia textual en búsqueda

- [x] 5.1 `RELEVANCIA_TEXTO_EXPR` (multiIf: exacto=3, prefijo=2, parcial=1) en `queries.py`
- [x] 5.2 `tracks_search_sql` acepta `order_clause`, aplicado en el ranking interno y en el orden final
- [x] 5.3 `tracks_search` (router): `order_clause` usa relevancia solo cuando hay `q`, popularidad sola en caso contrario

## 6. Verificación

- [x] 6.1 curl: subida con 3 géneros + explicit=true → verificado en ClickHouse (3 filas de FACT_TRACKS, mismo track_id, explicit_id=2)
- [x] 6.2 curl: retiro de track multi-género → verificado que las 3 filas quedan con disponible=0
- [x] 6.3 curl: `/tracks/search?q=bad` → coincidencias exactas ("Bad") antes que coincidencias parciales de popularidad 100 ("Badkidparis"/"Badflower"), confirmado contra el orden anterior (solo popularidad)
- [x] 6.4 curl: tiempo de respuesta en caliente sin degradación perceptible (~30ms con y sin relevancia)
- [x] 6.5 curl: notificación de respuesta a comentario → `referencia_tipo="track"` verificado en `FACT_NOTIFICACION`
