# Tasa fija de IVA (design.md, decisión "Cálculo de IVA con tasa fija") — no
# varía por país pese a que DIM_METODO_PAGO capture país (dato descriptivo,
# no usado para tarificar en este cambio).
IVA_RATE = 0.15

# Tasa de éxito por defecto de la simulación de pago (design.md, "Simulación
# de resultado de transacción") — detalle técnico, nunca expuesto como
# concepto de negocio en spec.md.
TASA_EXITO_DEFAULT = 0.9

METODOS_PAGO_POR_USUARIO = """
SELECT metodo_pago_id, tipo, ultimos_4_digitos, pais, creado_en
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

INVOICES_POR_USUARIO = """
SELECT invoice_id, usuario_id, transaccion_id, monto, iva, fecha_emision, estado
FROM FACT_INVOICE
WHERE usuario_id = {usuario_id:String}
ORDER BY fecha_emision DESC
"""
