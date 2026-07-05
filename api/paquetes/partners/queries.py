from core.config import CH_DB as _DB

# Todas las queries usan referencias completas ({_DB}.TABLA) — esta API es un
# consumidor externo de solo lectura sobre el mismo ClickHouse existente, sin
# acoplarse a ninguna otra instancia ni tabla nueva del modelo técnico.

TRACKS_LIST = f"""
SELECT
    ft.fact_id, ft.track_id, ft.track_name,
    a.name  AS artist_name,
    g.name  AS genre_name,
    ft.popularity, ft.duration_ms,
    ft.danceability, ft.energy, ft.valence, ft.tempo,
    ft.loudness, ft.speechiness, ft.acousticness, ft.instrumentalness, ft.liveness
FROM {_DB}.FACT_TRACKS ft
JOIN {_DB}.DIM_ARTISTS a ON ft.artist_id = a.artist_id
JOIN {_DB}.DIM_GENRES  g ON ft.genre_id  = g.genre_id
ORDER BY ft.popularity DESC
LIMIT {{limit:UInt32}} OFFSET {{offset:UInt32}}
"""

TRACK_DETAIL = f"""
SELECT
    ft.fact_id, ft.track_id, ft.track_name,
    a.name  AS artist_name,
    g.name  AS genre_name,
    ft.popularity, ft.duration_ms,
    ft.danceability, ft.energy, ft.valence, ft.tempo,
    ft.loudness, ft.speechiness, ft.acousticness, ft.instrumentalness, ft.liveness
FROM {_DB}.FACT_TRACKS ft
JOIN {_DB}.DIM_ARTISTS a ON ft.artist_id = a.artist_id
JOIN {_DB}.DIM_GENRES  g ON ft.genre_id  = g.genre_id
WHERE ft.fact_id = {{fact_id:UInt64}}
"""

TRACKS_EXPORT = f"""
SELECT
    ft.fact_id, ft.track_id, ft.track_name,
    a.name  AS artist_name,
    g.name  AS genre_name,
    ft.popularity, ft.duration_ms,
    ft.danceability, ft.energy, ft.valence, ft.tempo,
    ft.loudness, ft.speechiness, ft.acousticness, ft.instrumentalness, ft.liveness
FROM {_DB}.FACT_TRACKS ft
JOIN {_DB}.DIM_ARTISTS a ON ft.artist_id = a.artist_id
JOIN {_DB}.DIM_GENRES  g ON ft.genre_id  = g.genre_id
ORDER BY ft.fact_id
LIMIT {{limit:UInt32}} OFFSET {{offset:UInt32}}
"""

# Nota: alias explícito en cada columna ambigua (p.ej. `a.artist_id AS artist_id`).
# FACT_TRACKS guarda artist_id/album_id/genre_id como FK con el mismo nombre que
# la PK de la dimensión correspondiente; sin el alias, ClickHouse desambigua el
# nombre de columna en el resultado como "a.artist_id" en vez de "artist_id".
ARTISTS_LIST = f"""
SELECT a.artist_id AS artist_id, a.name AS name, a.country AS country, count() AS track_count
FROM {_DB}.FACT_TRACKS ft
JOIN {_DB}.DIM_ARTISTS a ON ft.artist_id = a.artist_id
GROUP BY a.artist_id, a.name, a.country
ORDER BY track_count DESC
LIMIT {{limit:UInt32}} OFFSET {{offset:UInt32}}
"""

ARTIST_DETAIL = f"""
SELECT a.artist_id AS artist_id, a.name AS name, a.country AS country, s.nombre AS record_label, count() AS track_count
FROM {_DB}.FACT_TRACKS ft
JOIN {_DB}.DIM_ARTISTS a ON ft.artist_id = a.artist_id
LEFT JOIN {_DB}.DIM_SELLO_DISCOGRAFICO s ON a.sello_id = s.sello_id
WHERE a.artist_id = {{artist_id:Int32}}
GROUP BY a.artist_id, a.name, a.country, s.nombre
"""

ALBUMS_LIST = f"""
SELECT al.album_id AS album_id, al.name AS name, al.release_year AS release_year, count() AS track_count
FROM {_DB}.FACT_TRACKS ft
JOIN {_DB}.DIM_ALBUMS al ON ft.album_id = al.album_id
GROUP BY al.album_id, al.name, al.release_year
ORDER BY track_count DESC
LIMIT {{limit:UInt32}} OFFSET {{offset:UInt32}}
"""

ALBUM_DETAIL = f"""
SELECT al.album_id AS album_id, al.name AS name, al.release_year AS release_year, al.album_type AS album_type, count() AS track_count
FROM {_DB}.FACT_TRACKS ft
JOIN {_DB}.DIM_ALBUMS al ON ft.album_id = al.album_id
WHERE al.album_id = {{album_id:Int32}}
GROUP BY al.album_id, al.name, al.release_year, al.album_type
"""

GENRES_LIST = f"SELECT genre_id, name, mood FROM {_DB}.DIM_GENRES ORDER BY name LIMIT {{limit:UInt32}} OFFSET {{offset:UInt32}}"

GENRE_DETAIL = f"""
SELECT g.genre_id AS genre_id, g.name AS name, g.mood AS mood, count() AS track_count, round(avg(ft.popularity), 2) AS avg_popularity
FROM {_DB}.FACT_TRACKS ft
JOIN {_DB}.DIM_GENRES g ON ft.genre_id = g.genre_id
WHERE g.genre_id = {{genre_id:Int32}}
GROUP BY g.genre_id, g.name, g.mood
"""

# ── Métricas internas de uso (CU-O56, staff admin — no expuesto a `/partners/v1/*`) ──
# `partner_id = ''` corresponde a intentos rechazados antes de resolver un
# partner real (llave de API ausente/malformada, ver `deps.py::require_partner`
# → `_reject_auth`) — se excluyen porque no son atribuibles a ningún partner.
METRICAS_POR_PARTNER = f"""
SELECT
    partner_id,
    count()                                                      AS total_llamadas,
    countIf(resultado = 'success')                               AS llamadas_exitosas,
    countIf(resultado != 'success')                              AS llamadas_error,
    round(countIf(resultado = 'success') / count() * 100, 2)     AS tasa_exito_pct,
    round(avgIf(duracion_ms, resultado = 'success'), 2)          AS latencia_promedio_ms_exitosas
FROM {_DB}.LOG_LLAMADAS_PARTNER
WHERE partner_id != ''
GROUP BY partner_id
ORDER BY total_llamadas DESC
"""

# Desglose por tier: `tier_usado = ''` ocurre en llamadas rechazadas antes de
# resolver el tier del partner (ej. tier insuficiente sí lo trae, auth
# rechazada no) — se excluye del desglose por la misma razón que arriba.
METRICAS_POR_PARTNER_TIER = f"""
SELECT
    partner_id,
    tier_usado,
    count() AS total_llamadas
FROM {_DB}.LOG_LLAMADAS_PARTNER
WHERE partner_id != '' AND tier_usado != ''
GROUP BY partner_id, tier_usado
ORDER BY partner_id, total_llamadas DESC
"""
