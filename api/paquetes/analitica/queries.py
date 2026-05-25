GENRES_TRENDS = """
SELECT
    g.genre_id                      AS genre_id,
    g.name                          AS name,
    round(avg(ft.popularity), 2)    AS avg_popularity,
    count()                         AS track_count,
    round(avg(ft.energy), 4)        AS avg_energy,
    round(avg(ft.danceability), 4)  AS avg_danceability,
    round(avg(ft.valence), 4)       AS avg_valence
FROM FACT_TRACKS ft
JOIN DIM_GENRES g ON ft.genre_id = g.genre_id
GROUP BY g.genre_id, g.name
ORDER BY track_count DESC
LIMIT {limit:UInt32}
OFFSET {offset:UInt32}
"""

GENRES_TOTAL = "SELECT uniq(genre_id) AS n FROM FACT_TRACKS"

GENRE_AUDIO_PROFILE = """
SELECT
    g.genre_id                         AS genre_id,
    g.name                             AS name,
    round(avg(ft.danceability),     4) AS danceability,
    round(avg(ft.energy),           4) AS energy,
    round(avg(ft.speechiness),      4) AS speechiness,
    round(avg(ft.acousticness),     4) AS acousticness,
    round(avg(ft.instrumentalness), 4) AS instrumentalness,
    round(avg(ft.liveness),         4) AS liveness,
    round(avg(ft.valence),          4) AS valence,
    round(avg(ft.tempo),            2) AS avg_tempo,
    round(avg(ft.loudness),         2) AS avg_loudness
FROM FACT_TRACKS ft
JOIN DIM_GENRES g ON ft.genre_id = g.genre_id
WHERE g.genre_id = {genre_id:Int32}
GROUP BY g.genre_id, g.name
"""

ARTISTS_SEARCH = """
SELECT artist_id, name
FROM DIM_ARTISTS
WHERE lower(name) LIKE lower({pattern:String})
ORDER BY name
LIMIT {limit:UInt32}
OFFSET {offset:UInt32}
"""

ARTISTS_SEARCH_TOTAL = """
SELECT count() AS n FROM DIM_ARTISTS WHERE lower(name) LIKE lower({pattern:String})
"""

ARTIST_STATS = """
SELECT
    a.artist_id                      AS artist_id,
    a.name                           AS name,
    count()                          AS track_count,
    round(avg(ft.popularity),   2)   AS avg_popularity,
    round(avg(ft.energy),       4)   AS avg_energy,
    round(avg(ft.danceability), 4)   AS avg_danceability,
    round(avg(ft.valence),      4)   AS avg_valence,
    countIf(ft.explicit_id = 1)      AS explicit_count
FROM FACT_TRACKS ft
JOIN DIM_ARTISTS a ON ft.artist_id = a.artist_id
WHERE a.artist_id = {artist_id:Int32}
GROUP BY a.artist_id, a.name
"""

ARTIST_GENRE_BENCHMARKS = """
SELECT
    g.name                        AS name,
    round(avg(ft2.popularity), 2) AS genre_avg_popularity
FROM FACT_TRACKS ft
JOIN DIM_ARTISTS a   ON ft.artist_id  = a.artist_id
JOIN DIM_GENRES  g   ON ft.genre_id   = g.genre_id
JOIN FACT_TRACKS ft2 ON ft2.genre_id  = g.genre_id
WHERE a.artist_id = {artist_id:Int32}
GROUP BY g.name
ORDER BY genre_avg_popularity DESC
"""

DASHBOARD_TOTAL_TRACKS  = "SELECT count() AS n FROM FACT_TRACKS"
DASHBOARD_TOTAL_ARTISTS = "SELECT count() AS n FROM DIM_ARTISTS"
DASHBOARD_TOTAL_GENRES  = "SELECT count() AS n FROM DIM_GENRES"

DASHBOARD_AUDIO_AVG = """
SELECT
    round(avg(popularity),   2) AS avg_popularity,
    round(avg(energy),       4) AS avg_energy,
    round(avg(danceability), 4) AS avg_danceability,
    round(avg(valence),      4) AS avg_valence,
    round(avg(tempo),        2) AS avg_tempo
FROM FACT_TRACKS
"""

DASHBOARD_TOP_GENRES = """
SELECT g.name AS name, count() AS track_count
FROM FACT_TRACKS ft
JOIN DIM_GENRES g ON ft.genre_id = g.genre_id
GROUP BY g.name
ORDER BY track_count DESC
LIMIT 10
"""

DASHBOARD_TOP_ARTISTS = """
SELECT a.name                          AS name,
       count()                         AS track_count,
       round(avg(ft.popularity), 2)    AS avg_popularity
FROM FACT_TRACKS ft
JOIN DIM_ARTISTS a ON ft.artist_id = a.artist_id
GROUP BY a.name
ORDER BY track_count DESC
LIMIT 10
"""

DASHBOARD_LAST_ETL = """
SELECT status, run_timestamp, records_inserted
FROM ETL_LOGS
ORDER BY run_timestamp DESC
LIMIT 1
"""

DASHBOARD_EXPLICIT_DIST = """
SELECT e.label AS explicit_label, count() AS track_count
FROM FACT_TRACKS ft
JOIN DIM_EXPLICIT_TYPE e ON ft.explicit_id = e.explicit_id
GROUP BY e.label
"""
