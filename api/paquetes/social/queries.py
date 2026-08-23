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

# `usuario_id` incluido (además de fact_id/fact_id_track): necesario para
# notificar al autor del comentario padre cuando alguien le responde
# (notificaciones.py) — antes esta query solo se usaba para validar que el
# padre existiera y perteneciera al mismo track.
COMENTARIO_PADRE_INFO = """
SELECT fact_id, fact_id_track, usuario_id
FROM FACT_COMENTARIO WHERE fact_id = {fact_id:UInt64} LIMIT 1
"""

# Resuelve el usuario dueño de la cuenta de artista que subió un track, a
# partir de su fact_id — usado para notificar "comentario en tu contenido"
# cuando el comentario es raíz (no respuesta). El vínculo DIM_ARTISTS <->
# DIM_CUENTA_ARTISTA es por nombre_artistico (mismo join "suave" ya aceptado
# en `creadores/promocion.py::_resolver_artist_id`, no hay FK real entre
# ambas tablas) — un track sin cuenta de artista resoluble (ej. dataset
# original, no `user_uploaded`) simplemente no genera notificación.
AUTOR_TRACK_POR_FACT_ID = """
SELECT ca.usuario_id AS usuario_id
FROM FACT_TRACKS ft
JOIN DIM_ARTISTS a ON a.artist_id = ft.artist_id
JOIN DIM_CUENTA_ARTISTA ca ON ca.nombre_artistico = a.name
WHERE ft.fact_id = {fact_id:UInt64} AND ca.estado_cuenta = 'aprobada'
LIMIT 1
"""

# ─────────────────────────────────────────────────────────────────────────────
# Notificaciones (S10 ronda 2)
# ─────────────────────────────────────────────────────────────────────────────

SEGUIDORES_ACTIVOS_DE_ARTISTA = """
SELECT usuario_id FROM BRIDGE_SEGUIMIENTO_ARTISTA
WHERE artista_id = {artista_id:UInt32} AND activo = 1
"""

NOTIFICACIONES_DE_USUARIO = """
SELECT fact_id, tipo, referencia_tipo, referencia_id, mensaje, leido, fecha_creacion, fecha_lectura
FROM FACT_NOTIFICACION
WHERE usuario_destino_id = {usuario_id:String}
ORDER BY fecha_creacion DESC
LIMIT {limit:UInt32}
"""

NOTIFICACIONES_NO_LEIDAS_TOTAL = """
SELECT count() AS n FROM FACT_NOTIFICACION
WHERE usuario_destino_id = {usuario_id:String} AND leido = 0
"""

NOTIFICACION_POR_ID = """
SELECT fact_id, usuario_destino_id, leido
FROM FACT_NOTIFICACION WHERE fact_id = {fact_id:UInt64} LIMIT 1
"""

# Panel de moderación: últimas 200 notificaciones de TODO el sistema, no por
# usuario (a diferencia de NOTIFICACIONES_DE_USUARIO). FACT_NOTIFICACION es
# MergeTree simple (no ReplacingMergeTree), así que el LEFT JOIN a DIM_USUARIO
# no necesita resolverse con argMax — mismo criterio que AUDIT_LOG_RECIENTES/
# ERRORES_RECIENTES en `seguridad`.
NOTIFICACIONES_ADMIN = """
SELECT
    n.fact_id            AS fact_id,
    n.usuario_destino_id  AS usuario_destino_id,
    u.nombre              AS destinatario_nombre,
    n.tipo                AS tipo,
    n.referencia_tipo      AS referencia_tipo,
    n.referencia_id        AS referencia_id,
    n.mensaje              AS mensaje,
    n.leido                AS leido,
    n.fecha_creacion       AS fecha_creacion
FROM FACT_NOTIFICACION n
LEFT JOIN DIM_USUARIO u ON n.usuario_destino_id = u.usuario_id
"""

# ─────────────────────────────────────────────────────────────────────────────
# Preferencias de notificación — opt-out por tipo (P2, S16)
# ─────────────────────────────────────────────────────────────────────────────

# Estado real por tipo (última fila por versión). Ausencia de fila = activo
# (modelo opt-out) — el router completa los tipos faltantes con `activo=1`
# antes de responder, esta query solo trae lo que el usuario tocó alguna vez.
PREFERENCIAS_NOTIFICACION_USUARIO = """
SELECT tipo, argMax(activo, actualizado_en) AS activo
FROM DIM_PREFERENCIA_NOTIFICACION
WHERE usuario_id = {usuario_id:String}
GROUP BY tipo
"""

