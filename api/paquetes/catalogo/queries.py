TRACKS_TOP = """
SELECT
    min(ft.fact_id)                                   AS fact_id,
    ft.track_id,
    ft.track_name,
    a.name                                            AS artist_name,
    arrayStringConcat(groupUniqArray(g.name), ' / ') AS genre_name,
    max(ft.popularity)                                AS popularity,
    any(ft.duration_ms)                               AS duration_ms,
    any(ft.danceability)                              AS danceability,
    any(ft.energy)                                    AS energy,
    any(ft.valence)                                   AS valence
FROM FACT_TRACKS ft
JOIN DIM_ARTISTS a ON ft.artist_id = a.artist_id
JOIN DIM_GENRES  g ON ft.genre_id  = g.genre_id
WHERE ft.is_synthetic = 0
GROUP BY ft.track_id, ft.track_name, ft.artist_id, a.name
ORDER BY popularity DESC
LIMIT {limit:UInt32}
SETTINGS use_query_cache = 1, query_cache_ttl = 120, query_cache_share_between_users = 1
"""

TRACKS_BY_ARTIST = """
SELECT
    min(ft.fact_id)                                   AS fact_id,
    ft.track_id,
    ft.track_name,
    any(ft.popularity)                                AS popularity,
    any(ft.duration_ms)                               AS duration_ms,
    any(ft.danceability)                              AS danceability,
    any(ft.energy)                                    AS energy,
    any(ft.valence)                                   AS valence,
    a.name                                            AS artist_name,
    arrayStringConcat(groupUniqArray(g.name), ' / ') AS genre_name
FROM FACT_TRACKS ft
JOIN DIM_ARTISTS a ON ft.artist_id = a.artist_id
JOIN DIM_GENRES  g ON ft.genre_id  = g.genre_id
WHERE ft.artist_id = {artist_id:Int32}
GROUP BY ft.track_id, ft.track_name, ft.artist_id, a.name
ORDER BY any(ft.popularity) DESC
LIMIT {limit:UInt32}
"""

TRACKS_BY_ALBUM = """
SELECT
    min(ft.fact_id)                              AS fact_id,
    ft.track_id,
    ft.track_name,
    any(ft.popularity)                           AS popularity,
    any(ft.duration_ms)                          AS duration_ms,
    any(ft.danceability)                         AS danceability,
    any(ft.energy)                               AS energy,
    any(ft.valence)                              AS valence,
    a.name                                       AS artist_name,
    arrayStringConcat(groupUniqArray(g.name), ' / ') AS genre_name
FROM FACT_TRACKS ft
JOIN DIM_ARTISTS a ON ft.artist_id = a.artist_id
JOIN DIM_GENRES  g ON ft.genre_id  = g.genre_id
WHERE ft.album_id = {album_id:Int32}
GROUP BY ft.track_id, ft.track_name, ft.artist_id, a.name
ORDER BY ft.track_name
LIMIT {limit:UInt32}
"""

TRACKS_BY_GENRE = """
SELECT
    ft.fact_id, ft.track_id, ft.track_name, ft.popularity, ft.duration_ms,
    ft.danceability, ft.energy, ft.valence,
    a.name AS artist_name,
    g.name AS genre_name
FROM FACT_TRACKS ft
JOIN DIM_GENRES  g ON ft.genre_id  = g.genre_id
JOIN DIM_ARTISTS a ON ft.artist_id = a.artist_id
WHERE ft.genre_id = {genre_id:Int32}
ORDER BY ft.popularity DESC
LIMIT {limit:UInt32}
"""

TRACK_DETAIL = """
SELECT
    ft.track_id, ft.track_name,
    any(ft.popularity)                                AS popularity,
    any(ft.duration_ms)                               AS duration_ms,
    any(ft.danceability)                              AS danceability,
    any(ft.energy)                                    AS energy,
    any(ft.loudness)                                  AS loudness,
    any(ft.speechiness)                               AS speechiness,
    any(ft.acousticness)                              AS acousticness,
    any(ft.instrumentalness)                          AS instrumentalness,
    any(ft.liveness)                                  AS liveness,
    any(ft.valence)                                   AS valence,
    any(ft.tempo)                                     AS tempo,
    a.name                                            AS artist_name,
    ft.artist_id                                      AS artist_id,
    al.name                                           AS album_name,
    ft.album_id                                       AS album_id,
    arrayStringConcat(groupUniqArray(g.name), ' / ') AS genre_name
FROM FACT_TRACKS ft
JOIN DIM_ARTISTS a  ON ft.artist_id = a.artist_id
JOIN DIM_ALBUMS  al ON ft.album_id  = al.album_id
JOIN DIM_GENRES  g  ON ft.genre_id  = g.genre_id
WHERE ft.track_id = {track_id:String}
GROUP BY ft.track_id, ft.track_name, ft.artist_id, a.name, ft.album_id, al.name
LIMIT 1
"""

ARTISTS_TOP = """
SELECT
    a.artist_id                  AS artist_id,
    a.name                       AS name,
    count()                      AS track_count,
    round(avg(ft.popularity), 2) AS avg_popularity
FROM FACT_TRACKS ft
JOIN DIM_ARTISTS a ON ft.artist_id = a.artist_id
GROUP BY a.artist_id, a.name
ORDER BY track_count DESC
LIMIT {limit:UInt32}
"""

ARTISTS_SEARCH = """
SELECT
    a.artist_id AS artist_id,
    a.name      AS name,
    count()     AS track_count
FROM FACT_TRACKS ft
JOIN DIM_ARTISTS a ON ft.artist_id = a.artist_id
WHERE lower(a.name) LIKE lower({pattern:String})
GROUP BY a.artist_id, a.name
ORDER BY track_count DESC
LIMIT {limit:UInt32}
"""

