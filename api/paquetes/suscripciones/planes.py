import os

PLANES_B2C = [
    {"id": "free",    "tipo_actor": "b2c", "nombre": "Free",
     "precio": 0.0,  "moneda": "USD",
     "descripcion": "Acceso al catálogo y biblioteca personal con funciones básicas."},
    {"id": "premium", "tipo_actor": "b2c", "nombre": "Premium",
     "precio": 9.99, "moneda": "USD",
     "descripcion": "Acceso a funciones extendidas del catálogo sin restricciones."},
    # Plan estudiante (monetizacion-retencion-mejoras): mismo alcance que
    # premium, precio menor, requiere email institucional válido en el flujo
    # de selección (ver router.py, ConfirmarSuscripcion.email_institucional).
    {"id": "estudiante", "tipo_actor": "b2c", "nombre": "Estudiante",
     "precio": 4.99, "moneda": "USD",
     "descripcion": "Acceso a funciones extendidas del catálogo con tarifa preferencial para estudiantes."},
]

# Dominio institucional válido para el plan estudiante — configurable vía
# variable de entorno, sin cambiar código para un despliegue con otro dominio.
DOMINIO_INSTITUCIONAL_VALIDO = os.getenv("DOMINIO_INSTITUCIONAL_VALIDO", ".edu")


def email_institucional_valido(email: str) -> bool:
    return DOMINIO_INSTITUCIONAL_VALIDO.lower() in email.strip().lower()

# `features` (b2b-tier-access-analitica): catálogo de producto expuesto tal
# cual por GET /suscripciones/planes — cada tier lista lo suyo + lo heredado
# del tier anterior, para que PlanesPage.tsx muestre la escalera completa sin
# que el cliente tenga que inferir qué "incluye lo de Básico" implica.
PLANES_B2B = [
    {"id": "basico",     "tipo_actor": "b2b", "nombre": "Básico",
     "precio": 199.0,  "moneda": "USD",
     "descripcion": "Acceso a paneles analíticos esenciales del catálogo.",
     "features": [
         "Dashboard ejecutivo de KPIs del catálogo",
         "Perfil de audio por género",
         "Tendencias temporales por semana",
         "Disponibilidad de infraestructura",
         "Engagement de un track o artista",
     ]},
    {"id": "pro",        "tipo_actor": "b2b", "nombre": "Pro",
     "precio": 499.0,  "moneda": "USD",
     "descripcion": "Acceso a paneles analíticos avanzados y comparativas de artistas.",
     "features": [
         "Todo lo de Básico",
         "Comparar artistas (A vs. B)",
         "Benchmark de artista vs. género",
         "Índice de desempeño relativo (Mercado vs. Tracklytics)",
         "Adquisición de usuarios por canal",
     ]},
    {"id": "enterprise", "tipo_actor": "b2b", "nombre": "Enterprise",
     "precio": 1499.0, "moneda": "USD",
     "descripcion": "Acceso completo a la inteligencia de negocio, incluyendo paneles predictivos exclusivos.",
     "features": [
         "Todo lo de Pro",
         "Proyección de tendencia de género",
         "Proyección de trayectoria de artista vs. género",
         "Alertas tempranas de tendencia a la baja",
     ]},
]

PLANES: dict[str, dict] = {p["id"]: p for p in PLANES_B2C + PLANES_B2B}


def planes_para_rol(role: str) -> list[dict]:
    # admin (Lead Data Engineer/CTO) ya tiene acceso completo a la plataforma
    # sin pagar — no le corresponde ningún plan, ni B2C ni B2B.
    if role == "admin":
        return []
    return PLANES_B2B if role == "analyst" else PLANES_B2C


def plan_valido_para_rol(plan_id: str, role: str) -> bool:
    if role == "admin":
        return False
    plan = PLANES.get(plan_id)
    if not plan:
        return False
    tipo_esperado = "b2b" if role == "analyst" else "b2c"
    return plan["tipo_actor"] == tipo_esperado
