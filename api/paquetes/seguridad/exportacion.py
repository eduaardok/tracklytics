"""Exportación de datos personales (change p2-descubrimiento-comunidad).

Cierra el ciclo de derechos del usuario que abrió la baja de cuenta (change
roles-gestion-usuarios): además de poder irse, el usuario puede llevarse lo suyo.

Acoplamiento (design.md, Decisión 8): este módulo consulta directamente las
tablas de las otras capabilities en vez de importar sus queries o llamar a sus
routers. El contrato al que se acopla es el modelo dimensional de ClickHouse,
que es la fuente de verdad compartida y la interfaz más estable del sistema;
importar los routers crearía ciclos y reusar sus queries acoplaría `seguridad` a
los nombres internos de todos los paquetes. Las queries de exportación son
además de otra naturaleza — volcado completo, sin paginación ni filtros — así
que compartirlas tampoco ahorraría gran cosa.

El coste asumido y explícito: un cambio de esquema en cualquiera de esas tablas
obliga a tocar también este archivo.
"""

from core.database import query_one, query_rows

PERFIL = """
SELECT usuario_id, email, nombre, pais, fecha_registro, rol,
       argMax(estado_cuenta, actualizado_en)   AS estado_cuenta,
       argMax(email_verificado, actualizado_en) AS email_verificado,
       argMax(perfil_publico, actualizado_en)   AS perfil_publico
FROM DIM_USUARIO
WHERE usuario_id = {usuario_id:String}
GROUP BY usuario_id, email, nombre, pais, fecha_registro, rol
"""

# Favoritos vigentes: mismo patrón argMax + HAVING que usa `biblioteca`.
FAVORITOS = """
SELECT t.track_name AS track_name, a.name AS artist_name, f.fact_id AS fact_id
FROM (
    SELECT fact_id, argMax(event_type, event_timestamp) AS last_event
    FROM FACT_ENGAGEMENT_USUARIO
    WHERE user_id = {usuario_id:String}
    GROUP BY fact_id
    HAVING last_event = 'favorito_add'
) f
JOIN FACT_TRACKS t ON t.fact_id = f.fact_id
JOIN DIM_ARTISTS a ON a.artist_id = t.artist_id
"""

HISTORIAL = """
SELECT t.track_name AS track_name, a.name AS artist_name, e.event_timestamp AS fecha
FROM FACT_ENGAGEMENT_USUARIO e
JOIN FACT_TRACKS t ON t.fact_id = e.fact_id
JOIN DIM_ARTISTS a ON a.artist_id = t.artist_id
WHERE e.user_id = {usuario_id:String} AND e.event_type = 'reproduccion'
ORDER BY e.event_timestamp DESC
"""

COMENTARIOS = """
SELECT c.fact_id AS comentario_id, c.contenido AS contenido,
       c.fecha_creacion AS fecha, c.estado_moderacion AS estado,
       t.track_name AS track_name
FROM FACT_COMENTARIO c
LEFT JOIN FACT_TRACKS t ON t.fact_id = c.fact_id_track
WHERE c.usuario_id = {usuario_id:String}
ORDER BY c.fecha_creacion DESC
"""

SEGUIMIENTOS = """
SELECT a.name AS artista, s.desde AS fecha_inicio
FROM (
    -- El alias no puede llamarse `fecha_inicio`: ClickHouse lo resolvería
    -- contra el propio agregado y falla con ILLEGAL_AGGREGATION.
    SELECT artista_id,
           argMax(activo, fecha_inicio) AS vigente,
           min(fecha_inicio)            AS desde
    FROM BRIDGE_SEGUIMIENTO_ARTISTA
    WHERE usuario_id = {usuario_id:String}
    GROUP BY artista_id
) s
JOIN DIM_ARTISTS a ON a.artist_id = s.artista_id
WHERE s.vigente = 1
"""

