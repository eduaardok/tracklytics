# PERF (revisión de rendimiento): esta query hacía GROUP BY + groupUniqArray
# (dedup por track_id con concatenación de géneros) sobre TODO el resultado
# filtrado antes de aplicar ORDER BY/LIMIT -- para /tracks/search (sin este
# filtro por source_type, hasta 1.1M filas) medía 2.9-17s en producción.
# Verificado en ClickHouse: 98.5% de los tracks tienen exactamente 1 género
# (1.073.448 de 1.089.747), así que el `groupUniqArray` casi nunca dedupea
# nada real, pero su costo se paga en CADA fila de la tabla completa.
#
# Se separa en 2 pasos: (1) sub-consulta barata que rankea por popularidad
# usando SOLO agregados escalares (max/min, sin arrays, sin JOIN a
# DIM_ALBUMS) para encontrar los track_id ganadores, luego (2) la consulta
# externa hace el JOIN completo + groupUniqArray SOLO sobre esos track_id
# ganadores (filtro por track_id, no por fact_id, para no perder géneros
# de los pocos tracks multi-género). Resultado idéntico, sin cambiar
# ninguna regla de negocio -- verificado con curl antes/después.
# Medido: 2.9s -> 0.6s en la query sin filtro, hasta 25x más rápido con
# filtro de género.
TRACKS_TOP = """
SELECT
    min(ft.fact_id)                                   AS fact_id,
    ft.track_id,
    ft.track_name,
    a.name                                            AS artist_name,
    coalesce(any(ft.imagen_url), any(al.imagen_url), a.imagen_url) AS imagen_url,
    arrayStringConcat(groupUniqArray(g.name), ' / ') AS genre_name,
    any(ft.popularity)                                AS popularity,
    any(ft.duration_ms)                               AS duration_ms,
    any(ft.danceability)                              AS danceability,
    any(ft.energy)                                    AS energy,
    any(ft.valence)                                   AS valence,
    any(ft.explicit_id)                               AS explicit_id
FROM FACT_TRACKS ft
JOIN DIM_ARTISTS a ON ft.artist_id = a.artist_id
JOIN DIM_ALBUMS  al ON ft.album_id = al.album_id
JOIN DIM_GENRES  g ON ft.genre_id  = g.genre_id
WHERE ft.track_id IN (
    SELECT track_id FROM FACT_TRACKS
    WHERE source_type != 'synthetic' AND disponible = 1
    GROUP BY track_id
    ORDER BY max(popularity) DESC
    LIMIT {limit:UInt32}
)
GROUP BY ft.track_id, ft.track_name, ft.artist_id, a.name, a.imagen_url
ORDER BY popularity DESC
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
    coalesce(any(ft.imagen_url), any(al.imagen_url), a.imagen_url) AS imagen_url,
    arrayStringConcat(groupUniqArray(g.name), ' / ') AS genre_name,
    -- S13-P6: marcador visual de catálogo (frontend-only, nunca escribe a
    -- FACT_TRACKS) — un track es N filas (una por género), `any()` alcanza
    -- porque source_type no varía entre las filas de un mismo track_id.
    any(ft.source_type)                               AS source_type,
    any(ft.explicit_id)                               AS explicit_id
FROM FACT_TRACKS ft
JOIN DIM_ARTISTS a ON ft.artist_id = a.artist_id
JOIN DIM_ALBUMS  al ON ft.album_id = al.album_id
JOIN DIM_GENRES  g ON ft.genre_id  = g.genre_id
WHERE ft.artist_id = {artist_id:Int32} AND ft.disponible = 1
GROUP BY ft.track_id, ft.track_name, ft.artist_id, a.name, a.imagen_url
ORDER BY any(ft.popularity) DESC
LIMIT {limit:UInt32}
SETTINGS use_query_cache = 1, query_cache_ttl = 120, query_cache_share_between_users = 1
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
    coalesce(any(ft.imagen_url), al.imagen_url, a.imagen_url) AS imagen_url,
    arrayStringConcat(groupUniqArray(g.name), ' / ') AS genre_name,
    any(ft.source_type)                          AS source_type,
    any(ft.explicit_id)                          AS explicit_id
FROM FACT_TRACKS ft
JOIN DIM_ARTISTS a ON ft.artist_id = a.artist_id
JOIN DIM_ALBUMS  al ON ft.album_id = al.album_id
JOIN DIM_GENRES  g ON ft.genre_id  = g.genre_id
WHERE ft.album_id = {album_id:Int32} AND ft.disponible = 1
GROUP BY ft.track_id, ft.track_name, ft.artist_id, a.name, a.imagen_url, al.imagen_url
ORDER BY ft.track_name
LIMIT {limit:UInt32}
SETTINGS use_query_cache = 1, query_cache_ttl = 120, query_cache_share_between_users = 1
"""

