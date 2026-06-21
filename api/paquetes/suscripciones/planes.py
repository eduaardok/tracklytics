PLANES_B2C = [
    {"id": "free",    "tipo_actor": "b2c", "nombre": "Free",
     "precio": 0.0,  "moneda": "USD",
     "descripcion": "Acceso al catálogo y biblioteca personal con funciones básicas."},
    {"id": "premium", "tipo_actor": "b2c", "nombre": "Premium",
     "precio": 9.99, "moneda": "USD",
     "descripcion": "Acceso a funciones extendidas del catálogo sin restricciones."},
]

PLANES_B2B = [
    {"id": "basico",     "tipo_actor": "b2b", "nombre": "Básico",
     "precio": 199.0,  "moneda": "USD",
     "descripcion": "Acceso a paneles analíticos esenciales del catálogo."},
    {"id": "pro",        "tipo_actor": "b2b", "nombre": "Pro",
     "precio": 499.0,  "moneda": "USD",
     "descripcion": "Acceso a paneles analíticos avanzados y comparativas de artistas."},
    {"id": "enterprise", "tipo_actor": "b2b", "nombre": "Enterprise",
     "precio": 1499.0, "moneda": "USD",
     "descripcion": "Acceso completo a la inteligencia de negocio, incluyendo reporte diario operativo."},
]

PLANES: dict[str, dict] = {p["id"]: p for p in PLANES_B2C + PLANES_B2B}


def planes_para_rol(role: str) -> list[dict]:
    return PLANES_B2B if role == "analyst" else PLANES_B2C


def plan_valido_para_rol(plan_id: str, role: str) -> bool:
    plan = PLANES.get(plan_id)
    if not plan:
        return False
    tipo_esperado = "b2b" if role == "analyst" else "b2c"
    return plan["tipo_actor"] == tipo_esperado