TICKETS = """
SELECT fact_id AS ticket_id, asunto, descripcion, estado,
       fecha_creacion, fecha_resolucion
FROM FACT_TICKET_SOPORTE
WHERE usuario_id = {usuario_id:String}
ORDER BY fecha_creacion DESC
"""

DENUNCIAS_EMITIDAS = """
SELECT denuncia_id,
       anyLast(tipo_objeto)           AS tipo_objeto,
       anyLast(objeto_id)             AS objeto_id,
       anyLast(motivo)                AS motivo,
       argMax(estado, actualizado_en) AS estado,
       min(created_at)                AS created_at
FROM FACT_DENUNCIA
WHERE denunciante_id = {usuario_id:String}
GROUP BY denuncia_id
ORDER BY created_at DESC
"""

PAGOS = """
SELECT transaccion_id, suscripcion_id, monto, moneda, estado, concepto, fecha
FROM FACT_TRANSACCION_PAGO
WHERE usuario_id = {usuario_id:String}
ORDER BY fecha DESC
"""

BLOQUEOS = """
SELECT b.bloqueado_id AS usuario_id, u.nombre AS nombre, b.created_at AS created_at
FROM (
    SELECT bloqueado_id, argMax(activo, actualizado_en) AS vigente, min(created_at) AS created_at
    FROM BRIDGE_BLOQUEO_USUARIO
    WHERE bloqueador_id = {usuario_id:String}
    GROUP BY bloqueado_id
) b
LEFT JOIN DIM_USUARIO u ON u.usuario_id = b.bloqueado_id
WHERE b.vigente = 1
"""

# S16-P10 (gap GDPR detectado en la revisión del dominio): el dump no incluía
# las notificaciones recibidas ni el estado de sus preferencias — ambos son
# datos personales que la ley de portabilidad cubre.
NOTIFICACIONES = """
SELECT tipo, referencia_tipo, referencia_id, mensaje, leido,
       fecha_creacion, fecha_lectura
FROM FACT_NOTIFICACION
WHERE usuario_destino_id = {usuario_id:String}
ORDER BY fecha_creacion DESC
LIMIT 200
"""

# Solo los tipos que el usuario tocó alguna vez (modelo opt-out: ausencia =
# activo por defecto; el router de preferencias aplica la misma regla).
PREFERENCIAS_NOTIFICACION = """
SELECT tipo, argMax(activo, actualizado_en) AS activo
FROM DIM_PREFERENCIA_NOTIFICACION
WHERE usuario_id = {usuario_id:String}
GROUP BY tipo
"""


def construir(usuario_id: str, playlists: list[dict], suscripcion: dict | None) -> dict:
    """Reúne todos los datos personales del usuario en un documento único.

    `playlists` y `suscripcion` llegan desde fuera porque viven en PocketBase,
    no en ClickHouse, y su lectura es asíncrona: el router las resuelve y las
    inyecta para que esta función siga siendo un volcado síncrono y sin I/O de
    red.
    """
    params = {"usuario_id": usuario_id}
    return {
        "perfil":               query_one(PERFIL, params),
        "suscripcion_activa":   suscripcion,
        "historial_pagos":      query_rows(PAGOS, params),
        "favoritos":            query_rows(FAVORITOS, params),
        "playlists":            playlists,
        "historial_reproduccion": query_rows(HISTORIAL, params),
        "comentarios":          query_rows(COMENTARIOS, params),
        "seguimientos":         query_rows(SEGUIMIENTOS, params),
        "tickets_soporte":      query_rows(TICKETS, params),
        "denuncias_emitidas":   query_rows(DENUNCIAS_EMITIDAS, params),
        "usuarios_bloqueados":  query_rows(BLOQUEOS, params),
        "notificaciones":       query_rows(NOTIFICACIONES, params),
        "preferencias_notificacion": query_rows(PREFERENCIAS_NOTIFICACION, params),
    }