# Usados por `notificaciones.crear*` para no insertar una notificación que el
# destinatario desactivó. `usuario_ids` viaja como Array(String) para poder
# filtrar en batch a los seguidores de un artista en una sola consulta.
PREFERENCIAS_DESACTIVADAS_DE_USUARIOS = """
SELECT usuario_id FROM (
    SELECT usuario_id, argMax(activo, actualizado_en) AS activo
    FROM DIM_PREFERENCIA_NOTIFICACION
    WHERE usuario_id IN {usuario_ids:Array(String)} AND tipo = {tipo:String}
    GROUP BY usuario_id
) WHERE activo = 0
ORDER BY n.fecha_creacion DESC
LIMIT 200
"""

# ─────────────────────────────────────────────────────────────────────────────
# Perfiles públicos/privados (S10 ronda 2)
# ─────────────────────────────────────────────────────────────────────────────

PERFIL_PUBLICO_USUARIO = """
SELECT usuario_id, nombre, perfil_publico
FROM DIM_USUARIO WHERE usuario_id = {usuario_id:String} LIMIT 1
"""

# Puerta de entrada al descubrimiento de perfiles públicos: sin esta query no
# hay forma de llegar a GET /usuarios/{usuario_id}/perfil salvo ya conocer el
# id (S16, "descubrimiento de perfiles públicos"). El filtro perfil_publico=1
# es incondicional — nunca depende del viewer, a diferencia de perfil_publico
# (que sí deja ver el propio perfil privado al dueño): un perfil privado no
# debe aparecer en resultados de búsqueda ni para su propio dueño buscándose
# a sí mismo. Solo trae usuario_id/nombre — nada de email/rol/facturación,
# a diferencia de USUARIOS_BUSQUEDA (seguridad/queries.py, admin-only).
BUSCAR_PERFILES_PUBLICOS = """
SELECT usuario_id, nombre
FROM DIM_USUARIO
WHERE perfil_publico = 1 AND lower(nombre) LIKE lower({pattern:String})
ORDER BY nombre
LIMIT {limit:UInt32}
"""

# Columnas calificadas con AS explícito (mismo motivo ya documentado en
# `paquetes/creadores/queries.py`): el LEFT JOIN de una tabla contra sí misma
# (comentario contra su propio padre) duplicaría nombres de columna sin alias.
_COMENTARIO_COLS = """
    c.fact_id             AS fact_id,
    c.usuario_id          AS usuario_id,
    u.nombre              AS usuario_nombre,
    c.fact_id_track       AS fact_id_track,
    ft.track_name         AS track_name,
    a.name                AS artist_name,
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
#
# Bloqueo (change p2-descubrimiento-comunidad): los comentarios de un usuario
# bloqueado desaparecen para quien lo bloqueó. El filtro es unidireccional a
# propósito — solo mira los bloqueos EMITIDOS por el lector, no los recibidos:
# ocultarle a alguien los comentarios de quien lo bloqueó le revelaría el
# bloqueo, que es justo lo que un bloqueo debe evitar señalar (Decisión 4).
COMENTARIOS_VISIBLES_DE_TRACK = f"""
SELECT {_COMENTARIO_COLS}
FROM FACT_COMENTARIO c
LEFT JOIN FACT_COMENTARIO p ON c.comentario_padre_id = p.fact_id
LEFT JOIN FACT_TRACKS ft ON c.fact_id_track = ft.fact_id
LEFT JOIN DIM_ARTISTS a ON ft.artist_id = a.artist_id
LEFT JOIN DIM_USUARIO u ON c.usuario_id = u.usuario_id
WHERE c.fact_id_track = {{fact_id_track:UInt64}}
  AND c.estado_moderacion != 'eliminado'
  AND (c.comentario_padre_id IS NULL OR p.estado_moderacion != 'eliminado')
  AND c.usuario_id NOT IN (
      SELECT bloqueado_id FROM (
          SELECT bloqueado_id, argMax(activo, actualizado_en) AS vigente
          FROM BRIDGE_BLOQUEO_USUARIO
          WHERE bloqueador_id = {{lector_id:String}}
          GROUP BY bloqueado_id
      ) WHERE vigente = 1
  )
