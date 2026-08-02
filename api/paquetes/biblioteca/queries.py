# PERF (hallazgo en vivo: query real de 178s trabada en producción, saturando
# ClickHouse y frenando TODO el sistema, no solo favoritos): la subquery `ga`
# calculaba `groupUniqArray` de género para las 1.3M filas de FACT_TRACKS
# ENTERA antes de filtrar por los pocos favoritos del usuario — mismo
# anti-patrón ya corregido en `catalogo/queries.py` (S13-P7), nunca aplicado
# acá. Se filtra `ga` por los `track_id` reales de los favoritos (resueltos
# desde los mismos `fact_id` de la subquery `fav`, no un segundo criterio) —
# nunca por `fact_id` directo: un track multi-género tiene una fila de
# FACT_TRACKS por género, y el evento de favorito solo referencia UNA de
# esas filas, así que filtrar por `fact_id` perdería los géneros de las
# demás.
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
    WHERE ft2.track_id IN (
        SELECT track_id FROM FACT_TRACKS WHERE fact_id IN (
            SELECT fact_id FROM FACT_ENGAGEMENT_USUARIO
            WHERE user_id = {user_id:String}
            GROUP BY fact_id
            HAVING argMax(event_type, event_timestamp) = 'favorito_add'
        )
    )
    GROUP BY ft2.track_id
) ga ON ga.track_id = ft.track_id
ORDER BY ft.fact_id
"""
# Sin query cache a propósito (a diferencia de HISTORIAL_RECIENTE/TRACKS_BY_
# FACT_IDS más abajo): `useFavoritos.ts` invalida y refetchea esta misma
# query INMEDIATAMENTE después de agregar/quitar un favorito (toggle
# optimista) — con cache, el usuario vería el estado viejo del corazón justo
# después de tocarlo hasta que expire el TTL. La ganancia real ya viene de
# la reestructuración de arriba, no hacía falta el cache para resolver el
# incidente (query de 178s trabada).

# PERF: mismo fix que FAVORITOS_ACTUALES, adaptado a que esta query tiene
# ORDER BY + LIMIT — dos pasos: (1) sub-consulta barata que rankea los
# eventos de reproducción por fecha SIN tocar género/FACT_TRACKS completo,
# (2) `ga` se filtra por los track_id de esos `limit` eventos ganadores nada
# más, no por el total de reproducciones del usuario (que puede ser miles).
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
FROM (
    SELECT fact_id, event_timestamp
    FROM FACT_ENGAGEMENT_USUARIO
    WHERE user_id = {user_id:String} AND event_type = 'reproduccion'
    ORDER BY event_timestamp DESC
    LIMIT {limit:UInt32}
) e
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
    WHERE ft2.track_id IN (
        SELECT track_id FROM FACT_TRACKS WHERE fact_id IN (
            SELECT fact_id
            FROM FACT_ENGAGEMENT_USUARIO
            WHERE user_id = {user_id:String} AND event_type = 'reproduccion'
            ORDER BY event_timestamp DESC
            LIMIT {limit:UInt32}
        )
    )
    GROUP BY ft2.track_id
) ga ON ga.track_id = ft.track_id
ORDER BY e.event_timestamp DESC
SETTINGS use_query_cache = 1, query_cache_ttl = 60, query_cache_share_between_users = 1
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
# Mismo motivo que FAVORITOS_ACTUALES: sin cache, se lee justo después de
# cada toggle (límite de plan Free, "X/20 favoritos").

FACT_ID_EXISTS = """
SELECT 1 FROM FACT_TRACKS WHERE fact_id = {fact_id:UInt64} LIMIT 1
"""

# Hidratación en batch para tracks de una playlist (PocketBase solo guarda
# fact_id/position en `playlist_tracks` — el detalle real vive en ClickHouse).
# PERF: mismo fix que FAVORITOS_ACTUALES — `ga` filtrada por los track_id de
# `fact_ids` (ya conocidos de antemano, sin necesidad de ranking), no por la
# tabla completa.
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
    WHERE ft2.track_id IN (
        SELECT track_id FROM FACT_TRACKS WHERE fact_id IN {fact_ids:Array(UInt64)}
    )
    GROUP BY ft2.track_id
) ga ON ga.track_id = ft.track_id
WHERE ft.fact_id IN {fact_ids:Array(UInt64)}
SETTINGS use_query_cache = 1, query_cache_ttl = 60, query_cache_share_between_users = 1
"""