TRACKS_BY_GENRE = """
SELECT
    ft.fact_id, ft.track_id, ft.track_name, ft.popularity, ft.duration_ms,
    ft.danceability, ft.energy, ft.valence, ft.source_type, ft.explicit_id,
    a.name AS artist_name,
    coalesce(ft.imagen_url, al.imagen_url, a.imagen_url) AS imagen_url,
    g.name AS genre_name
FROM FACT_TRACKS ft
JOIN DIM_GENRES  g ON ft.genre_id  = g.genre_id
JOIN DIM_ARTISTS a ON ft.artist_id = a.artist_id
JOIN DIM_ALBUMS  al ON ft.album_id = al.album_id
WHERE ft.genre_id = {genre_id:Int32} AND ft.disponible = 1
ORDER BY ft.popularity DESC
LIMIT {limit:UInt32}
SETTINGS use_query_cache = 1, query_cache_ttl = 120, query_cache_share_between_users = 1
"""

TRACK_DETAIL = """
SELECT
    ft.track_id, ft.track_name,
    any(ft.popularity)                                AS popularity,
    any(ft.duration_ms)                               AS duration_ms,
    any(ft.danceability)                              AS danceability,
    any(ft.energy)                                    AS energy,
    any(ft.loudness)                                  AS loudness,
    any(ft.speechiness)                                AS speechiness,
    any(ft.acousticness)                              AS acousticness,
    any(ft.instrumentalness)                          AS instrumentalness,
    any(ft.liveness)                                  AS liveness,
    any(ft.valence)                                   AS valence,
    any(ft.tempo)                                     AS tempo,
    any(ft.source_type)                               AS source_type,
    any(ft.explicit_id)                               AS explicit_id,
    a.name                                            AS artist_name,
    ft.artist_id                                      AS artist_id,
    al.name                                           AS album_name,
    ft.album_id                                       AS album_id,
    coalesce(any(ft.imagen_url), al.imagen_url, a.imagen_url) AS imagen_url,
    arrayStringConcat(groupUniqArray(g.name), ' / ') AS genre_name
FROM FACT_TRACKS ft
JOIN DIM_ARTISTS a  ON ft.artist_id = a.artist_id
JOIN DIM_ALBUMS  al ON ft.album_id  = al.album_id
JOIN DIM_GENRES  g  ON ft.genre_id  = g.genre_id
WHERE ft.track_id = {track_id:String} AND ft.disponible = 1
GROUP BY ft.track_id, ft.track_name, ft.artist_id, a.name, ft.album_id, al.name, a.imagen_url, al.imagen_url
LIMIT 1
SETTINGS use_query_cache = 1, query_cache_ttl = 120, query_cache_share_between_users = 1
"""

ARTISTS_TOP = """
SELECT
    a.artist_id                  AS artist_id,
    a.name                       AS name,
    a.imagen_url                 AS imagen_url,
    count()                      AS track_count,
    round(avg(ft.popularity), 2) AS avg_popularity
FROM FACT_TRACKS ft
JOIN DIM_ARTISTS a ON ft.artist_id = a.artist_id
GROUP BY a.artist_id, a.name, a.imagen_url
ORDER BY track_count DESC
LIMIT {limit:UInt32}
SETTINGS use_query_cache = 1, query_cache_ttl = 120, query_cache_share_between_users = 1
"""

