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
# PERF ronda 2 (S16-P7): la tabla ahora tiene projections por fact_id y por
# track_id (`p_by_fact_id`/`p_by_track_id`, ver init_clickhouse.py), pero una
# projection solo pode si la lectura lleva predicado sobre su clave — el
# `JOIN FACT_TRACKS ft ON fav.fact_id = ft.fact_id` de abajo construía el hash
# join leyendo las 1.6M filas completas (~1.4s solo eso). Se reescribió para
# que CADA lectura de FACT_TRACKS sea un subquery con `WHERE fact_id IN (...)`
# / `WHERE track_id IN (...)`: el optimizador convierte el set en una lectura
# preparada que toca 2-4 granules en vez de 200 (~0.3s total, medido).
FAVORITOS_ACTUALES = """
WITH fav AS (
    SELECT fact_id
    FROM FACT_ENGAGEMENT_USUARIO
    WHERE user_id = {user_id:String}
    GROUP BY fact_id
    HAVING argMax(event_type, event_timestamp) = 'favorito_add'
)
SELECT
    ft.fact_id     AS fact_id,
    ft.track_id    AS track_id,
    ft.track_name  AS track_name,
    a.name         AS artist_name,
    ft.duration_ms AS duration_ms,
    ga.genre_name  AS genre_name,
    coalesce(ft.imagen_url, al.imagen_url, a.imagen_url) AS imagen_url,
    ft.source_type AS source_type
FROM (
    SELECT
        fact_id, track_id, track_name, artist_id, album_id,
        duration_ms, imagen_url, source_type
    FROM FACT_TRACKS
    WHERE fact_id IN (SELECT fact_id FROM fav)
) AS ft
INNER JOIN DIM_ARTISTS a  ON ft.artist_id = a.artist_id
LEFT JOIN DIM_ALBUMS al   ON ft.album_id = al.album_id
-- Sin filtro de source_type en la subquery de género (S14-P1): un track 100%
-- sintético no tiene ninguna fila con otro source_type que resuelva su
-- genre_name, y el INNER JOIN dejaba fuera el favorito completo.
INNER JOIN (
    SELECT
        ft2.track_id,
        arrayStringConcat(groupUniqArray(g2.name), ' / ') AS genre_name
    FROM FACT_TRACKS ft2
    INNER JOIN DIM_GENRES g2 ON ft2.genre_id = g2.genre_id
    WHERE ft2.track_id IN (
        SELECT track_id FROM FACT_TRACKS WHERE fact_id IN (SELECT fact_id FROM fav)
    )
    GROUP BY ft2.track_id
) AS ga ON ga.track_id = ft.track_id
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
# PERF ronda 2 (S16-P7): mismo tratamiento que FAVORITOS_ACTUALES — la lectura
# de FACT_TRACKS del join principal pasa a ser un subquery podable por
# `fact_id IN (...)` (projection p_by_fact_id) en vez de un hash join de
# tabla completa.
HISTORIAL_RECIENTE = """
WITH recientes AS (
    SELECT fact_id, event_timestamp
    FROM FACT_ENGAGEMENT_USUARIO
    WHERE user_id = {user_id:String} AND event_type = 'reproduccion'
    ORDER BY event_timestamp DESC
    LIMIT {limit:UInt32}
)
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
    SELECT fact_id, event_timestamp FROM recientes
) AS e
INNER JOIN (
    SELECT
        fact_id, track_id, track_name, artist_id, album_id,
        duration_ms, imagen_url, source_type
    FROM FACT_TRACKS
    WHERE fact_id IN (SELECT fact_id FROM recientes)
) AS ft ON e.fact_id = ft.fact_id
INNER JOIN DIM_ARTISTS a  ON ft.artist_id = a.artist_id
LEFT JOIN DIM_ALBUMS al   ON ft.album_id = al.album_id
-- Sin filtro de source_type: un track 100% sintético no tiene ninguna fila
-- con otro source_type que resuelva su genre_name. Criterio ya establecido
-- en creadores: source_type no es ciudadano de segunda clase en vistas de
-- usuario, solo se excluye de promedios de audio.
INNER JOIN (
    SELECT
        ft2.track_id,
        arrayStringConcat(groupUniqArray(g2.name), ' / ') AS genre_name
    FROM FACT_TRACKS ft2
    INNER JOIN DIM_GENRES g2 ON ft2.genre_id = g2.genre_id
    WHERE ft2.track_id IN (
        SELECT track_id FROM FACT_TRACKS WHERE fact_id IN (SELECT fact_id FROM recientes)
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

# Like/dislike (RN-ANA-001, S16 prompt 09): estado NETO actual por usuario —
# igual que COUNT_FAVORITOS, se toma el último evento entre 'like'/'dislike'/
# 'voto_remove' por usuario (no el conteo crudo de eventos, que es lo que sí
# usa raw_score en `analitica` a propósito, mismo criterio ya establecido
# para favorito_add).
# Desempate por `event_seq` (DateTime64(6)), no `event_timestamp` (DateTime,
# resolución de 1s): hallazgo real en verificación — like→dislike→like en
# menos de un segundo (doble click, o el propio guion de pruebas) resolvía
# al valor incorrecto porque argMax(event_type, event_timestamp) no podía
# desempatar dos eventos con el mismo segundo. `COUNT_FAVORITOS`/
# `FAVORITOS_ACTUALES` más abajo comparten el mismo patrón con
# `event_timestamp` — no se tocan acá (fuera de alcance de este cambio).
LIKES_DISLIKES_COUNT = """
SELECT
    countIf(last_event = 'like')    AS likes,
    countIf(last_event = 'dislike') AS dislikes
FROM (
    SELECT argMax(event_type, event_seq) AS last_event
    FROM FACT_ENGAGEMENT_USUARIO
    WHERE fact_id = {fact_id:UInt64} AND event_type IN ('like', 'dislike', 'voto_remove')
    GROUP BY user_id
)
"""

VOTO_USUARIO_ACTUAL = """
SELECT argMax(event_type, event_seq) AS last_event
FROM FACT_ENGAGEMENT_USUARIO
WHERE fact_id = {fact_id:UInt64} AND user_id = {user_id:String}
  AND event_type IN ('like', 'dislike', 'voto_remove')
"""

# Versión batch de LIKES_DISLIKES_COUNT/VOTO_USUARIO_ACTUAL — hallazgo real de
# rendimiento (S16 prompt 09): TrackCard pedía el conteo de likes por track de
# forma individual, y un listado de catálogo (20+ tracks por página) disparaba
# 20+ GET simultáneos a este mismo endpoint, saturando el pool de conexiones
# de ClickHouse (503 real, reproducido con Playwright — no hipotético) además
# de ser, en sí, la razón concreta de "todo carga lento" que reportó el
# usuario. El frontend agrupa (`useLikes.ts`) todos los `fact_id` pedidos en
# la misma vuelta de evento en una sola llamada a este endpoint.
LIKES_DISLIKES_BATCH = """
SELECT
    fact_id,
    countIf(last_event = 'like')    AS likes,
    countIf(last_event = 'dislike') AS dislikes
FROM (
    SELECT fact_id, argMax(event_type, event_seq) AS last_event
    FROM FACT_ENGAGEMENT_USUARIO
    WHERE fact_id IN {fact_ids:Array(UInt64)} AND event_type IN ('like', 'dislike', 'voto_remove')
    GROUP BY fact_id, user_id
)
GROUP BY fact_id
"""

VOTOS_USUARIO_BATCH = """
SELECT fact_id, argMax(event_type, event_seq) AS last_event
FROM FACT_ENGAGEMENT_USUARIO
WHERE fact_id IN {fact_ids:Array(UInt64)} AND user_id = {user_id:String}
  AND event_type IN ('like', 'dislike', 'voto_remove')
GROUP BY fact_id
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
