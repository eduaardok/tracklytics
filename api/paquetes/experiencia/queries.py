# ─────────────────────────────────────────────────────────────────────────────
# Recomendaciones (RF-EXP-002/003) — algoritmo simple documentado como tal
# (design.md, Non-Goal "Motor de recomendación con machine learning"): mismo
# género que los favoritos del usuario, con fallback a popularidad global
# cuando el usuario no tiene favoritos todavía.
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

RECOMENDACIONES_POR_GENERO = """
SELECT
    ft.fact_id    AS fact_id,
    ft.track_id   AS track_id,
    ft.track_name AS track_name,
    a.name        AS artist_name,
    ft.genre_id   AS genre_id
FROM FACT_TRACKS ft
JOIN DIM_ARTISTS a ON ft.artist_id = a.artist_id
WHERE ft.genre_id IN {genre_ids:Array(UInt16)}
  AND ft.fact_id NOT IN {excluidos:Array(UInt64)}
  AND ft.source_type != 'synthetic'
ORDER BY ft.popularity DESC
LIMIT {limit:UInt32}
"""

RECOMENDACIONES_POPULARES = """
SELECT
    ft.fact_id    AS fact_id,
    ft.track_id   AS track_id,
    ft.track_name AS track_name,
    a.name        AS artist_name,
    ft.genre_id   AS genre_id
FROM FACT_TRACKS ft
JOIN DIM_ARTISTS a ON ft.artist_id = a.artist_id
WHERE ft.fact_id NOT IN {excluidos:Array(UInt64)}
  AND ft.source_type != 'synthetic'
ORDER BY ft.popularity DESC
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
SELECT usuario_id, es_titular, fecha_union
FROM BRIDGE_SUSCRIPTOR_FAMILIA
WHERE suscripcion_id = {suscripcion_id:String}
ORDER BY es_titular DESC, fecha_union ASC
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
