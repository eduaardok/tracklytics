# Matriz de permisos por defecto por rol (design.md, Open Questions): se
# siembra en FACT_PERMISO_USUARIO al registrar un usuario. No pretende cubrir
# todos los recursos del proyecto — solo los que esta capability administra
# directamente hoy; ampliarla es responsabilidad de cada capability que migre
# a este modelo (fuera de alcance de este cambio, ver design.md Non-Goals).
PERMISOS_POR_DEFECTO: dict[str, list[tuple[str, str]]] = {
    "user":    [("biblioteca", "leer"), ("biblioteca", "escribir")],
    "analyst": [("analitica", "leer")],
    "admin":   [
        ("analitica", "leer"),
        ("seguridad.permisos", "leer"), ("seguridad.permisos", "escribir"),
        ("seguridad.auditoria", "leer"),
        ("seguridad.errores", "leer"),
    ],
}

# El alias de la columna agregada de fecha NO puede llamarse igual que la
# columna cruda `fecha_asignacion`: ClickHouse sustituye alias hacia adelante
# dentro del mismo SELECT, y eso reescribe los otros argMax(..., fecha_asignacion)
# de esta lista como argMax(..., max(fecha_asignacion)) -> agregación anidada
# ilegal (Code 184). Se usa un alias distinto en la subquery y se renombra
# recién en el SELECT externo, donde ya no hay ambigüedad de agregación.
PERMISOS_VIGENTES = """
SELECT recurso, accion, permitido, fecha_asignacion_max AS fecha_asignacion, asignado_por
FROM (
    SELECT
        recurso, accion,
        argMax(permitido, fecha_asignacion)    AS permitido,
        max(fecha_asignacion)                  AS fecha_asignacion_max,
        argMax(asignado_por, fecha_asignacion) AS asignado_por
    FROM FACT_PERMISO_USUARIO
    WHERE usuario_id = {usuario_id:String}
    GROUP BY recurso, accion
)
WHERE permitido = true
ORDER BY recurso, accion
"""

PERMISO_VIGENTE_UNO = """
SELECT argMax(permitido, fecha_asignacion) AS permitido
FROM FACT_PERMISO_USUARIO
WHERE usuario_id = {usuario_id:String} AND recurso = {recurso:String} AND accion = {accion:String}
"""

AUDIT_LOG_RECIENTES = """
SELECT audit_id, usuario_id, accion, tabla_afectada, antes, despues, timestamp
FROM FACT_AUDIT_LOG
ORDER BY timestamp DESC
LIMIT {limit:UInt32}
"""

ERRORES_RECIENTES = """
SELECT error_id, codigo, mensaje, servicio, usuario_id, timestamp, resolved
FROM FACT_ERROR_SISTEMA
ORDER BY timestamp DESC
LIMIT {limit:UInt32}
"""

# No usa FINAL/fecha_fin IS NULL directo sobre la tabla cruda: ReplacingMergeTree
# no fusiona las partes de inmediato, así que una sesión ya cerrada podría seguir
# viéndose como "abierta" (fila original con fecha_fin NULL aún sin fusionar) y
# cerrarse dos veces. Se resuelve el estado vigente por sesion_id con argMax
# sobre fecha_fin_version antes de filtrar por fecha_fin IS NULL.
SESION_ABIERTA_POR_DISPOSITIVO = """
SELECT sesion_id, fecha_inicio, fecha_fin
FROM (
    SELECT
        sesion_id,
        anyLast(fecha_inicio) AS fecha_inicio,
        argMax(fecha_fin, fecha_fin_version) AS fecha_fin
    FROM FACT_SESION
    WHERE usuario_id = {usuario_id:String} AND dispositivo_id = {dispositivo_id:String}
    GROUP BY sesion_id
)
WHERE fecha_fin IS NULL
ORDER BY fecha_inicio DESC
LIMIT 1
"""

DISPOSITIVO_EXISTE = """
SELECT dispositivo_id FROM DIM_DISPOSITIVO
WHERE usuario_id = {usuario_id:String} AND dispositivo_id = {dispositivo_id:String}
LIMIT 1
"""

USUARIO_EXISTE_EN_DIM = """
SELECT usuario_id FROM DIM_USUARIO WHERE usuario_id = {usuario_id:String} LIMIT 1
"""
