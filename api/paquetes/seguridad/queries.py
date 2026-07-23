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
# DIM_USUARIO es ReplacingMergeTree(actualizado_en): se resuelve con argMax en
# vez de leer una fila cruda, o un perfil recién editado podría devolver la
# versión anterior mientras el merge no haya ocurrido. `email_verificado`
# (change p2-descubrimiento-comunidad) alimenta el banner de verificación.
MI_PERFIL = """
SELECT
    usuario_id,
    argMax(nombre, actualizado_en)           AS nombre,
    argMax(email, actualizado_en)            AS email,
    argMax(pais, actualizado_en)             AS pais,
    argMax(rol, actualizado_en)              AS rol,
    argMax(perfil_publico, actualizado_en)   AS perfil_publico,
    argMax(email_verificado, actualizado_en) AS email_verificado
FROM DIM_USUARIO WHERE usuario_id = {usuario_id:String}
GROUP BY usuario_id
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

# ── Gestión administrativa de usuarios (change roles-gestion-usuarios) ─────────
# Listado paginado con estado_cuenta, filtrable por rol, estado y rango de
# fecha de registro. Evoluciona usuarios_listado_sql (que no exponía estado).
def usuarios_admin_listado_sql(where: str, having: str = "") -> str:
    # `having` filtra por el estado_cuenta vigente (resuelto por argMax), que no
    # se puede poner en el WHERE porque agrega sobre las filas del ReplacingMergeTree.
    return f"""
    SELECT usuario_id, nombre, email, rol, fecha_registro,
           argMax(estado_cuenta, actualizado_en) AS estado_cuenta
    FROM DIM_USUARIO
    {where}
    GROUP BY usuario_id, nombre, email, rol, fecha_registro
    {having}
    ORDER BY fecha_registro DESC
    LIMIT {{limit:UInt32}}
    OFFSET {{offset:UInt32}}
    """


def usuarios_admin_total_sql(where: str, having: str = "") -> str:
    return f"""
    SELECT count() AS n FROM (
        SELECT usuario_id, argMax(estado_cuenta, actualizado_en) AS estado_cuenta
        FROM DIM_USUARIO
        {where}
        GROUP BY usuario_id
        {having}
    )
    """


# Base de la vista 360° de un usuario: perfil + estado de cuenta vigente.
USUARIO_360_BASE = """
SELECT usuario_id, nombre, email, pais, rol, perfil_publico, fecha_registro,
       argMax(estado_cuenta, actualizado_en) AS estado_cuenta
FROM DIM_USUARIO WHERE usuario_id = {usuario_id:String}
GROUP BY usuario_id, nombre, email, pais, rol, perfil_publico, fecha_registro
LIMIT 1
"""

TRANSACCIONES_RECIENTES_USUARIO = """
SELECT transaccion_id, monto, moneda, estado, suscripcion_id, fecha
FROM FACT_TRANSACCION_PAGO
WHERE usuario_id = {usuario_id:String}
ORDER BY fecha DESC
LIMIT {limit:UInt32}
"""

ULTIMO_LOGIN_USUARIO = """
SELECT max(fecha_inicio) AS ultimo_login
FROM FACT_SESION WHERE usuario_id = {usuario_id:String}
"""

# ── Roles administrativos por área (change roles-gestion-usuarios) ─────────────
# Estado vigente de los roles admin de un usuario: la revocación es un borrado
# lógico (fila nueva con revocado=1 y `fecha` mayor), así que se resuelve con
# argMax(revocado, fecha) por (usuario_id, rol_admin) y se filtran los vigentes
# — mismo criterio que FACT_PERMISO_USUARIO, sin depender de OPTIMIZE FINAL.
# El alias de la fecha agregada NO puede llamarse `fecha` (igual que
# PERMISOS_VIGENTES arriba): ClickHouse sustituye alias hacia adelante dentro
# del mismo SELECT y reescribiría argMax(revocado, fecha) como
# argMax(revocado, max(fecha)) -> agregación anidada ilegal (Code 184). Se usa
# un alias distinto (`fecha_ult`) en la subquery.
ROLES_ADMIN_VIGENTES = """
SELECT rol_admin
FROM (
    SELECT rol_admin, argMax(revocado, fecha) AS revocado
    FROM BRIDGE_USUARIO_ROL_ADMIN
    WHERE usuario_id = {usuario_id:String}
    GROUP BY rol_admin
)
WHERE revocado = 0
ORDER BY rol_admin
"""

# Igual que arriba pero conservando metadatos, para la vista 360° / listado de
# roles asignados a un usuario.
ROLES_ADMIN_VIGENTES_DETALLE = """
SELECT b.rol_admin AS rol_admin, r.nombre AS nombre, b.asignado_por AS asignado_por, b.fecha_ult AS fecha
FROM (
    SELECT rol_admin,
           argMax(revocado, fecha)     AS revocado,
           argMax(asignado_por, fecha) AS asignado_por,
           max(fecha)                  AS fecha_ult
    FROM BRIDGE_USUARIO_ROL_ADMIN
    WHERE usuario_id = {usuario_id:String}
    GROUP BY rol_admin
) b
LEFT JOIN DIM_ROL_ADMINISTRATIVO r ON r.rol_admin = b.rol_admin
WHERE b.revocado = 0
ORDER BY b.rol_admin
"""

CATALOGO_ROLES_ADMIN = """
SELECT rol_admin, nombre, capabilities, descripcion
FROM DIM_ROL_ADMINISTRATIVO
WHERE activo = 1
ORDER BY rol_admin
"""

ROL_ADMIN_EXISTE = """
SELECT rol_admin FROM DIM_ROL_ADMINISTRATIVO WHERE rol_admin = {rol_admin:String} AND activo = 1 LIMIT 1
"""

# Estado de cuenta vigente (activa|suspendido|eliminado): resuelto con argMax
# sobre actualizado_en por si el ReplacingMergeTree de DIM_USUARIO aún no
# fusionó partes duplicadas — es un check de seguridad en cada request.
ESTADO_CUENTA_VIGENTE = """
SELECT argMax(estado_cuenta, actualizado_en) AS estado_cuenta
FROM DIM_USUARIO WHERE usuario_id = {usuario_id:String}
"""

# Intentos de login fallidos de un email en los últimos 15 minutos (lockout):
# se registran en FACT_AUDIT_LOG con accion='login_fallido' y usuario_id=email
# (no hay identidad resuelta en un login fallido).
LOGIN_FALLIDOS_RECIENTES = """
SELECT count() AS n
FROM FACT_AUDIT_LOG
WHERE accion = 'login_fallido'
  AND usuario_id = {email:String}
  AND timestamp >= now() - INTERVAL 15 MINUTE
