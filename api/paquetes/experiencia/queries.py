# ─────────────────────────────────────────────────────────────────────────────
# Recomendaciones (RF-EXP-002/003) — algoritmo simple documentado como tal
# (design.md, Non-Goal "Motor de recomendación con machine learning"), en 3
# niveles: (1) similitud de atributos de audio reales dentro de los géneros
# que el usuario más escucha (FACT_ENGAGEMENT_USUARIO, event_type=
# 'reproduccion' — comportamiento real, no solo favoritos), (2) mismo género
# que los favoritos si todavía no hay historial de reproducción, (3)
# popularidad global si no hay ni lo uno ni lo otro. Las tres queries
# deduplican por nombre+artista (GROUP BY ft.track_name, a.name — no por
# `track_id`: el mismo track real puede tener más de un `track_id` distinto
# en el dataset, ej. la misma grabación catalogada en varias ediciones/
# compilaciones, además de repetirse una vez por género dentro de un mismo
# `track_id`), con `min(fact_id)` como fact_id canónico. Bug encontrado en
# verificación visual, S10 día 5 — antes del fix el mismo track podía
# aparecer repetido en la lista de recomendaciones.
# ─────────────────────────────────────────────────────────────────────────────

GENEROS_FAVORITOS_USUARIO = """
SELECT DISTINCT ft.genre_id AS genre_id
FROM (
    SELECT fact_id, argMax(event_type, event_timestamp) AS last_event
    FROM FACT_ENGAGEMENT_USUARIO
    WHERE user_id = {usuario_id:String}
    GROUP BY fact_id
    HAVING last_event = 'favorito_add'
) fav
JOIN FACT_TRACKS ft ON fav.fact_id = ft.fact_id
"""

FACT_IDS_FAVORITOS_USUARIO = """
SELECT fact_id FROM (
    SELECT fact_id, argMax(event_type, event_timestamp) AS last_event
    FROM FACT_ENGAGEMENT_USUARIO
    WHERE user_id = {usuario_id:String}
    GROUP BY fact_id
    HAVING last_event = 'favorito_add'
)
"""

# Escucha real (no favoritos): géneros más escuchados y perfil de audio
# promedio, para "encontrar tracks con atributos similares dentro de los
# géneros que más escucha" en vez de solo género+popularidad.
FACT_IDS_ESCUCHADOS_USUARIO = """
SELECT DISTINCT fact_id FROM FACT_ENGAGEMENT_USUARIO
WHERE user_id = {usuario_id:String} AND event_type = 'reproduccion'
"""

GENEROS_MAS_ESCUCHADOS_USUARIO = """
SELECT ft.genre_id AS genre_id, count() AS plays
FROM FACT_ENGAGEMENT_USUARIO e
JOIN FACT_TRACKS ft ON ft.fact_id = e.fact_id
WHERE e.user_id = {usuario_id:String} AND e.event_type = 'reproduccion'
GROUP BY ft.genre_id
ORDER BY plays DESC
LIMIT 5
"""

PERFIL_AUDIO_USUARIO = """
SELECT
    avg(ft.danceability) AS danceability,
    avg(ft.energy)       AS energy,
    avg(ft.tempo)        AS tempo,
    avg(ft.valence)      AS valence
FROM FACT_ENGAGEMENT_USUARIO e
JOIN FACT_TRACKS ft ON ft.fact_id = e.fact_id
WHERE e.user_id = {usuario_id:String} AND e.event_type = 'reproduccion'
"""

