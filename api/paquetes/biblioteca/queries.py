FAVORITOS_ACTUALES = """
SELECT
    fav.fact_id    AS fact_id,
    ft.track_id    AS track_id,
    ft.track_name  AS track_name,
    a.name         AS artist_name,
    ft.duration_ms AS duration_ms,
    ga.genre_name  AS genre_name
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
JOIN (
    SELECT
        ft2.track_id,
        arrayStringConcat(groupUniqArray(g2.name), ' / ') AS genre_name
    FROM FACT_TRACKS ft2
    JOIN DIM_GENRES g2 ON ft2.genre_id = g2.genre_id
    WHERE ft2.is_synthetic = 0
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
    ga.genre_name     AS genre_name
FROM FACT_ENGAGEMENT_USUARIO e
JOIN FACT_TRACKS ft ON e.fact_id    = ft.fact_id
JOIN DIM_ARTISTS a  ON ft.artist_id = a.artist_id
JOIN (
    SELECT
        ft2.track_id,
        arrayStringConcat(groupUniqArray(g2.name), ' / ') AS genre_name
    FROM FACT_TRACKS ft2
    JOIN DIM_GENRES g2 ON ft2.genre_id = g2.genre_id
    WHERE ft2.is_synthetic = 0
    GROUP BY ft2.track_id
) ga ON ga.track_id = ft.track_id
WHERE e.user_id    = {user_id:String}
  AND e.event_type = 'reproduccion'
ORDER BY e.event_timestamp DESC
LIMIT {limit:UInt32}
"""

FACT_ID_EXISTS = """
SELECT 1 FROM FACT_TRACKS WHERE fact_id = {fact_id:UInt64} LIMIT 1
"""