ARTISTS_SEARCH = """
SELECT
    a.artist_id                  AS artist_id,
    a.name                       AS name,
    a.imagen_url                 AS imagen_url,
    count()                      AS track_count,
    round(avg(ft.popularity), 2) AS avg_popularity
FROM FACT_TRACKS ft
JOIN DIM_ARTISTS a ON ft.artist_id = a.artist_id
WHERE lower(a.name) LIKE lower({pattern:String})
GROUP BY a.artist_id, a.name, a.imagen_url
ORDER BY track_count DESC
LIMIT {limit:UInt32}
SETTINGS use_query_cache = 1, query_cache_ttl = 120, query_cache_share_between_users = 1
"""

ARTIST_DETAIL = """
SELECT
    a.artist_id  AS artist_id,
    a.name       AS name,
    a.country    AS country,
    a.imagen_url AS imagen_url,
    s.nombre     AS record_label,
    count()                          AS track_count,
    round(avg(ft.popularity),    2)  AS avg_popularity,
    round(avg(ft.energy),        4)  AS avg_energy,
    round(avg(ft.danceability),  4)  AS avg_danceability,
    round(avg(ft.valence),       4)  AS avg_valence
FROM FACT_TRACKS ft
JOIN DIM_ARTISTS a ON ft.artist_id = a.artist_id
LEFT JOIN DIM_SELLO_DISCOGRAFICO s ON a.sello_id = s.sello_id
WHERE a.artist_id = {artist_id:Int32}
GROUP BY a.artist_id, a.name, a.country, a.imagen_url, s.nombre
SETTINGS use_query_cache = 1, query_cache_ttl = 120, query_cache_share_between_users = 1
"""

ALBUMS_SEARCH = """
SELECT
    al.album_id                  AS album_id,
    al.name                      AS name,
    al.release_year              AS release_year,
    al.imagen_url                AS imagen_url,
    count()                      AS track_count,
    round(avg(ft.popularity), 2) AS avg_popularity
FROM FACT_TRACKS ft
JOIN DIM_ALBUMS al ON ft.album_id = al.album_id
WHERE lower(al.name) LIKE lower({pattern:String})
GROUP BY al.album_id, al.name, al.release_year, al.imagen_url
ORDER BY track_count DESC
LIMIT {limit:UInt32}
SETTINGS use_query_cache = 1, query_cache_ttl = 120, query_cache_share_between_users = 1
"""

ALBUM_DETAIL = """
SELECT
    al.album_id           AS album_id,
    al.name               AS name,
    al.release_year       AS release_year,
    al.album_type         AS album_type,
    al.total_tracks_listed AS total_tracks_listed,
    al.language           AS language,
    -- Sin portada propia de álbum resuelta: usar la de un artista del álbum
    -- como default, antes de caer al placeholder SVG del frontend — mismo
    -- patrón ya usado en TRACK_DETAIL_BY_FACT_ID/TRACK_DETAIL_BY_TRACK_ID
    -- (coalesce(al.imagen_url, a.imagen_url)), aplicado aquí donde faltaba.
    -- `any()` porque un álbum puede tener más de un artista (compilaciones);
    -- no importa cuál se elija, es un default visual, no un dato canónico.
    coalesce(al.imagen_url, any(a.imagen_url)) AS imagen_url,
    count(DISTINCT ft.track_id)  AS track_count,
    round(avg(ft.popularity), 2) AS avg_popularity
FROM FACT_TRACKS ft
JOIN DIM_ALBUMS al  ON ft.album_id  = al.album_id
JOIN DIM_ARTISTS a  ON ft.artist_id = a.artist_id
WHERE al.album_id = {album_id:Int32}
GROUP BY al.album_id, al.name, al.release_year, al.album_type,
         al.total_tracks_listed, al.language, al.imagen_url
SETTINGS use_query_cache = 1, query_cache_ttl = 120, query_cache_share_between_users = 1
"""

