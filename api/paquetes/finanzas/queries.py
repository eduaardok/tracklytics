"""Queries de `finanzas` — ver design.md del change
mejoras-financieras-empresariales. Punto único de verdad para gastos activos
y reembolsos procesados (design.md, Riesgo "Reembolsos y gastos anulados
deben excluirse consistentemente"): dashboard, indicadores y reporte
reutilizan las mismas queries de este archivo, nunca reimplementan el
filtro de estado."""

# ─────────────────────────────────────────────────────────────────────────────
# Gastos operativos (CU-O82)
# ─────────────────────────────────────────────────────────────────────────────

GASTO_POR_ID = "SELECT * FROM FACT_GASTO_OPERATIVO WHERE gasto_id = {gasto_id:String} LIMIT 1"


# Fix S17 (auditoría de navegación/UX, sección 3.2): sin `LIMIT` — traía el
# histórico completo de gastos operativos en una sola respuesta. Se agrega un
# tope de seguridad (1000, generoso frente al rango de fecha por defecto de
# 30 días que ahora aplica `GastosTab.tsx`, mismo patrón que ya usaba
# `ReembolsosTab` vecina) — no pagina con `page`/`offset` como
# `usuarios_reporte_sql`, porque el filtro de rango de fecha ya acota el
# volumen real a un tamaño manejable en el uso normal.
def gastos_list_sql(where: str) -> str:
    return f"""
    SELECT gasto_id, concepto, categoria, monto, fecha, descripcion, estado,
           responsable_id, fecha_registro
    FROM FACT_GASTO_OPERATIVO
    {where}
    ORDER BY fecha DESC
    LIMIT 1000
    """


# Punto único de verdad: gasto activo en un rango de fecha — reusado por
# dashboard (4), indicadores (7), alertas (8) y reporte (9). `fecha` es
# Date (no DateTime) en FACT_GASTO_OPERATIVO, ver init_clickhouse.py.
GASTOS_ACTIVOS_EN_RANGO = """
SELECT coalesce(sum(monto), 0) AS total
FROM FACT_GASTO_OPERATIVO
WHERE estado = 'activo' AND fecha >= {desde:Date} AND fecha < {hasta:Date}
"""

GASTOS_POR_CATEGORIA_EN_RANGO = """
SELECT categoria AS categoria, coalesce(sum(monto), 0) AS total
FROM FACT_GASTO_OPERATIVO
WHERE estado = 'activo' AND fecha >= {desde:Date} AND fecha < {hasta:Date}
GROUP BY categoria
ORDER BY total DESC
"""


# ─────────────────────────────────────────────────────────────────────────────
# Reembolsos (CU-O85/CU-O86)
# ─────────────────────────────────────────────────────────────────────────────

TRANSACCION_POR_ID = "SELECT * FROM FACT_TRANSACCION_PAGO WHERE transaccion_id = {transaccion_id:UUID} LIMIT 1"

# Análogo a SALDO_DISPONIBLE_RIGHTSHOLDER de `regalias` (design.md, Decisión
# 3 / tasks.md 3.1): monto disponible a reembolsar = monto pagado - suma de
# reembolsos ya `procesado` sobre esa misma transacción. Calculado on-read,
# nunca persistido.
MONTO_REEMBOLSADO_PROCESADO = """
SELECT coalesce(sum(monto), 0) AS total
FROM FACT_REEMBOLSO
WHERE transaccion_id = {transaccion_id:UUID} AND estado = 'procesado'
"""

REEMBOLSO_POR_ID = "SELECT * FROM FACT_REEMBOLSO WHERE reembolso_id = {reembolso_id:String} LIMIT 1"

REEMBOLSOS_POR_TRANSACCION = """
SELECT reembolso_id, transaccion_id, monto, tipo, motivo, fecha, responsable_id, estado
FROM FACT_REEMBOLSO
WHERE transaccion_id = {transaccion_id:UUID}
ORDER BY fecha DESC
"""

REEMBOLSOS_EN_RANGO = """
SELECT reembolso_id, transaccion_id, monto, tipo, motivo, fecha, responsable_id, estado
FROM FACT_REEMBOLSO
WHERE fecha >= {desde:DateTime} AND fecha < {hasta:DateTime}
ORDER BY fecha DESC
"""

# Punto único de verdad: reembolso procesado en un rango — reusado por
# dashboard/indicadores/alertas/reporte (tasks.md 3.5).
REEMBOLSOS_PROCESADOS_EN_RANGO = """
SELECT coalesce(sum(monto), 0) AS total
FROM FACT_REEMBOLSO
WHERE estado = 'procesado' AND fecha >= {desde:DateTime} AND fecha < {hasta:DateTime}
"""

