# Precios de plan configurables (modelo-financiero-completar-huecos, CU-O98)
# — desacoplado a propósito de `_TIER_RANK` (analitica/deps.py): esta tabla
# solo tiene precio, nunca nivel de acceso (ver design.md, decisión 5).
PLAN_PRECIO_ACTUAL = """
SELECT precio_usd FROM DIM_PLAN FINAL WHERE plan_id = {plan_id:String} AND activo = 1 LIMIT 1
"""

PLANES_PRECIOS_TODOS = """
SELECT plan_id, precio_usd, activo, actualizado_en FROM DIM_PLAN FINAL ORDER BY plan_id
"""
