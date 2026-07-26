# Fallback defensivo si DIM_EMPRESA no tuviera fila (nunca debería pasar,
# se siembra en init_clickhouse.py) — la tasa efectiva real ahora se resuelve
# en runtime (`iva_tasa_global`/override por país, ver design.md decisión 6,
# modelo-financiero-completar-huecos). Se conserva el nombre por
# compatibilidad de import, no se usa directamente en el cálculo.
IVA_RATE = 0.15

# Tasa de éxito por defecto de la simulación de pago (design.md, "Simulación
# de resultado de transacción") — detalle técnico, nunca expuesto como
# concepto de negocio en spec.md.
TASA_EXITO_DEFAULT = 0.9

METODOS_PAGO_POR_USUARIO = """
SELECT metodo_pago_id, tipo, ultimos_4_digitos, pais,
       nombre_titular, direccion, ciudad, codigo_postal, creado_en
FROM DIM_METODO_PAGO
WHERE usuario_id = {usuario_id:String}
ORDER BY creado_en DESC
"""

METODO_PAGO_EXISTE = """
SELECT metodo_pago_id FROM DIM_METODO_PAGO
WHERE usuario_id = {usuario_id:String} AND metodo_pago_id = {metodo_pago_id:String}
LIMIT 1
"""

TRANSACCIONES_POR_USUARIO = """
SELECT transaccion_id, usuario_id, metodo_pago_id, suscripcion_id, monto, moneda, estado, fecha
FROM FACT_TRANSACCION_PAGO
WHERE usuario_id = {usuario_id:String}
ORDER BY fecha DESC
"""

# Panel admin (S12): últimas transacciones GLOBALES, sin buscar un usuario —
# `AuditoriaFacturacionPage` antes solo mostraba contenido tras una búsqueda.
# `metodo_pago` sale de DIM_METODO_PAGO.tipo (no existe columna de texto en
# FACT_TRANSACCION_PAGO, solo `metodo_pago_id` UUID — mismo JOIN que ya usa
# INVOICE_DETALLE para `metodo_tipo`). LEFT JOIN plano sobre DIM_USUARIO
# (ReplacingMergeTree), mismo criterio ya usado por auditoría/errores de
# sistema en `seguridad.queries` para nombre/email de display.
TRANSACCIONES_RECIENTES = """
SELECT
    t.transaccion_id AS transaccion_id,
    t.usuario_id      AS usuario_id,
    u.nombre           AS usuario_nombre,
    u.email            AS usuario_email,
    t.monto            AS monto,
    t.moneda           AS moneda,
    t.estado           AS estado,
    m.tipo             AS metodo_pago,
    t.fecha            AS fecha
FROM FACT_TRANSACCION_PAGO t
LEFT JOIN DIM_USUARIO u      ON u.usuario_id = t.usuario_id
LEFT JOIN DIM_METODO_PAGO m  ON m.metodo_pago_id = t.metodo_pago_id
ORDER BY t.fecha DESC
LIMIT 20
"""

EMPRESA_ACTUAL = (
    "SELECT razon_social, ruc, direccion, iva_tasa_global, retencion_fiscal_pct_global "
    "FROM DIM_EMPRESA WHERE empresa_id = 1 LIMIT 1"
)

INVOICES_POR_USUARIO = """
SELECT i.invoice_id AS invoice_id, i.usuario_id AS usuario_id, i.transaccion_id AS transaccion_id,
       i.monto AS monto, i.iva AS iva, i.fecha_emision AS fecha_emision, i.estado AS estado,
       t.moneda AS moneda
FROM FACT_INVOICE i
LEFT JOIN FACT_TRANSACCION_PAGO t ON t.transaccion_id = i.transaccion_id
WHERE i.usuario_id = {usuario_id:String}
ORDER BY i.fecha_emision DESC
"""

# Detalle de una invoice para la vista imprimible (CU-O21/O22, factura
# profesional) — cruza usuario y método de pago (ambos en ClickHouse); el
# nombre del plan se resuelve en Python vía PLANES (monto es único por plan,
# ver paquetes/suscripciones/planes.py) porque la suscripción vive en
# PocketBase, no en ClickHouse.
INVOICE_DETALLE = """
SELECT
    i.invoice_id AS invoice_id, i.usuario_id AS usuario_id, i.transaccion_id AS transaccion_id,
    i.monto AS monto, i.iva AS iva, i.fecha_emision AS fecha_emision, i.estado AS estado,
    u.nombre AS usuario_nombre, u.email AS usuario_email,
    t.metodo_pago_id AS metodo_pago_id, t.moneda AS moneda, t.suscripcion_id AS suscripcion_id,
    m.tipo AS metodo_tipo, m.ultimos_4_digitos AS metodo_ultimos_4,
    m.nombre_titular AS metodo_nombre_titular, m.pais AS metodo_pais
FROM FACT_INVOICE i
LEFT JOIN DIM_USUARIO u          ON u.usuario_id = i.usuario_id
LEFT JOIN FACT_TRANSACCION_PAGO t ON t.transaccion_id = i.transaccion_id
LEFT JOIN DIM_METODO_PAGO m       ON m.metodo_pago_id = t.metodo_pago_id
WHERE i.invoice_id = {invoice_id:String}
LIMIT 1
"""

# Dashboard (RT-04, S10 Día 3): ingreso real por día, últimos 14 días — no un
# valor simulado, agrega FACT_TRANSACCION_PAGO ya escrita por pagos/renovaciones
# reales (incluida la renovación automática del DAG finanzas_periodicas).
INGRESO_POR_DIA = """
SELECT toDate(fecha) AS dia, sum(monto) AS total
FROM FACT_TRANSACCION_PAGO
WHERE estado = 'exitosa' AND fecha >= now() - INTERVAL 14 DAY
GROUP BY dia
ORDER BY dia
"""

TRANSACCIONES_ULTIMAS_24H = "SELECT count() AS n FROM FACT_TRANSACCION_PAGO WHERE fecha >= now() - INTERVAL 24 HOUR"

INGRESO_TOTAL_HISTORICO = "SELECT sum(monto) AS total FROM FACT_TRANSACCION_PAGO WHERE estado = 'exitosa'"

# ── IVA configurable / conversión de moneda (modelo-financiero-completar-
# huecos, CU-O99) — país del usuario ya declarado al registrarse, reusado
# para resolver IVA/moneda sin pedir un dato nuevo (design.md, decisión 7).
USUARIO_PAIS = "SELECT pais FROM DIM_USUARIO WHERE usuario_id = {usuario_id:String} LIMIT 1"

# ── Notificaciones simuladas de factura enviada por correo (CU-O99) ─────────
NOTIFICACIONES_EMAIL_POR_USUARIO = """
SELECT notificacion_id, tipo, referencia_id, destinatario, asunto, cuerpo, estado, fecha_envio
FROM FACT_EMAIL_ENVIADO
WHERE usuario_id = {usuario_id:String}
ORDER BY fecha_envio DESC
"""