# Nivel 1: similitud de audio real dentro de los géneros más escuchados.
# Distancia simple (suma de diferencias absolutas, heurística — no ML): las
# 4 métricas están en escala 0-1 salvo `tempo` (BPM, ~60-200), que se
# normaliza dividiendo entre 200 para que no domine la suma.
RECOMENDACIONES_POR_PERFIL_AUDIO = """
SELECT fact_id, track_id, track_name, artist_name, genre_name, imagen_url
FROM (
    SELECT
        any(ft.track_id)                                                     AS track_id,
        min(ft.fact_id)                                                      AS fact_id,
        ft.track_name                                                        AS track_name,
        a.name                                                                AS artist_name,
        arrayStringConcat(groupUniqArray(g.name), ' / ')                     AS genre_name,
        coalesce(any(ft.imagen_url), any(al.imagen_url), any(a.imagen_url))  AS imagen_url,
        avg(ft.danceability)                                                 AS danceability,
        avg(ft.energy)                                                       AS energy,
        avg(ft.tempo)                                                        AS tempo,
        avg(ft.valence)                                                      AS valence
    FROM FACT_TRACKS ft
    JOIN DIM_ARTISTS a  ON ft.artist_id = a.artist_id
    JOIN DIM_ALBUMS  al ON ft.album_id  = al.album_id
    JOIN DIM_GENRES  g  ON ft.genre_id  = g.genre_id
    WHERE ft.genre_id IN {genre_ids:Array(UInt16)}
      AND ft.fact_id NOT IN {excluidos:Array(UInt64)}
      AND ft.source_type != 'synthetic'
    GROUP BY ft.track_name, a.name
)
ORDER BY
    abs(danceability - {p_danceability:Float64})
  + abs(energy       - {p_energy:Float64})
  + abs(valence      - {p_valence:Float64})
  + abs(tempo        - {p_tempo:Float64}) / 200
ASC
LIMIT {limit:UInt32}
"""

# Nivel 2: mismo género que los favoritos (sin historial de reproducción
# todavía), ordenado por popularidad — mismo criterio que antes, ya deduplicado.
RECOMENDACIONES_POR_GENERO = """
SELECT fact_id, track_id, track_name, artist_name, genre_name, imagen_url
FROM (
    SELECT
        any(ft.track_id)                                                     AS track_id,
        min(ft.fact_id)                                                      AS fact_id,
        ft.track_name                                                        AS track_name,
        a.name                                                                AS artist_name,
        arrayStringConcat(groupUniqArray(g.name), ' / ')                     AS genre_name,
        coalesce(any(ft.imagen_url), any(al.imagen_url), any(a.imagen_url))  AS imagen_url,
        max(ft.popularity)                                                   AS popularity
    FROM FACT_TRACKS ft
    JOIN DIM_ARTISTS a  ON ft.artist_id = a.artist_id
    JOIN DIM_ALBUMS  al ON ft.album_id  = al.album_id
    JOIN DIM_GENRES  g  ON ft.genre_id  = g.genre_id
    WHERE ft.genre_id IN {genre_ids:Array(UInt16)}
      AND ft.fact_id NOT IN {excluidos:Array(UInt64)}
      AND ft.source_type != 'synthetic'
    GROUP BY ft.track_name, a.name
)
ORDER BY popularity DESC
LIMIT {limit:UInt32}
"""

# Nivel 3: sin historial ni favoritos — popularidad global, deduplicado.
RECOMENDACIONES_POPULARES = """
SELECT fact_id, track_id, track_name, artist_name, genre_name, imagen_url
FROM (
    SELECT
        any(ft.track_id)                                                     AS track_id,
        min(ft.fact_id)                                                      AS fact_id,
        ft.track_name                                                        AS track_name,
        a.name                                                                AS artist_name,
        arrayStringConcat(groupUniqArray(g.name), ' / ')                     AS genre_name,
        coalesce(any(ft.imagen_url), any(al.imagen_url), any(a.imagen_url))  AS imagen_url,
        max(ft.popularity)                                                   AS popularity
    FROM FACT_TRACKS ft
    JOIN DIM_ARTISTS a  ON ft.artist_id = a.artist_id
    JOIN DIM_ALBUMS  al ON ft.album_id  = al.album_id
    JOIN DIM_GENRES  g  ON ft.genre_id  = g.genre_id
    WHERE ft.fact_id NOT IN {excluidos:Array(UInt64)}
      AND ft.source_type != 'synthetic'
    GROUP BY ft.track_name, a.name
)
ORDER BY popularity DESC
LIMIT {limit:UInt32}
"""

# Variantes de "Para ti" (S10 ronda 2): "Hecho para ti" es el nivel 1 de
# arriba (RECOMENDACIONES_POR_PERFIL_AUDIO), solo renombrado en la UI. Las
# siguientes dos son secciones nuevas — ambas reutilizan el mismo shape de
# columnas (fact_id, track_id, track_name, artist_name, genre_name, imagen_url)
# para que el frontend renderice las 3 con el mismo componente de tarjeta.

