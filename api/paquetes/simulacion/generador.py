"""Generadores de actividad de negocio simulada (CU-O78) — ver design.md del
change `modelo-financiero-simulacion`, Decisiones 1 y 2: los tres generadores
escriben directo a ClickHouse (mismo patrón que `etl/engagement/generator.py`
y `etl/gold/facturacion_recurrente.py`), todos en la misma ventana de tiempo
reciente, con `usuario_id` sintético (`sim_user_XXXX`) — sin crear cuentas
reales de PocketBase."""

import random
import uuid
from datetime import datetime, timedelta

from core.database import get_client, query_rows
from paquetes.facturacion.queries import IVA_RATE, TASA_EXITO_DEFAULT
from paquetes.publicidad.queries import CAMPANAS_ELEGIBLES_POR_TIPO
from paquetes.simulacion.queries import TRACKS_PARA_PONDERAR
from paquetes.suscripciones.planes import PLANES

N_USUARIOS_SIM = 200
VENTANA_SEGUNDOS = 3600  # actividad distribuida en la última hora


def _usuario_sim() -> str:
    return f"sim_user_{random.randint(0, N_USUARIOS_SIM - 1):04d}"


def _timestamp_reciente(ahora: datetime) -> datetime:
    return ahora - timedelta(seconds=random.randint(0, VENTANA_SEGUNDOS))


def generar_reproducciones(n: int, ahora: datetime) -> int:
    """Reproducciones ponderadas por popularidad, mismo criterio que
    `engagement_referencia` — `source='referencia'` (el Enum8 de
    FACT_ENGAGEMENT_USUARIO solo admite 'app'/'referencia'; `is_synthetic` +
    el prefijo `sim_user_` ya distinguen esta actividad sin necesitar un
    tercer valor de enum)."""
    if n <= 0:
        return 0
    tracks = query_rows(TRACKS_PARA_PONDERAR)
    if not tracks:
        return 0

    fact_ids = [t["fact_id"] for t in tracks]
    pesos = [t["popularity"] + 1 for t in tracks]
    elegidos = random.choices(fact_ids, weights=pesos, k=n)

    filas = [
        (str(uuid.uuid4()), _usuario_sim(), fact_id, "reproduccion", _timestamp_reciente(ahora), True, "referencia")
        for fact_id in elegidos
    ]
    get_client().insert(
        "FACT_ENGAGEMENT_USUARIO", filas,
        column_names=["engagement_id", "user_id", "fact_id", "event_type", "event_timestamp", "is_synthetic", "source"],
    )
    return len(filas)


def generar_suscripciones(n: int, ahora: datetime) -> float:
    """N transacciones de suscripción exitosas, mezcla realista entre los
    planes de pago existentes (B2C y B2B) — inserta directo en
    FACT_TRANSACCION_PAGO/FACT_INVOICE, sin crear la suscripción en
    PocketBase (ver design.md, Decisión 2: el pool de liquidación solo lee
    ClickHouse). Misma tasa de éxito/IVA que `facturacion`."""
    if n <= 0:
        return 0.0
    planes_pago = [p for p in PLANES.values() if p["precio"] > 0]
    if not planes_pago:
        return 0.0

    transacciones = []
    invoices = []
    ingreso_total = 0.0
    for _ in range(n):
        plan = random.choice(planes_pago)
        exitosa = random.random() < TASA_EXITO_DEFAULT
        estado = "exitosa" if exitosa else "fallida"
        usuario_id = _usuario_sim()
        transaccion_id = str(uuid.uuid4())
        fecha = _timestamp_reciente(ahora)
        transacciones.append((
            transaccion_id, usuario_id, str(uuid.uuid4()), str(uuid.uuid4()),
            plan["precio"], plan["moneda"], estado, fecha,
        ))
        if exitosa:
            iva = round(plan["precio"] * IVA_RATE, 2)
            invoices.append((str(uuid.uuid4()), usuario_id, transaccion_id, plan["precio"], iva, "emitido"))
            ingreso_total += plan["precio"]

    get_client().insert(
        "FACT_TRANSACCION_PAGO", transacciones,
        column_names=["transaccion_id", "usuario_id", "metodo_pago_id", "suscripcion_id", "monto", "moneda", "estado", "fecha"],
    )
    if invoices:
        get_client().insert(
            "FACT_INVOICE", invoices,
            column_names=["invoice_id", "usuario_id", "transaccion_id", "monto", "iva", "estado"],
        )
    return round(ingreso_total, 2)


def generar_impresiones_publicitarias(n: int, ahora: datetime) -> float:
    """N impresiones publicitarias completadas (audio y/o display), sobre
    campañas activas y vigentes ya existentes. Sin campañas elegibles, no
    genera nada (RF: "omite sin error")."""
    if n <= 0:
        return 0.0
    elegibles = query_rows(CAMPANAS_ELEGIBLES_POR_TIPO, {"tipo": "audio"}) + query_rows(CAMPANAS_ELEGIBLES_POR_TIPO, {"tipo": "display"})
    if not elegibles:
        return 0.0

    impresiones = []
    ingresos = []
    ingreso_total = 0.0
    for _ in range(n):
        campana = random.choice(elegibles)
        impresion_id = str(uuid.uuid4())
        fecha = _timestamp_reciente(ahora)
        impresiones.append((impresion_id, campana["campana_id"], _usuario_sim(), 1, fecha))
        monto = round(float(campana["cpm"]) / 1000, 4)
        ingresos.append((str(uuid.uuid4()), impresion_id, campana["campana_id"], monto, fecha))
        ingreso_total += monto

    get_client().insert(
        "FACT_IMPRESION_ANUNCIO", impresiones,
        column_names=["impresion_id", "campana_id", "usuario_id", "completado", "fecha"],
    )
    get_client().insert(
        "FACT_INGRESO_PUBLICITARIO", ingresos,
        column_names=["ingreso_id", "impresion_id", "campana_id", "monto", "fecha"],
    )
    return round(ingreso_total, 2)
