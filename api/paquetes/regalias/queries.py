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