ORDER BY c.fecha_creacion ASC
"""


# ── Bloqueo usuario-a-usuario (change p2-descubrimiento-comunidad) ───────────
# BRIDGE_BLOQUEO_USUARIO es ReplacingMergeTree(actualizado_en) ORDER BY
# (bloqueador_id, bloqueado_id): desbloquear es insertar una fila nueva con
# activo=0, nunca un DELETE. Todas las lecturas resuelven con argMax porque el
# merge puede no haber ocurrido todavía.

BLOQUEO_VIGENTE = """
SELECT argMax(activo, actualizado_en) AS activo
FROM BRIDGE_BLOQUEO_USUARIO
WHERE bloqueador_id = {bloqueador_id:String} AND bloqueado_id = {bloqueado_id:String}
"""

MIS_BLOQUEADOS = """
SELECT b.bloqueado_id AS usuario_id, u.nombre AS nombre, b.created_at AS created_at
FROM (
    SELECT bloqueado_id, argMax(activo, actualizado_en) AS vigente, min(created_at) AS created_at
    FROM BRIDGE_BLOQUEO_USUARIO
    WHERE bloqueador_id = {bloqueador_id:String}
    GROUP BY bloqueado_id
) b
LEFT JOIN DIM_USUARIO u ON u.usuario_id = b.bloqueado_id
WHERE b.vigente = 1
ORDER BY b.created_at DESC
"""

# ¿`candidato` fue bloqueado por `autor`? Gobierna si un usuario puede responder
# a un comentario ajeno: el bloqueado no puede dirigirse a quien lo bloqueó.
ME_BLOQUEO = """
SELECT argMax(activo, actualizado_en) AS activo
FROM BRIDGE_BLOQUEO_USUARIO
WHERE bloqueador_id = {autor_id:String} AND bloqueado_id = {candidato_id:String}
"""

USUARIO_EXISTE = """
SELECT count() AS n FROM DIM_USUARIO WHERE usuario_id = {usuario_id:String}
"""


def comentarios_admin_sql(where: str) -> str:
    # Paginado (mismo patrón que `denuncias_admin_sql`): sin LIMIT/OFFSET esta
    # query devolvía TODA `FACT_COMENTARIO` de una sola vez — con el dataset
    # real (~38k comentarios, ~11.5MB de JSON) el fetch + el render de una
    # lista sin virtualizar colgaban la pestaña ("la página no responde",
    # reportado desde /seguridad/social).
    return f"""
    SELECT {_COMENTARIO_COLS}
    FROM FACT_COMENTARIO c
    LEFT JOIN FACT_TRACKS ft ON c.fact_id_track = ft.fact_id
    LEFT JOIN DIM_ARTISTS a ON ft.artist_id = a.artist_id
    LEFT JOIN DIM_USUARIO u ON c.usuario_id = u.usuario_id
    {where}
    ORDER BY c.fecha_creacion DESC
    LIMIT {{limit:UInt32}} OFFSET {{offset:UInt32}}
    """


def comentarios_admin_count_sql(where: str) -> str:
    return f"SELECT count() AS total FROM FACT_COMENTARIO c {where}"


# ── Denuncias de contenido (change p1-ciclos-vida) ───────────────────────────
# FACT_DENUNCIA es ReplacingMergeTree(actualizado_en) ORDER BY denuncia_id: una
# actualización de estado es una fila nueva con el mismo id y un
# `actualizado_en` mayor, resuelta con argMax (nunca leyendo la tabla cruda).
_DENUNCIA_RESUELTA = """
    SELECT
        denuncia_id,
        anyLast(denunciante_id)              AS denunciante_id,
        anyLast(tipo_objeto)                 AS tipo_objeto,
        anyLast(objeto_id)                   AS objeto_id,
        anyLast(motivo)                      AS motivo,
        anyLast(descripcion)                 AS descripcion,
        argMax(estado, actualizado_en)       AS estado,
        min(created_at)                      AS created_at
    FROM FACT_DENUNCIA
    GROUP BY denuncia_id