GENRES_LIST = """
SELECT
    g.genre_id                   AS genre_id,
    g.name                       AS name,
    g.mood                       AS mood,
    count()                      AS track_count,
    round(avg(ft.popularity), 2) AS avg_popularity,
    -- S14-P1: portada representativa = la del track más popular del género
    -- que YA tenga imagen_url resuelta (sin requests nuevos, reusa lo que
    -- ya dejó el ciclo normal de portadas). NULL si ninguno la tiene todavía
    -- — el frontend mantiene el color plano en ese caso, no fuerza un
    -- fallback feo.
    argMaxIf(ft.imagen_url, ft.popularity, ft.imagen_url IS NOT NULL) AS imagen_url
FROM FACT_TRACKS ft
JOIN DIM_GENRES g ON ft.genre_id = g.genre_id
GROUP BY g.genre_id, g.name, g.mood
ORDER BY g.name
SETTINGS use_query_cache = 1, query_cache_ttl = 120, query_cache_share_between_users = 1
"""

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
SETTINGS use_query_cache = 1, query_cache_ttl = 120, query_cache_share_between_users = 1
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
    any(ft.source_type)                               AS source_type,
    any(ft.explicit_id)                               AS explicit_id,
    a.name                                            AS artist_name,
    ft.artist_id                                      AS artist_id,
    al.name                                           AS album_name,
    ft.album_id                                       AS album_id,
    coalesce(any(ft.imagen_url), al.imagen_url, a.imagen_url) AS imagen_url,
    arrayStringConcat(groupUniqArray(g.name), ' / ') AS genre_name,
    any(g.genre_id)                                   AS genre_id
FROM FACT_TRACKS ft
JOIN DIM_ARTISTS a  ON ft.artist_id = a.artist_id
JOIN DIM_ALBUMS  al ON ft.album_id  = al.album_id
JOIN DIM_GENRES  g  ON ft.genre_id  = g.genre_id
WHERE ft.track_id = (SELECT track_id FROM FACT_TRACKS WHERE fact_id = {fact_id:Int64} LIMIT 1)
  AND ft.disponible = 1
GROUP BY ft.track_id, ft.track_name, ft.artist_id, a.name, ft.album_id, al.name, a.imagen_url, al.imagen_url
SETTINGS use_query_cache = 1, query_cache_ttl = 120, query_cache_share_between_users = 1
"""


# ── Takedown administrativo (change p1-ciclos-vida) ──────────────────────────
# Un track existe como varias filas en FACT_TRACKS (una por género); el takedown
# se aplica a TODAS las filas de su track_id para que el track desaparezca de
# verdad del catálogo (la búsqueda dedup por track_id). Se localiza el track por
# el fact_id recibido en la ruta.
TRACK_ID_POR_FACT = "SELECT track_id FROM FACT_TRACKS WHERE fact_id = {fact_id:UInt64} LIMIT 1"
TRACK_DISPONIBILIDAD_POR_FACT = "SELECT track_id, disponible FROM FACT_TRACKS WHERE fact_id = {fact_id:UInt64} LIMIT 1"

# Listado de tracks ocultos (disponible=0) para el panel admin de takedown —
# no aparecen en las búsquedas públicas, así que la restauración necesita esta
# vista dedicada. Dedup por track_id (min fact_id como representante).
TRACKS_OCULTOS = """
SELECT
    min(ft.fact_id)  AS fact_id,
    ft.track_id      AS track_id,
    ft.track_name    AS track_name,
    a.name           AS artist_name