# Novedades de artistas que sigues: comparte la señal de "track nuevo de un
# artista seguido" con la notificación `nuevo_track_artista_seguido`
# (paquetes/social/notificaciones.py) — mismo filtro artist_id IN (seguidos),
# ordenado por `inserted_at` (fecha real de ingreso a FACT_TRACKS, no
# `load_week` — ver init_clickhouse.py). Sin filtro de source_type: un track
# `user_uploaded` de un artista que sigues es, si acaso, más relevante.
RECOMENDACIONES_NOVEDADES_ARTISTAS_SEGUIDOS = """
SELECT fact_id, track_id, track_name, artist_name, genre_name, imagen_url
FROM (
    SELECT
        any(ft.track_id)                                                     AS track_id,
        min(ft.fact_id)                                                      AS fact_id,
        ft.track_name                                                        AS track_name,
        a.name                                                                AS artist_name,
        arrayStringConcat(groupUniqArray(g.name), ' / ')                     AS genre_name,
        coalesce(any(ft.imagen_url), any(al.imagen_url), any(a.imagen_url))  AS imagen_url,
        max(ft.inserted_at)                                                  AS inserted_at
    FROM FACT_TRACKS ft
    JOIN DIM_ARTISTS a  ON ft.artist_id = a.artist_id
    JOIN DIM_ALBUMS  al ON ft.album_id  = al.album_id
    JOIN DIM_GENRES  g  ON ft.genre_id  = g.genre_id
    WHERE ft.artist_id IN {artist_ids:Array(UInt32)}
      AND ft.fact_id NOT IN {excluidos:Array(UInt64)}
    GROUP BY ft.track_name, a.name
)
ORDER BY inserted_at DESC
LIMIT {limit:UInt32}
"""

# Redescubre: resurge tracks que el propio usuario favoriteó o reprodujo
# alguna vez pero no ha tocado recientemente — no es una recomendación de
# tracks nuevos, es su propio historial ordenado por interacción más
# antigua. No usa `excluidos`: excluir "lo ya conocido" no tendría sentido
# acá, es literalmente lo ya conocido lo que se resurge.
REDESCUBRE_USUARIO = """
SELECT fact_id, track_id, track_name, artist_name, genre_name, imagen_url
FROM (
    SELECT
        any(ft.track_id)                                                     AS track_id,
        min(ft.fact_id)                                                      AS fact_id,
        ft.track_name                                                        AS track_name,
        a.name                                                                AS artist_name,
        arrayStringConcat(groupUniqArray(g.name), ' / ')                     AS genre_name,
        coalesce(any(ft.imagen_url), any(al.imagen_url), any(a.imagen_url))  AS imagen_url,
        max(e.last_interaction)                                              AS last_interaction
    FROM (
        SELECT fact_id, max(event_timestamp) AS last_interaction
        FROM FACT_ENGAGEMENT_USUARIO
        WHERE user_id = {usuario_id:String} AND event_type IN ('favorito_add', 'reproduccion')
        GROUP BY fact_id
    ) e
    JOIN FACT_TRACKS ft ON ft.fact_id = e.fact_id
    JOIN DIM_ARTISTS a  ON ft.artist_id = a.artist_id
    JOIN DIM_ALBUMS  al ON ft.album_id  = al.album_id
    JOIN DIM_GENRES  g  ON ft.genre_id  = g.genre_id
    GROUP BY ft.track_name, a.name
)
ORDER BY last_interaction ASC
LIMIT {limit:UInt32}
"""

# ─────────────────────────────────────────────────────────────────────────────
# Tickets de soporte (RF-EXP-004/005)
# ─────────────────────────────────────────────────────────────────────────────

TICKET_POR_ID = """
SELECT fact_id, usuario_id, asunto, descripcion, estado, fecha_creacion, fecha_resolucion
FROM FACT_TICKET_SOPORTE WHERE fact_id = {fact_id:UInt64} LIMIT 1
"""

MIS_TICKETS = """
SELECT fact_id, asunto, descripcion, estado, fecha_creacion, fecha_resolucion
FROM FACT_TICKET_SOPORTE
WHERE usuario_id = {usuario_id:String}
ORDER BY fecha_creacion DESC
"""