"""

DENUNCIA_POR_ID = f"SELECT * FROM ({_DENUNCIA_RESUELTA}) WHERE denuncia_id = {{denuncia_id:UInt64}} LIMIT 1"


def denuncias_admin_sql(where: str) -> str:
    return f"""
    SELECT * FROM ({_DENUNCIA_RESUELTA})
    {where}
    ORDER BY created_at DESC
    LIMIT {{limit:UInt32}} OFFSET {{offset:UInt32}}
    """


def denuncias_count_sql(where: str) -> str:
    return f"SELECT count() AS total FROM ({_DENUNCIA_RESUELTA}) {where}"

# Dashboard (RT-04, S10 Día 3): actividad social real por día, últimos 14
# días — 2 series (comentarios vs comparticiones), ambas append-only.
ACTIVIDAD_SOCIAL_POR_DIA = """
SELECT toDate(fecha_creacion) AS dia, 'comentario' AS tipo, count() AS total
FROM FACT_COMENTARIO
WHERE fecha_creacion >= now() - INTERVAL 14 DAY AND estado_moderacion != 'eliminado'
GROUP BY dia
UNION ALL
SELECT toDate(fecha) AS dia, 'comparticion' AS tipo, count() AS total
FROM FACT_COMPARTICION
WHERE fecha >= now() - INTERVAL 14 DAY
GROUP BY dia
ORDER BY dia
"""

ARTISTAS_MAS_SEGUIDOS = """
SELECT b.artista_id AS artista_id, a.name AS nombre, count() AS seguidores
FROM BRIDGE_SEGUIMIENTO_ARTISTA b
JOIN DIM_ARTISTS a ON a.artist_id = b.artista_id
WHERE b.activo = 1
GROUP BY b.artista_id, a.name
ORDER BY seguidores DESC
LIMIT 5
"""

# Feed de actividad (S10 Día 3): el modelo solo tiene seguimiento de ARTISTAS
# (BRIDGE_SEGUIMIENTO_ARTISTA) — no existe un concepto de "seguir a otro
# usuario" en el modelo de datos. Se interpreta "actividad de a quién sigo"
# como actividad reciente (comentarios + comparticiones) sobre tracks de los
# artistas que el usuario sigue, que es la relación de seguimiento real que
# existe — ver design.md del change de este día para la decisión completa.
FEED_ACTIVIDAD_SEGUIDOS = """
SELECT tipo, id, usuario_id, usuario_nombre, contenido, fecha, track_name, artista_id, artista_nombre,
       track_fact_id
FROM (
    SELECT 'comentario' AS tipo, c.fact_id AS id, c.usuario_id AS usuario_id,
           u.nombre AS usuario_nombre, c.contenido AS contenido, c.fecha_creacion AS fecha,
           t.track_name AS track_name, a.artist_id AS artista_id, a.name AS artista_nombre,
           c.fact_id_track AS track_fact_id
    FROM FACT_COMENTARIO c
    JOIN FACT_TRACKS t ON t.fact_id = c.fact_id_track
    JOIN DIM_ARTISTS a ON a.artist_id = t.artist_id
    LEFT JOIN DIM_USUARIO u ON u.usuario_id = c.usuario_id
    WHERE c.estado_moderacion = 'visible' AND c.comentario_padre_id IS NULL
      AND a.artist_id IN (SELECT artista_id FROM BRIDGE_SEGUIMIENTO_ARTISTA WHERE usuario_id = {usuario_id:String} AND activo = 1)

    UNION ALL

    SELECT 'comparticion' AS tipo, s.fact_id AS id, s.usuario_id AS usuario_id,
           u.nombre AS usuario_nombre, '' AS contenido, s.fecha AS fecha,
           t.track_name AS track_name, a.artist_id AS artista_id, a.name AS artista_nombre,
           s.fact_id_track AS track_fact_id
    FROM FACT_COMPARTICION s
    JOIN FACT_TRACKS t ON t.fact_id = s.fact_id_track
    JOIN DIM_ARTISTS a ON a.artist_id = t.artist_id
    LEFT JOIN DIM_USUARIO u ON u.usuario_id = s.usuario_id
    WHERE s.fact_id_track IS NOT NULL
      AND a.artist_id IN (SELECT artista_id FROM BRIDGE_SEGUIMIENTO_ARTISTA WHERE usuario_id = {usuario_id:String} AND activo = 1)
)
WHERE usuario_id NOT IN (
    SELECT bloqueado_id FROM (
        SELECT bloqueado_id, argMax(activo, actualizado_en) AS vigente
        FROM BRIDGE_BLOQUEO_USUARIO
        WHERE bloqueador_id = {usuario_id:String}
        GROUP BY bloqueado_id
    ) WHERE vigente = 1
)
ORDER BY fecha DESC
LIMIT 30
"""