# Reembolsos procesados individuales sobre el umbral configurable (alertas,
# tasks.md 8.2) — se filtra en Python contra REEMBOLSO_MONTO_ALTO_USD para no
# hardcodear el umbral dos veces (SQL y Python).
REEMBOLSOS_PROCESADOS_EN_RANGO_DETALLE = """
SELECT reembolso_id, transaccion_id, monto, motivo, fecha
FROM FACT_REEMBOLSO
WHERE estado = 'procesado' AND fecha >= {desde:DateTime} AND fecha < {hasta:DateTime}
ORDER BY monto DESC
"""


# ─────────────────────────────────────────────────────────────────────────────
# Cuentas por cobrar y por pagar (CU-O84)
# ─────────────────────────────────────────────────────────────────────────────

# FACT_INVOICE.estado hoy solo toma el valor 'emitido' (ver facturacion/
# router.py::procesar_pago y simulacion/generador.py — nunca se escribe
# 'pagada'/'vencida' en el código actual, pese a que spec.md las mencione
# como estados posibles). "vencida" se deriva por aging (>30 días desde
# fecha_emision, mismo umbral que DIAS_REGALIAS_PENDIENTES) en vez de
# depender de un estado que ningún flujo actual asigna — ver nota de diseño
# en el resumen final.
#
# `estado != 'pagada'` matchea HOY el 100% de FACT_INVOICE (30k+ filas y
# creciendo con cada corrida de backfill, ninguna fila tiene otro estado) —
# la versión anterior de esto (`INVOICES_PENDIENTES_AGING`, sin WHERE de
# rango ni LIMIT) traía esas filas completas a Python para sumar/contar/
# ordenar ahí, dos veces por cada click en "Exportar" (una vez para el
# resumen, otra para "próximos vencimientos") — el mismo anti-patrón de
# agregar en Python en vez de en SQL que ya se encontró en catálogo (S13-P7)
# y biblioteca (incidente de favoritos de 178s). Con 30k+ filas esto ya era
# perceptiblemente lento; solo crece. Reemplazado por dos queries: el
# resumen (sumas/conteos) agregado en ClickHouse, y el top-10 de
# vencimientos con su propio LIMIT — nunca se necesitó la lista completa en
# memoria, solo el total y una vista previa acotada.
CUENTAS_POR_COBRAR_RESUMEN = """
SELECT
    sum(monto + iva) AS total_por_cobrar,
    sumIf(monto + iva, dateDiff('day', fecha_emision, now()) > {dias:UInt32}) AS total_vencido,
    count() AS num_pendientes,
    countIf(dateDiff('day', fecha_emision, now()) > {dias:UInt32}) AS num_vencidas
FROM FACT_INVOICE
WHERE estado != 'pagada'
"""

# "Próximos a vencer" (aún no vencidos, los que están más cerca del umbral) —
# mismo criterio que antes (más antiguos primero dentro de los no vencidos),
# ahora con LIMIT en SQL en vez de traer todo y cortar en Python.
PROXIMOS_VENCIMIENTOS_INVOICE = """
SELECT invoice_id, usuario_id, monto, iva, fecha_emision, estado,
       dateDiff('day', fecha_emision, now()) AS dias_desde_emision
FROM FACT_INVOICE
WHERE estado != 'pagada' AND dateDiff('day', fecha_emision, now()) <= {dias:UInt32}
ORDER BY dias_desde_emision DESC
LIMIT 10
"""

# Conteo de facturas vencidas para la alerta agregada ("N facturas vencidas",
# una sola alerta) — antes se generaba una alerta POR CADA factura vencida
# (30k+ filas, la gran mayoría vencidas), inflando la respuesta de /alertas
# a un tamaño que congelaba el render en el navegador. Mismo patrón que la
# alerta de "suscripciones_cobro_pendiente" (arriba en router.py), que ya
# reporta un conteo agregado en vez de una fila por suscripción.
FACTURAS_VENCIDAS_COUNT = """
SELECT count() AS n
FROM FACT_INVOICE
WHERE estado != 'pagada' AND dateDiff('day', fecha_emision, now()) > {dias:UInt32}
"""

RETIROS_PENDIENTES = """
SELECT retiro_id, tipo_rightsholder, rightsholder_id, monto, fecha_solicitud
FROM FACT_RETIRO_REGALIA
WHERE estado = 'pendiente'
ORDER BY fecha_solicitud ASC
"""