ARTIST_DETAIL = """
SELECT
    a.artist_id  AS artist_id,
    a.name       AS name,
    a.country    AS country,
    a.record_label AS record_label,
    count()                          AS track_count,
    round(avg(ft.popularity),    2)  AS avg_popularity,
    round(avg(ft.energy),        4)  AS avg_energy,
    round(avg(ft.danceability),  4)  AS avg_danceability,
    round(avg(ft.valence),       4)  AS avg_valence
FROM FACT_TRACKS ft
JOIN DIM_ARTISTS a ON ft.artist_id = a.artist_id
WHERE a.artist_id = {artist_id:Int32}
GROUP BY a.artist_id, a.name, a.country, a.record_label
"""

ALBUMS_SEARCH = """
SELECT
    al.album_id  AS album_id,
    al.name      AS name,
    al.release_year AS release_year,
    count()      AS track_count
FROM FACT_TRACKS ft
JOIN DIM_ALBUMS al ON ft.album_id = al.album_id
WHERE lower(al.name) LIKE lower({pattern:String})
GROUP BY al.album_id, al.name, al.release_year
ORDER BY track_count DESC
LIMIT {limit:UInt32}
"""

ALBUM_DETAIL = """
SELECT
    al.album_id           AS album_id,
    al.name               AS name,
    al.release_year       AS release_year,
    al.album_type         AS album_type,
    al.total_tracks_listed AS total_tracks_listed,
    al.language           AS language,
    count(DISTINCT ft.track_id)  AS track_count,
    round(avg(ft.popularity), 2) AS avg_popularity
FROM FACT_TRACKS ft
JOIN DIM_ALBUMS al ON ft.album_id = al.album_id
WHERE al.album_id = {album_id:Int32}
GROUP BY al.album_id, al.name, al.release_year, al.album_type,
         al.total_tracks_listed, al.language
"""

GENRES_LIST = "SELECT genre_id AS genre_id, name AS name, mood AS mood FROM DIM_GENRES ORDER BY name"

GENRE_DETAIL = """
SELECT
    g.genre_id     AS genre_id,
    g.name         AS name,
    g.parent_genre AS parent_genre,
    g.mood         AS mood,
    g.origin_decade AS origin_decade,
    count()                      AS track_count,
    round(avg(ft.popularity), 2) AS avg_popularity
FROM FACT_TRACKS ft
JOIN DIM_GENRES g ON ft.genre_id = g.genre_id
WHERE g.genre_id = {genre_id:Int32}
GROUP BY g.genre_id, g.name, g.parent_genre, g.mood, g.origin_decade
"""


TRACK_DETAIL_BY_FACT_ID = """
SELECT
    min(ft.fact_id)                                   AS fact_id,
    ft.track_id, ft.track_name,
    any(ft.popularity)                                AS popularity,
    any(ft.duration_ms)                               AS duration_ms,
    any(ft.danceability)                              AS danceability,
    any(ft.energy)                                    AS energy,
    any(ft.loudness)                                  AS loudness,
    any(ft.speechiness)                               AS speechiness,
    any(ft.acousticness)                              AS acousticness,
    any(ft.instrumentalness)                          AS instrumentalness,
    any(ft.liveness)                                  AS liveness,
    any(ft.valence)                                   AS valence,
    any(ft.tempo)                                     AS tempo,
    a.name                                            AS artist_name,
    ft.artist_id                                      AS artist_id,
    al.name                                           AS album_name,
    ft.album_id                                       AS album_id,
    arrayStringConcat(groupUniqArray(g.name), ' / ') AS genre_name,
    any(g.genre_id)                                   AS genre_id
FROM FACT_TRACKS ft
JOIN DIM_ARTISTS a  ON ft.artist_id = a.artist_id
JOIN DIM_ALBUMS  al ON ft.album_id  = al.album_id
JOIN DIM_GENRES  g  ON ft.genre_id  = g.genre_id
WHERE ft.track_id = (SELECT track_id FROM FACT_TRACKS WHERE fact_id = {fact_id:Int64} LIMIT 1)
GROUP BY ft.track_id, ft.track_name, ft.artist_id, a.name, ft.album_id, al.name
"""


def tracks_search_sql(where: str) -> str:
    return f"""
SELECT
    min(ft.fact_id)                                   AS fact_id,
    ft.track_id,
    ft.track_name,
    a.name                                            AS artist_name,
    arrayStringConcat(groupUniqArray(g.name), ' / ') AS genre_name,
    any(ft.popularity)                                AS popularity,
    any(ft.duration_ms)                               AS duration_ms,
    any(ft.danceability)                              AS danceability,
    any(ft.energy)                                    AS energy,
    any(ft.valence)                                   AS valence
FROM FACT_TRACKS ft
JOIN DIM_ARTISTS a ON ft.artist_id = a.artist_id
JOIN DIM_GENRES  g ON ft.genre_id  = g.genre_id
{where}
GROUP BY ft.track_id, ft.track_name, ft.artist_id, a.name
ORDER BY any(ft.popularity) DESC
LIMIT {{limit:UInt32}} OFFSET {{offset:UInt32}}
"""


def tracks_search_count_sql(where: str) -> str:
    return f"""
SELECT count(DISTINCT ft.track_id) AS total
FROM FACT_TRACKS ft
JOIN DIM_ARTISTS a ON ft.artist_id = a.artist_id
JOIN DIM_GENRES  g ON ft.genre_id  = g.genre_id
{where}
"""
