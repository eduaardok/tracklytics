ARTISTA_EXISTE = "SELECT count() AS n FROM DIM_ARTISTS WHERE artist_id = {artista_id:UInt32}"

TRACK_EXISTE = "SELECT count() AS n FROM FACT_TRACKS WHERE fact_id = {fact_id:UInt64}"

SEGUIMIENTO_ACTIVO_EXISTE = """
SELECT count() AS n FROM BRIDGE_SEGUIMIENTO_ARTISTA
WHERE usuario_id = {usuario_id:String} AND artista_id = {artista_id:UInt32} AND activo = 1
"""

ARTISTAS_SEGUIDOS_POR_USUARIO = """
SELECT b.artista_id AS artista_id, a.name AS nombre, b.fecha_inicio AS fecha_inicio
FROM BRIDGE_SEGUIMIENTO_ARTISTA b
JOIN DIM_ARTISTS a ON b.artista_id = a.artist_id
WHERE b.usuario_id = {usuario_id:String} AND b.activo = 1
ORDER BY b.fecha_inicio DESC
"""

COMENTARIO_POR_ID = "SELECT * FROM FACT_COMENTARIO WHERE fact_id = {fact_id:UInt64} LIMIT 1"

COMENTARIO_PADRE_INFO = "SELECT fact_id, fact_id_track FROM FACT_COMENTARIO WHERE fact_id = {fact_id:UInt64} LIMIT 1"

# Columnas calificadas con AS explícito (mismo motivo ya documentado en
# `paquetes/creadores/queries.py`): el LEFT JOIN de una tabla contra sí misma
# (comentario contra su propio padre) duplicaría nombres de columna sin alias.
_COMENTARIO_COLS = """
    c.fact_id             AS fact_id,
    c.usuario_id          AS usuario_id,
    c.fact_id_track       AS fact_id_track,
    c.tipo_interaccion_id AS tipo_interaccion_id,
    c.comentario_padre_id AS comentario_padre_id,
    c.contenido           AS contenido,
    c.fecha_creacion      AS fecha_creacion,
    c.estado_moderacion   AS estado_moderacion,
    c.moderado_por        AS moderado_por,
    c.fecha_moderacion    AS fecha_moderacion
"""

# Excluye los comentarios eliminados y cualquier comentario cuyo padre esté
# eliminado (design.md, "Comentarios cuyo padre está `eliminado` se excluyen
# también del listado"). Un comentario `oculto` SÍ se devuelve — el frontend
# decide sustituir `contenido` por un placeholder (design.md, "Listado
# público de comentarios: excluye `eliminado`, conserva `oculto`").
COMENTARIOS_VISIBLES_DE_TRACK = f"""
SELECT {_COMENTARIO_COLS}
FROM FACT_COMENTARIO c
LEFT JOIN FACT_COMENTARIO p ON c.comentario_padre_id = p.fact_id
WHERE c.fact_id_track = {{fact_id_track:UInt64}}
  AND c.estado_moderacion != 'eliminado'
  AND (c.comentario_padre_id IS NULL OR p.estado_moderacion != 'eliminado')
ORDER BY c.fecha_creacion ASC
"""


def comentarios_admin_sql(where: str) -> str:
    return f"""
    SELECT {_COMENTARIO_COLS}
    FROM FACT_COMENTARIO c
    {where}
    ORDER BY c.fecha_creacion DESC
    """
