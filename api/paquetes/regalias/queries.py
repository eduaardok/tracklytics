"""Queries de `regalias` — ver design.md del change 2026-07-11-regalias-publicidad
para la fórmula completa de liquidación."""

PRODUCTOR_ID_MAX = "SELECT max(productor_id) AS n FROM DIM_PRODUCTOR"
PRODUCTOR_EXISTE = "SELECT count() AS n FROM DIM_PRODUCTOR WHERE productor_id = {productor_id:UInt32}"
PRODUCTORES_LIST = "SELECT productor_id, nombre, fecha_registro FROM DIM_PRODUCTOR ORDER BY nombre"

TRACK_EXISTE = "SELECT count() AS n FROM FACT_TRACKS WHERE fact_id = {fact_id:UInt64}"

CONTRATOS_LIST = """
SELECT contrato_id, fact_id_track, sello_id, cuenta_artista_id, productor_id,
       pct_master_sello, pct_master_artista, pct_master_productor,
       pct_publishing_sello, pct_publishing_artista,
       vigente_desde, vigente_hasta, activo
FROM DIM_CONTRATO_REGALIA
ORDER BY creado_en DESC
"""

# Contratos activos cuya vigencia se solapa con [inicio, fin) — se resuelve a
# lo sumo un contrato por track en Python (el de `vigente_desde` más reciente
# entre los solapados), ver router.py::liquidar_periodo.
CONTRATOS_VIGENTES_EN_PERIODO = """
SELECT contrato_id, fact_id_track, sello_id, cuenta_artista_id, productor_id,
       pct_master_sello, pct_master_artista, pct_master_productor,
       pct_publishing_sello, pct_publishing_artista, vigente_desde, vigente_hasta
FROM DIM_CONTRATO_REGALIA
WHERE activo = 1
  AND vigente_desde <= {fin_date:Date}
  AND (vigente_hasta IS NULL OR vigente_hasta >= {inicio_date:Date})
ORDER BY fact_id_track, vigente_desde DESC
"""

CONTRATO_EXISTE = "SELECT count() AS n FROM DIM_CONTRATO_REGALIA WHERE contrato_id = {contrato_id:String}"

# ── Historial de liquidaciones de un contrato (detalle en RegaliasAdminPage) ─
LIQUIDACIONES_POR_CONTRATO = """
SELECT liquidacion_id, periodo_inicio, periodo_fin, tipo_rightsholder, rightsholder_id,
       streams_periodo, monto, moneda, fecha_calculo
FROM FACT_LIQUIDACION_REGALIA
WHERE contrato_id = {contrato_id:String}
ORDER BY periodo_inicio DESC
"""

RESUMEN_CONTRATO = """
SELECT
    coalesce(sum(monto), 0)   AS total_liquidado,
    max(periodo_fin)          AS ultima_liquidacion,
    count()                   AS num_liquidaciones
FROM FACT_LIQUIDACION_REGALIA
WHERE contrato_id = {contrato_id:String}
"""

CUENTA_SELLO_POR_USUARIO = """
SELECT c.cuenta_sello_id, c.usuario_id, c.sello_id, c.activo, c.fecha_creacion, s.nombre AS nombre_sello
FROM DIM_CUENTA_SELLO c
JOIN DIM_SELLO_DISCOGRAFICO s ON s.sello_id = c.sello_id
WHERE c.usuario_id = {usuario_id:String} AND c.activo = 1
LIMIT 1
"""

CUENTA_SELLO_EXISTE_USUARIO = "SELECT count() AS n FROM DIM_CUENTA_SELLO WHERE usuario_id = {usuario_id:String} AND activo = 1"

# ── Streams e ingreso reales del período (fuente para la liquidación) ────────

STREAMS_POR_TRACK_PERIODO = """
SELECT fact_id AS fact_id_track, count() AS streams
FROM FACT_ENGAGEMENT_USUARIO
WHERE event_type = 'reproduccion'
  AND event_timestamp >= {inicio:DateTime} AND event_timestamp < {fin:DateTime}
GROUP BY fact_id
"""