# Retiros de regalía ya procesados en un rango (dashboard, tasks.md 4.3) —
# `fecha_procesado` (no `fecha_solicitud`) porque lo que se reconoce en el
# dashboard es el desembolso efectivo dentro del periodo.
RETIROS_PROCESADOS_EN_RANGO = """
SELECT coalesce(sum(monto), 0) AS total
FROM FACT_RETIRO_REGALIA
WHERE estado = 'procesado' AND fecha_procesado >= {desde:DateTime} AND fecha_procesado < {hasta:DateTime}
"""

# Agregado global (todos los rightsholders) del mismo formulario que
# SALDO_DISPONIBLE_RIGHTSHOLDER de `regalias` (design.md, Decisión 3) — se
# reutiliza la misma fórmula (liquidado - retirado[pendiente+procesado]),
# sin el filtro por rightsholder porque aquí se necesita el total de la
# plataforma, no el saldo de un rightsholder puntual.
SALDO_REGALIAS_NO_RETIRADO_TOTAL = """
SELECT
    (SELECT coalesce(sum(monto), 0) FROM FACT_LIQUIDACION_REGALIA)
    -
    (SELECT coalesce(sum(monto), 0) FROM FACT_RETIRO_REGALIA WHERE estado IN ('pendiente', 'procesado'))
    AS saldo_no_retirado
"""

# Regalías liquidadas cuyo rightsholder no ha solicitado retiro hace más de
# N días (alertas, tasks.md 8.2) — un rightsholder con liquidación más
# antigua que el umbral y saldo aún disponible.
REGALIAS_LIQUIDADAS_ANTIGUAS_POR_RIGHTSHOLDER = """
SELECT tipo_rightsholder, rightsholder_id, min(fecha_calculo) AS liquidacion_mas_antigua
FROM FACT_LIQUIDACION_REGALIA
GROUP BY tipo_rightsholder, rightsholder_id
HAVING liquidacion_mas_antigua < now() - INTERVAL {dias:UInt16} DAY
"""


# ─────────────────────────────────────────────────────────────────────────────
# Consumo de presupuesto de campañas (CU-O87)
# ─────────────────────────────────────────────────────────────────────────────

def consumo_presupuesto_campana_sql(where: str) -> str:
    return f"""
    SELECT
        c.campana_id        AS campana_id,
        c.nombre             AS nombre,
        c.anunciante_id      AS anunciante_id,
        c.cpm                AS cpm,
        c.presupuesto_total  AS presupuesto_total,
        c.activa              AS activa,
        coalesce(sum(i.monto), 0)  AS consumido,
        count(i.ingreso_id)        AS impresiones
    FROM DIM_CAMPANA_PUBLICITARIA c
    LEFT JOIN FACT_INGRESO_PUBLICITARIO i ON i.campana_id = c.campana_id
    {where}
    GROUP BY c.campana_id, c.nombre, c.anunciante_id, c.cpm, c.presupuesto_total, c.activa
    ORDER BY c.campana_id
    """


# Ritmo de consumo reciente (últimos N días) de una campaña — usado para
# proyectar linealmente la fecha estimada de agotamiento del presupuesto.
CONSUMO_RECIENTE_CAMPANA = """
SELECT coalesce(sum(monto), 0) AS total
FROM FACT_INGRESO_PUBLICITARIO
WHERE campana_id = {campana_id:UInt32} AND fecha >= now() - INTERVAL {dias:UInt16} DAY
"""

CAMPANA_ACTIVA_POR_ID = "SELECT campana_id, activa FROM DIM_CAMPANA_PUBLICITARIA WHERE campana_id = {campana_id:UInt32} LIMIT 1"


# ─────────────────────────────────────────────────────────────────────────────
# Indicadores empresariales (CU-O88)
# ─────────────────────────────────────────────────────────────────────────────

# Ingreso publicitario por anunciante en un rango — join necesario porque
# FACT_INGRESO_PUBLICITARIO solo tiene campana_id, no anunciante_id
# directamente (design.md, "Ingreso promedio por anunciante").
INGRESO_POR_ANUNCIANTE_EN_RANGO = """
SELECT c.anunciante_id AS anunciante_id, sum(i.monto) AS total
FROM FACT_INGRESO_PUBLICITARIO i
JOIN DIM_CAMPANA_PUBLICITARIA c ON c.campana_id = i.campana_id
WHERE i.fecha >= {desde:DateTime} AND i.fecha < {hasta:DateTime}
GROUP BY c.anunciante_id
"""