def tickets_admin_sql(where: str) -> str:
    return f"""
    SELECT fact_id, usuario_id, asunto, descripcion, estado, fecha_creacion, fecha_resolucion
    FROM FACT_TICKET_SOPORTE
    {where}
    ORDER BY fecha_creacion DESC
    """


# ─────────────────────────────────────────────────────────────────────────────
# Reflejo de playlists (RF-EXP-006/007)
# ─────────────────────────────────────────────────────────────────────────────

TOP_TRACKS_PLAYLIST = """
SELECT
    b.fact_id_track                AS fact_id,
    any(ft.track_name)              AS track_name,
    any(a.name)                    AS artist_name,
    count(DISTINCT b.playlist_id)  AS playlists_count
FROM BRIDGE_TRACK_PLAYLIST_USUARIO b
JOIN FACT_TRACKS ft ON b.fact_id_track = ft.fact_id
JOIN DIM_ARTISTS a  ON ft.artist_id    = a.artist_id
GROUP BY b.fact_id_track
ORDER BY playlists_count DESC
LIMIT {limit:UInt32}
"""

# ─────────────────────────────────────────────────────────────────────────────
# Plan familiar (RF-EXP-008)
# ─────────────────────────────────────────────────────────────────────────────

MIEMBROS_DE_SUSCRIPCION = """
SELECT b.usuario_id AS usuario_id, u.nombre AS nombre, u.email AS email,
       b.es_titular AS es_titular, b.fecha_union AS fecha_union
FROM BRIDGE_SUSCRIPTOR_FAMILIA b
LEFT JOIN DIM_USUARIO u ON u.usuario_id = b.usuario_id
WHERE b.suscripcion_id = {suscripcion_id:String}
ORDER BY b.es_titular DESC, b.fecha_union ASC
"""

# Autoservicio (CU-O51/52/53, B2C titular): resuelve la `suscripcion_id` del
# plan familiar al que pertenece el usuario autenticado, sin necesitar rol
# admin ni conocer el id de antemano.
SUSCRIPCION_FAMILIAR_DE_USUARIO = """
SELECT suscripcion_id FROM BRIDGE_SUSCRIPTOR_FAMILIA WHERE usuario_id = {usuario_id:String} LIMIT 1
"""

USUARIO_POR_EMAIL = """
SELECT usuario_id, nombre, email FROM DIM_USUARIO WHERE lower(email) = lower({email:String}) LIMIT 1
"""

COUNT_MIEMBROS_SUSCRIPCION = """
SELECT count() AS n FROM BRIDGE_SUSCRIPTOR_FAMILIA WHERE suscripcion_id = {suscripcion_id:String}
"""

# Un usuario pertenece, como máximo, a un plan familiar activo a la vez (spec.md)
# — se verifica sin filtrar por suscripcion_id porque la membresía se elimina
# (DELETE físico) al salir de un plan, así que cualquier fila presente es la
# membresía vigente.
USUARIO_YA_EN_PLAN_FAMILIAR = """
SELECT count() AS n FROM BRIDGE_SUSCRIPTOR_FAMILIA WHERE usuario_id = {usuario_id:String}
"""

MIEMBRO_EXISTE = """
SELECT count() AS n FROM BRIDGE_SUSCRIPTOR_FAMILIA
WHERE suscripcion_id = {suscripcion_id:String} AND usuario_id = {usuario_id:String}
"""

SUSCRIPCION_TIENE_TITULAR = """
SELECT count() AS n FROM BRIDGE_SUSCRIPTOR_FAMILIA
WHERE suscripcion_id = {suscripcion_id:String} AND es_titular = 1
"""

# Dashboard (RT-04, S10 Día 3): tickets de soporte reales por estado —
# FACT_TICKET_SOPORTE es append-once por ticket (ALTER UPDATE in-place al
# resolver, no ReplacingMergeTree), así que un GROUP BY directo ya refleja
# el estado vigente sin necesitar argMax.
TICKETS_POR_ESTADO = "SELECT estado, count() AS total FROM FACT_TICKET_SOPORTE GROUP BY estado"

TICKETS_ABIERTOS_TOTAL = "SELECT count() AS n FROM FACT_TICKET_SOPORTE WHERE estado IN ('abierto', 'en_proceso')"