FROM FACT_TRACKS ft
JOIN DIM_ARTISTS a ON ft.artist_id = a.artist_id
WHERE ft.disponible = 0
GROUP BY ft.track_id, ft.track_name, a.name
ORDER BY ft.track_name
LIMIT {limit:UInt32}
"""


# PERF: mismo fix de dos pasos que TRACKS_TOP (ver comentario ahí) -- la
# sub-consulta interna reutiliza el mismo `{where}` (referencia a ft/a/g,
# scope propio de la sub-consulta, sin conflicto con los alias de la
# Relevancia textual (S16 — auditoría de revisores): antes `/tracks/search`
# ordenaba SOLO por `popularity DESC`, así que una coincidencia exacta poco
# popular podía aparecer después de una coincidencia parcial muy popular.
# `multiIf` asigna un score de relevancia por fila (3 = coincidencia exacta
# de nombre de track o artista, 2 = coincidencia de prefijo, 1 = coincidencia
# parcial, el patrón `LIKE '%...%'` de siempre) — se usa como criterio
# PRIMARIO de orden, con popularidad como desempate dentro del mismo nivel
# (nunca reemplaza a popularidad, la complementa). `{q_exacto}`/`{q_prefijo}`
# solo se bindean cuando `q` viene en la búsqueda (router.py); esta expresión
# solo se referencia en el `order_clause` en ese caso.
RELEVANCIA_TEXTO_EXPR = """multiIf(
    lower(ft.track_name) = lower({q_exacto:String}) OR lower(a.name) = lower({q_exacto:String}), 3,
    lower(ft.track_name) LIKE lower({q_prefijo:String}) OR lower(a.name) LIKE lower({q_prefijo:String}), 2,
    1
)"""

# PERF: mismo fix de dos pasos que TRACKS_TOP (ver comentario ahí) -- la
# sub-consulta interna reutiliza el mismo `{where}` (referencia a ft/a/g,
# scope propio de la sub-consulta, sin conflicto con los alias de la
# externa) pero SOLO junta DIM_ARTISTS/DIM_GENRES (las 2 tablas que el
# `where` puede necesitar para los filtros de texto/género) -- nunca
# DIM_ALBUMS ni groupUniqArray, que solo hacen falta para enriquecer los
# ganadores en la consulta externa. Medido: 2.9-17s -> 0.1-0.6s según filtro.
def tracks_search_sql(where: str, order_clause: str = "max(ft.popularity) DESC") -> str:
    return f"""
SELECT
    min(ft.fact_id)                                   AS fact_id,
    ft.track_id,
    ft.track_name,
    a.name                                            AS artist_name,
    coalesce(any(ft.imagen_url), any(al.imagen_url), a.imagen_url) AS imagen_url,
    arrayStringConcat(groupUniqArray(g.name), ' / ') AS genre_name,
    any(ft.popularity)                                AS popularity,
    any(ft.duration_ms)                               AS duration_ms,
    any(ft.danceability)                              AS danceability,
    any(ft.energy)                                    AS energy,
    any(ft.valence)                                   AS valence,
    any(ft.source_type)                               AS source_type,
    any(ft.explicit_id)                               AS explicit_id
FROM FACT_TRACKS ft
JOIN DIM_ARTISTS a ON ft.artist_id = a.artist_id
JOIN DIM_ALBUMS  al ON ft.album_id = al.album_id
JOIN DIM_GENRES  g ON ft.genre_id  = g.genre_id
WHERE ft.track_id IN (
    SELECT ft.track_id
    FROM (SELECT * FROM FACT_TRACKS WHERE disponible = 1) ft
    JOIN DIM_ARTISTS a ON ft.artist_id = a.artist_id
    JOIN DIM_GENRES  g ON ft.genre_id  = g.genre_id
    {where}
    GROUP BY ft.track_id
    ORDER BY {order_clause}
    LIMIT {{limit:UInt32}} OFFSET {{offset:UInt32}}
)
GROUP BY ft.track_id, ft.track_name, ft.artist_id, a.name, a.imagen_url
ORDER BY {order_clause}
SETTINGS use_query_cache = 1, query_cache_ttl = 120, query_cache_share_between_users = 1
"""


def tracks_search_count_sql(where: str) -> str:
    return f"""