TOTAL_TRANSACCIONES_PERIODO = """
SELECT sum(monto) AS total FROM FACT_TRANSACCION_PAGO
WHERE estado = 'exitosa' AND fecha >= {inicio:DateTime} AND fecha < {fin:DateTime}
"""

TOTAL_INGRESO_PUBLICITARIO_PERIODO = """
SELECT sum(monto) AS total FROM FACT_INGRESO_PUBLICITARIO
WHERE fecha >= {inicio:DateTime} AND fecha < {fin:DateTime}
"""

# ── Ganancias propias (artista / sello) ───────────────────────────────────────

GANANCIAS_ARTISTA = """
SELECT l.liquidacion_id, l.fact_id_track, t.track_name AS track_name,
       l.periodo_inicio, l.periodo_fin, l.streams_periodo, l.monto, l.moneda, l.fecha_calculo
FROM FACT_LIQUIDACION_REGALIA l
JOIN FACT_TRACKS t ON t.fact_id = l.fact_id_track
WHERE l.tipo_rightsholder = 'artista' AND l.rightsholder_id = {rightsholder_id:String}
ORDER BY l.periodo_inicio DESC
"""

GANANCIAS_SELLO = """
SELECT l.liquidacion_id, l.fact_id_track, t.track_name AS track_name,
       l.periodo_inicio, l.periodo_fin, l.streams_periodo, l.monto, l.moneda, l.fecha_calculo
FROM FACT_LIQUIDACION_REGALIA l
JOIN FACT_TRACKS t ON t.fact_id = l.fact_id_track
WHERE l.tipo_rightsholder = 'sello' AND l.rightsholder_id = {rightsholder_id:String}
ORDER BY l.periodo_inicio DESC
"""

# ── Idempotencia de liquidación (modelo-financiero-simulacion) ───────────────
# Un rango de fechas exacto ya liquidado no debe volver a generar filas —
# ver design.md, Decisión 4.
LIQUIDACION_YA_EXISTE_PERIODO = """
SELECT count() AS n FROM FACT_LIQUIDACION_REGALIA
WHERE periodo_inicio = {inicio:Date} AND periodo_fin = {fin:Date}
"""

# ── Retiro de ganancias (modelo-financiero-simulacion) ────────────────────────
# El saldo disponible se calcula en el momento, nunca se persiste (ver
# design.md, Decisión 5) — resta 'pendiente' y 'procesado' (no solo
# 'procesado') para que un retiro pendiente no pueda solicitarse dos veces.
SALDO_DISPONIBLE_RIGHTSHOLDER = """
SELECT
    (SELECT coalesce(sum(monto), 0) FROM FACT_LIQUIDACION_REGALIA
     WHERE tipo_rightsholder = {tipo:String} AND rightsholder_id = {rightsholder_id:String})
    -
    (SELECT coalesce(sum(monto), 0) FROM FACT_RETIRO_REGALIA
     WHERE tipo_rightsholder = {tipo:String} AND rightsholder_id = {rightsholder_id:String}
       AND estado IN ('pendiente', 'procesado'))
    AS saldo_disponible
"""

RETIROS_POR_RIGHTSHOLDER = """
SELECT retiro_id, tipo_rightsholder, rightsholder_id, monto, estado, fecha_solicitud, fecha_procesado
FROM FACT_RETIRO_REGALIA
WHERE tipo_rightsholder = {tipo:String} AND rightsholder_id = {rightsholder_id:String}
ORDER BY fecha_solicitud DESC
"""

def retiros_admin_sql(where: str) -> str:
    return f"""
    SELECT retiro_id, tipo_rightsholder, rightsholder_id, monto, estado, fecha_solicitud, fecha_procesado
    FROM FACT_RETIRO_REGALIA
    {where}
    ORDER BY fecha_solicitud DESC
    """

RETIRO_POR_ID = "SELECT * FROM FACT_RETIRO_REGALIA WHERE retiro_id = {retiro_id:String} LIMIT 1"