"""

# ── Recuperación de contraseña (token de un solo uso) ──────────────────────────
# FACT_TOKEN_RECUPERACION aloja los dos tipos de token que existen
# ('recuperacion' y 'verificacion', change p2-descubrimiento-comunidad): mismo
# ciclo de vida, discriminados por `proposito`. El filtro por propósito es lo
# que impide que un token de verificación de correo sirva para restablecer una
# contraseña, y viceversa.
TOKEN_RECUPERACION_VIGENTE = """
SELECT token, usuario_id, expira_en,
       argMax(usado, created_at) AS usado
FROM FACT_TOKEN_RECUPERACION
WHERE token = {token:String} AND proposito = {proposito:String}
GROUP BY token, usuario_id, expira_en
LIMIT 1
"""

# Tokens de verificación aún sin usar de un usuario: el reenvío los invalida
# antes de emitir uno nuevo, para que solo haya un token válido a la vez.
TOKENS_VERIFICACION_ABIERTOS = """
SELECT token, usuario_id, expira_en
FROM (
    SELECT token, usuario_id, expira_en, argMax(usado, created_at) AS usado
    FROM FACT_TOKEN_RECUPERACION
    WHERE usuario_id = {usuario_id:String} AND proposito = 'verificacion'
    GROUP BY token, usuario_id, expira_en
) WHERE usado = 0
"""

EMAIL_VERIFICADO_USUARIO = """
SELECT argMax(email_verificado, actualizado_en) AS email_verificado
FROM DIM_USUARIO WHERE usuario_id = {usuario_id:String}
"""

# ── Informe de captación y registro (objetivo táctico "Captación y registro
# de usuarios") ─────────────────────────────────────────────────────────────
# `plan_activo` NO se une aquí: vive en PocketBase (suscripciones), igual que
# ya decidió usuarios_listado_sql más arriba — se enriquece en el router con
# UN solo lookup a PocketBase (no N+1 por fila). DIM_USUARIO es
# ReplacingMergeTree(actualizado_en): se resuelve con argMax por usuario_id
# antes de exponerla, mismo criterio que usuarios_admin_listado_sql. No existe
# columna `ultimo_acceso` en DIM_USUARIO — se deriva de FACT_SESION
# (max(fecha_inicio) por usuario), igual que ULTIMO_LOGIN_USUARIO. `rol` acá
# es el rol ADMINISTRATIVO por área (BRIDGE_USUARIO_ROL_ADMIN, revocación =
# borrado lógico igual que ROLES_ADMIN_VIGENTES), no el rol base de cuenta de
# DIM_USUARIO — un usuario sin rol admin asignado cae en 'usuario'.
USUARIOS_REPORTE = """
SELECT
    u.usuario_id    AS usuario_id,
    u.nombre        AS nombre,
    u.email         AS email,
    u.pais          AS pais,
    u.estado_cuenta AS estado_cuenta,
    s.ultimo_acceso AS ultimo_acceso,
    ifNull(r.rol_admin, 'usuario')  AS rol,
    ifNull(cm.nombre, 'directo')    AS canal_adquisicion
FROM (
    SELECT
        usuario_id,
        argMax(nombre, actualizado_en)        AS nombre,
        argMax(email, actualizado_en)         AS email,
        argMax(pais, actualizado_en)          AS pais,
        argMax(estado_cuenta, actualizado_en) AS estado_cuenta
    FROM DIM_USUARIO
    GROUP BY usuario_id
) u
LEFT JOIN (
    SELECT usuario_id, max(fecha_inicio) AS ultimo_acceso
    FROM FACT_SESION
    GROUP BY usuario_id
) s ON u.usuario_id = s.usuario_id
LEFT JOIN (
    SELECT usuario_id, rol_admin
    FROM (
        SELECT
            usuario_id,
            argMax(rol_admin, fecha) AS rol_admin,
            argMax(revocado, fecha)  AS revocado
        FROM BRIDGE_USUARIO_ROL_ADMIN
        GROUP BY usuario_id
    )
    WHERE revocado = 0
) r ON u.usuario_id = r.usuario_id
LEFT JOIN (
    SELECT usuario_id, argMax(canal_id, fecha) AS canal_id
    FROM FACT_ADQUISICION
    GROUP BY usuario_id
) fa ON u.usuario_id = fa.usuario_id
LEFT JOIN DIM_CANAL_MARKETING cm ON fa.canal_id = cm.canal_id
ORDER BY s.ultimo_acceso DESC
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