SELECT count(DISTINCT ft.track_id) AS total
FROM (SELECT * FROM FACT_TRACKS WHERE disponible = 1) ft
JOIN DIM_ARTISTS a ON ft.artist_id = a.artist_id
JOIN DIM_GENRES  g ON ft.genre_id  = g.genre_id
{where}
SETTINGS use_query_cache = 1, query_cache_ttl = 120, query_cache_share_between_users = 1
"""


# ── Búsqueda unificada (change p2-descubrimiento-comunidad) ───────────────────
# Las tres queries parten de tracks con `disponible = 1`. En artistas y álbumes
# eso es un cambio de criterio respecto a ARTISTS_SEARCH / ALBUMS_SEARCH, que no
# filtran nada: un artista cuyos tracks fueron todos retirados por takedown sigue
# apareciendo en el buscador por entidad. Los endpoints antiguos se dejan como
# están para no cambiar su contrato; la corrección vive aquí (design.md,
# Decisión 10). Un track es N filas (una por género), de ahí el GROUP BY.

# PERF: mismo fix de dos pasos que tracks_search_sql -- la sub-consulta
# interna solo necesita DIM_ARTISTS (para el LIKE sobre a.name), nunca
# DIM_ALBUMS/DIM_GENRES ni groupUniqArray.
SEARCH_TRACKS_GRUPO = """
SELECT
    min(ft.fact_id)                                   AS fact_id,
    ft.track_id                                       AS track_id,
    ft.track_name                                     AS track_name,
    a.name                                            AS artist_name,
    coalesce(any(ft.imagen_url), any(al.imagen_url), a.imagen_url) AS imagen_url,
    arrayStringConcat(groupUniqArray(g.name), ' / ')  AS genre_name,
    any(ft.popularity)                                AS popularity,
    any(ft.duration_ms)                               AS duration_ms,
    any(ft.source_type)                               AS source_type,
    any(ft.explicit_id)                               AS explicit_id
FROM FACT_TRACKS ft
JOIN DIM_ARTISTS a  ON ft.artist_id = a.artist_id
JOIN DIM_ALBUMS  al ON ft.album_id  = al.album_id
JOIN DIM_GENRES  g  ON ft.genre_id  = g.genre_id
WHERE ft.track_id IN (
    SELECT ft.track_id
    FROM (SELECT * FROM FACT_TRACKS WHERE disponible = 1) ft
    JOIN DIM_ARTISTS a ON ft.artist_id = a.artist_id
    WHERE lower(ft.track_name) LIKE lower({pattern:String})
       OR lower(a.name)        LIKE lower({pattern:String})
    GROUP BY ft.track_id
    ORDER BY max(ft.popularity) DESC
    LIMIT {limit:UInt32}
)
GROUP BY ft.track_id, ft.track_name, ft.artist_id, a.name, a.imagen_url
ORDER BY any(ft.popularity) DESC, ft.track_id ASC
SETTINGS use_query_cache = 1, query_cache_ttl = 120, query_cache_share_between_users = 1
"""

SEARCH_ARTISTAS_GRUPO = """
SELECT
    a.artist_id                        AS artist_id,
    a.name                             AS name,
    a.imagen_url                       AS imagen_url,
    count(DISTINCT ft.track_id)        AS track_count,
    round(avg(ft.popularity), 2)       AS avg_popularity
FROM (SELECT * FROM FACT_TRACKS WHERE disponible = 1) ft
JOIN DIM_ARTISTS a ON ft.artist_id = a.artist_id
WHERE lower(a.name) LIKE lower({pattern:String})
GROUP BY a.artist_id, a.name, a.imagen_url
ORDER BY track_count DESC, a.artist_id ASC
LIMIT {limit:UInt32}
SETTINGS use_query_cache = 1, query_cache_ttl = 120, query_cache_share_between_users = 1
"""

SEARCH_ALBUMES_GRUPO = """
SELECT
    al.album_id                        AS album_id,
    al.name                            AS name,
    al.release_year                    AS release_year,
    al.imagen_url                      AS imagen_url,
    any(a.name)                        AS artist_name,
    count(DISTINCT ft.track_id)        AS track_count,
    round(avg(ft.popularity), 2)       AS avg_popularity
FROM (SELECT * FROM FACT_TRACKS WHERE disponible = 1) ft
JOIN DIM_ALBUMS  al ON ft.album_id  = al.album_id
JOIN DIM_ARTISTS a  ON ft.artist_id = a.artist_id
WHERE lower(al.name) LIKE lower({pattern:String})
GROUP BY al.album_id, al.name, al.release_year, al.imagen_url
ORDER BY track_count DESC, al.album_id ASC
LIMIT {limit:UInt32}
SETTINGS use_query_cache = 1, query_cache_ttl = 120, query_cache_share_between_users = 1
"""
