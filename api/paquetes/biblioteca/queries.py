FAVORITOS_ACTUALES = """
SELECT
    fav.fact_id    AS fact_id,
    ft.track_id    AS track_id,
    ft.track_name  AS track_name,
    a.name         AS artist_name,
    ft.duration_ms AS duration_ms,
    ga.genre_name  AS genre_name,
    coalesce(ft.imagen_url, al.imagen_url, a.imagen_url) AS imagen_url,
    ft.source_type AS source_type
FROM (
    SELECT
        fact_id,
        argMax(event_type, event_timestamp) AS last_event
    FROM FACT_ENGAGEMENT_USUARIO
    WHERE user_id = {user_id:String}
    GROUP BY fact_id
    HAVING last_event = 'favorito_add'
) fav
JOIN FACT_TRACKS ft ON fav.fact_id  = ft.fact_id
JOIN DIM_ARTISTS a  ON ft.artist_id = a.artist_id
LEFT JOIN DIM_ALBUMS al ON ft.album_id = al.album_id
-- Sin filtro de source_type en la subquery de género (S14-P1, mismo fix ya
-- aplicado en HISTORIAL_RECIENTE): un track 100% sintético no tiene ninguna
-- fila con otro source_type que resuelva su genre_name, y el INNER JOIN
-- dejaba fuera el favorito completo (portada incluida) aunque el evento sí
-- existiera.
JOIN (
    SELECT
        ft2.track_id,
        arrayStringConcat(groupUniqArray(g2.name), ' / ') AS genre_name
    FROM FACT_TRACKS ft2
    JOIN DIM_GENRES g2 ON ft2.genre_id = g2.genre_id
    GROUP BY ft2.track_id
) ga ON ga.track_id = ft.track_id
ORDER BY ft.fact_id
"""

HISTORIAL_RECIENTE = """
SELECT
    e.event_timestamp AS event_timestamp,
    e.fact_id         AS fact_id,
    ft.track_id       AS track_id,
    ft.track_name     AS track_name,
    a.name            AS artist_name,
    ft.duration_ms    AS duration_ms,
    ga.genre_name     AS genre_name,
    coalesce(ft.imagen_url, al.imagen_url, a.imagen_url) AS imagen_url,
    ft.source_type    AS source_type
FROM FACT_ENGAGEMENT_USUARIO e
JOIN FACT_TRACKS ft ON e.fact_id    = ft.fact_id
JOIN DIM_ARTISTS a  ON ft.artist_id = a.artist_id
LEFT JOIN DIM_ALBUMS al ON ft.album_id = al.album_id
-- Sin filtro de source_type: a diferencia de FAVORITOS_ACTUALES/TRACKS_BY_FACT_IDS
-- (que sí excluyen 'synthetic' aquí), un track 100% sintético no tiene ninguna
-- fila con otro source_type que resuelva su genre_name, y el INNER JOIN dejaba
-- fuera todo el historial de ese track aunque el evento sí existiera. Criterio
-- ya establecido en creadores: source_type no es ciudadano de segunda clase en
-- vistas de usuario, solo se excluye de promedios de audio.
JOIN (
    SELECT
        ft2.track_id,
        arrayStringConcat(groupUniqArray(g2.name), ' / ') AS genre_name
    FROM FACT_TRACKS ft2
    JOIN DIM_GENRES g2 ON ft2.genre_id = g2.genre_id
    GROUP BY ft2.track_id
) ga ON ga.track_id = ft.track_id
WHERE e.user_id    = {user_id:String}
  AND e.event_type = 'reproduccion'
ORDER BY e.event_timestamp DESC
LIMIT {limit:UInt32}
"""

COUNT_FAVORITOS = """
SELECT count() AS total
FROM (
    SELECT fact_id, argMax(event_type, event_timestamp) AS last_event
    FROM FACT_ENGAGEMENT_USUARIO
    WHERE user_id = {user_id:String}
    GROUP BY fact_id
    HAVING last_event = 'favorito_add'
)
"""

FACT_ID_EXISTS = """
SELECT 1 FROM FACT_TRACKS WHERE fact_id = {fact_id:UInt64} LIMIT 1
"""

# Hidratación en batch para tracks de una playlist (PocketBase solo guarda
# fact_id/position en `playlist_tracks` — el detalle real vive en ClickHouse).
TRACKS_BY_FACT_IDS = """
SELECT
    ft.fact_id     AS fact_id,
    ft.track_id    AS track_id,
    ft.track_name  AS track_name,
    a.name         AS artist_name,
    ft.duration_ms AS duration_ms,
    ga.genre_name  AS genre_name,
    coalesce(ft.imagen_url, al.imagen_url, a.imagen_url) AS imagen_url,
    ft.source_type AS source_type
FROM FACT_TRACKS ft
JOIN DIM_ARTISTS a ON ft.artist_id = a.artist_id
LEFT JOIN DIM_ALBUMS al ON ft.album_id = al.album_id
-- Sin filtro de source_type en la subquery de género (S14-P1, mismo fix ya
-- aplicado en HISTORIAL_RECIENTE): un track de playlist 100% sintético no
-- tiene fila con otro source_type que resuelva su genre_name, y el INNER
-- JOIN lo hacía desaparecer del todo de la playlist (portada incluida) en
-- vez de solo perder el género.
JOIN (
    SELECT
        ft2.track_id,
        arrayStringConcat(groupUniqArray(g2.name), ' / ') AS genre_name
    FROM FACT_TRACKS ft2
    JOIN DIM_GENRES g2 ON ft2.genre_id = g2.genre_id
    GROUP BY ft2.track_id
) ga ON ga.track_id = ft.track_id
WHERE ft.fact_id IN {fact_ids:Array(UInt64)}
"""
