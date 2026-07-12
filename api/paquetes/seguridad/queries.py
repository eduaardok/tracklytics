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
SELECT a.audit_id, a.usuario_id, u.nombre AS usuario_nombre, u.email AS usuario_email,
       a.accion, a.tabla_afectada, a.antes, a.despues, a.timestamp
FROM FACT_AUDIT_LOG a
LEFT JOIN DIM_USUARIO u ON u.usuario_id = a.usuario_id
ORDER BY a.timestamp DESC
LIMIT {limit:UInt32}
"""

ERRORES_RECIENTES = """
SELECT e.error_id, e.codigo, e.mensaje, e.servicio, e.usuario_id,
       u.nombre AS usuario_nombre, u.email AS usuario_email, e.timestamp, e.resolved
FROM FACT_ERROR_SISTEMA e
LEFT JOIN DIM_USUARIO u ON u.usuario_id = e.usuario_id
ORDER BY e.timestamp DESC
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

USUARIOS_BUSQUEDA = """
SELECT usuario_id, nombre, email, rol
FROM DIM_USUARIO
WHERE lower(nombre) LIKE lower({pattern:String}) OR lower(email) LIKE lower({pattern:String})
ORDER BY nombre
LIMIT {limit:UInt32}
"""

# Panel "Permisos" (CU-O17, más "pro"): tabla completa de usuarios, no solo
# resultados de búsqueda — auditoría 2026-07-09. Filtrable por rol y rango de
# fecha de registro (S10 ronda 2, UserPicker "abrir lista completa sin
# escribir") — filtro de plan queda fuera: el plan vive en PocketBase
# (suscripciones), no en DIM_USUARIO, y unirlo por fila implicaría N+1
# llamadas a PocketBase por página en vez de un WHERE en ClickHouse (decisión
# explícita, no un olvido — ver BITACORA_S10).
def usuarios_listado_sql(where: str) -> str:
    return f"""
    SELECT usuario_id, nombre, email, rol, fecha_registro
    FROM DIM_USUARIO
    {where}
    ORDER BY fecha_registro DESC
    LIMIT {{limit:UInt32}}
    OFFSET {{offset:UInt32}}
    """


def usuarios_listado_total_sql(where: str) -> str:
    return f"SELECT count() AS n FROM DIM_USUARIO {where}"


USUARIO_POR_ID = """
SELECT usuario_id, nombre, email, rol FROM DIM_USUARIO WHERE usuario_id = {usuario_id:String} LIMIT 1
"""

# Autoservicio de Mi Perfil (S10 ronda 2): incluye `perfil_publico`, ausente
# de USUARIO_POR_ID (uso administrativo, no necesita ese campo).
MI_PERFIL = """
SELECT usuario_id, nombre, email, pais, rol, perfil_publico
FROM DIM_USUARIO WHERE usuario_id = {usuario_id:String} LIMIT 1
"""

# Dashboard (RT-04, S10 Día 3): acciones administrativas reales por día, no
# un valor simulado — mismo criterio de "streams reales" ya usado en
# `regalias`. `toDate` en vez de agrupar por DateTime crudo: una fila por día
# calendario, ventana deslizante de 14 días desde hoy.
ACCIONES_POR_DIA = """
SELECT toDate(timestamp) AS dia, count() AS total
FROM FACT_AUDIT_LOG
WHERE timestamp >= now() - INTERVAL 14 DAY
GROUP BY dia
ORDER BY dia
"""

ERRORES_ULTIMAS_24H = "SELECT count() AS n FROM FACT_ERROR_SISTEMA WHERE timestamp >= now() - INTERVAL 24 HOUR"

# Mismo patrón de resolución que SESION_ABIERTA_POR_DISPOSITIVO (argMax sobre
# fecha_fin_version, ReplacingMergeTree) — sesión abierta = fecha_fin IS NULL.
SESIONES_ABIERTAS_TOTAL = """
SELECT count() AS n FROM (
    SELECT sesion_id, argMax(fecha_fin, fecha_fin_version) AS fecha_fin
    FROM FACT_SESION
    GROUP BY sesion_id
) WHERE fecha_fin IS NULL
"""

# CU-O nuevo (S10 Día 3): listar las sesiones abiertas de un usuario, para que
# pueda cerrar remotamente cualquiera que no sea la suya (dispositivo_id
# propio de la request actual se resuelve aparte en el router).
MIS_SESIONES_ABIERTAS = """
SELECT s.sesion_id AS sesion_id, s.dispositivo_id AS dispositivo_id, s.fecha_inicio AS fecha_inicio,
       d.tipo AS tipo, d.os AS os
FROM (
    SELECT * FROM (
        SELECT
            sesion_id,
            anyLast(usuario_id)     AS usuario_id,
            anyLast(dispositivo_id) AS dispositivo_id,
            anyLast(fecha_inicio)   AS fecha_inicio,
            argMax(fecha_fin, fecha_fin_version) AS fecha_fin
        FROM FACT_SESION
        GROUP BY sesion_id
    )
    WHERE usuario_id = {usuario_id:String} AND fecha_fin IS NULL
) s
LEFT JOIN DIM_DISPOSITIVO d ON d.dispositivo_id = s.dispositivo_id
ORDER BY s.fecha_inicio DESC
"""

SESION_POR_ID = """
SELECT sesion_id, usuario_id, dispositivo_id, fecha_inicio, fecha_fin
FROM (
    SELECT
        sesion_id,
        anyLast(usuario_id)     AS usuario_id,
        anyLast(dispositivo_id) AS dispositivo_id,
        anyLast(fecha_inicio)   AS fecha_inicio,
        argMax(fecha_fin, fecha_fin_version) AS fecha_fin
    FROM FACT_SESION
    WHERE sesion_id = {sesion_id:String}
    GROUP BY sesion_id
)
LIMIT 1
"""
