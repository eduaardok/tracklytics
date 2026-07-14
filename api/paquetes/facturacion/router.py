import random
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from core.database import execute, get_client, query_one, query_rows
from core.deps import get_current_user
from paquetes.facturacion.deps import require_admin, require_suscripcion_activa
from paquetes.suscripciones import pb_client
from paquetes.facturacion.queries import (
    IVA_RATE,
    EMPRESA_ACTUAL,
    INGRESO_POR_DIA,
    INGRESO_TOTAL_HISTORICO,
    INVOICE_DETALLE,
    INVOICES_POR_USUARIO,
    METODO_PAGO_EXISTE,
    METODOS_PAGO_POR_USUARIO,
    TASA_EXITO_DEFAULT,
    TRANSACCIONES_POR_USUARIO,
    TRANSACCIONES_ULTIMAS_24H,
)
from paquetes.seguridad import audit
from paquetes.suscripciones.planes import PLANES

router = APIRouter(prefix="/app/v1/facturacion", tags=["Facturacion"])


def metodo_pago_existe(usuario_id: str, metodo_pago_id: str) -> bool:
    """`metodo_pago_id` es UUID en ClickHouse — un string con formato
    inválido rompe la query con un 500 en vez de un 404 limpio si no se
    valida antes (ver auditoría 2026-07-09)."""
    try:
        uuid.UUID(metodo_pago_id)
    except (ValueError, AttributeError, TypeError):
        return False
    return bool(query_one(METODO_PAGO_EXISTE, {"usuario_id": usuario_id, "metodo_pago_id": metodo_pago_id}))


# ─────────────────────────────────────────────────────────────────────────────
# 1. Registro de método de pago (CU-O20)
# ─────────────────────────────────────────────────────────────────────────────

class MetodoPagoBody(BaseModel):
    tipo: str
    ultimos_4_digitos: str
    pais: str = ""


@router.post("/metodos-pago", status_code=201)
def registrar_metodo_pago(body: MetodoPagoBody, user: dict = Depends(get_current_user)):
    usuario_id = user["record"]["id"]
    metodo_pago_id = str(uuid.uuid4())

    get_client().insert(
        "DIM_METODO_PAGO",
        [(metodo_pago_id, usuario_id, body.tipo, body.ultimos_4_digitos, body.pais)],
        column_names=["metodo_pago_id", "usuario_id", "tipo", "ultimos_4_digitos", "pais"],
    )
    audit.record(
        usuario_id=usuario_id,
        accion="registro_metodo_pago",
        tabla_afectada="DIM_METODO_PAGO",
        antes=None,
        despues={"tipo": body.tipo, "ultimos_4_digitos": body.ultimos_4_digitos, "pais": body.pais},
    )
    return {"status": "ok", "metodo_pago_id": metodo_pago_id}


@router.get("/metodos-pago")
async def listar_metodos_pago(user: dict = Depends(get_current_user)):
    usuario_id = user["record"]["id"]
    methods = query_rows(METODOS_PAGO_POR_USUARIO, {"usuario_id": usuario_id})
    activas = await pb_client.list_activas(user["token"], usuario_id)
    suscripcion = (
        {"tipo_plan": activas[0]["tipo_plan"], "monto": activas[0]["monto"], "moneda": activas[0]["moneda"]}
        if activas else None
    )
    return {"data": methods, "suscripcion": suscripcion}


# ─────────────────────────────────────────────────────────────────────────────
# 2. Pago de una suscripción existente y emisión de invoice (CU-O21)
# ─────────────────────────────────────────────────────────────────────────────

class TransaccionBody(BaseModel):
    metodo_pago_id: str
    # Indicador de prueba (detalle técnico, no expuesto como concepto de
    # negocio): fuerza el resultado de la simulación de forma determinística.
    forzar_resultado: Literal["exitosa", "fallida"] | None = None


def procesar_pago(
    usuario_id: str,
    metodo_pago_id: str,
    suscripcion: dict,
    forzar_resultado: Literal["exitosa", "fallida"] | None = None,
) -> dict:
    """Núcleo de CU-O21 — crea la transacción y, si es exitosa, la invoice.
    Reutilizado tanto por `POST /transacciones` (pago explícito de una
    suscripción ya activa) como por `suscripciones.confirmar_suscripcion`
    (activar un plan de pago cobra en la misma operación, sin un paso
    separado — ver openspec suscripciones/facturacion, cambio 2026-07-09)."""
    if not metodo_pago_existe(usuario_id, metodo_pago_id):
        raise HTTPException(status_code=404, detail="Método de pago no encontrado para este usuario")

    if forzar_resultado is not None:
        estado = forzar_resultado
    else:
        estado = "exitosa" if random.random() < TASA_EXITO_DEFAULT else "fallida"

    transaccion_id = str(uuid.uuid4())
    monto = float(suscripcion["monto"])
    moneda = suscripcion["moneda"]
    suscripcion_id = suscripcion["id"]

    get_client().insert(
        "FACT_TRANSACCION_PAGO",
        [(transaccion_id, usuario_id, metodo_pago_id, suscripcion_id, monto, moneda, estado)],
        column_names=["transaccion_id", "usuario_id", "metodo_pago_id", "suscripcion_id", "monto", "moneda", "estado"],
    )

    invoice_id = None
    if estado == "exitosa":
        invoice_id = str(uuid.uuid4())
        iva = round(monto * IVA_RATE, 2)
        get_client().insert(
            "FACT_INVOICE",
            [(invoice_id, usuario_id, transaccion_id, monto, iva, "emitido")],
            column_names=["invoice_id", "usuario_id", "transaccion_id", "monto", "iva", "estado"],
        )

    audit.record(
        usuario_id=usuario_id,
        accion="pago_suscripcion",
        tabla_afectada="FACT_TRANSACCION_PAGO",
        antes=None,
        despues={
            "suscripcion_id": suscripcion_id,
            "metodo_pago_id": metodo_pago_id,
            "monto": monto,
            "moneda": moneda,
            "estado": estado,
            "invoice_id": invoice_id,
        },
    )

    return {
        "status": "ok",
        "transaccion_id": transaccion_id,
        "estado": estado,
        "invoice_id": invoice_id,
    }


@router.post("/transacciones", status_code=201)
def pagar_suscripcion(
    body: TransaccionBody,
    user: dict = Depends(get_current_user),
    suscripcion: dict = Depends(require_suscripcion_activa),
):
    return procesar_pago(user["record"]["id"], body.metodo_pago_id, suscripcion, body.forzar_resultado)


# ─────────────────────────────────────────────────────────────────────────────
# 3. Historial de facturación (propio y admin) (CU-O22 / CU-O23)
# ─────────────────────────────────────────────────────────────────────────────

def _resolver_usuario_objetivo(usuario_id: str | None, user: dict) -> str:
    propio_id = user["record"]["id"]
    if usuario_id is None or usuario_id == propio_id:
        return propio_id
    # Solo cuando se consulta a un tercero se exige admin — reutiliza la misma
    # dependencia de `seguridad` (no se reimplementa el chequeo de rol), llamada
    # aquí como función simple porque la exigencia es condicional, no un
    # Depends incondicional sobre todo el endpoint.
    require_admin(user)
    return usuario_id


@router.get("/transacciones")
def historial_transacciones(usuario_id: str | None = Query(None), user: dict = Depends(get_current_user)):
    objetivo = _resolver_usuario_objetivo(usuario_id, user)
    return {"data": query_rows(TRANSACCIONES_POR_USUARIO, {"usuario_id": objetivo})}


@router.get("/invoices")
def historial_invoices(usuario_id: str | None = Query(None), user: dict = Depends(get_current_user)):
    objetivo = _resolver_usuario_objetivo(usuario_id, user)
    return {"data": query_rows(INVOICES_POR_USUARIO, {"usuario_id": objetivo})}


def _nombre_plan_por_monto(monto: float) -> str:
    # `suscripcion_id` de FACT_TRANSACCION_PAGO es un id de PocketBase, no
    # de ClickHouse — no hay un JOIN SQL posible al plan. Los precios son
    # únicos por plan (planes.py), así que resolvemos por monto.
    for plan in PLANES.values():
        # ClickHouse guarda `monto` como Float32 — compara con tolerancia,
        # no igualdad exacta, para no perder el match por redondeo.
        if abs(plan["precio"] - monto) < 0.01:
            return plan["nombre"]
    return "Plan Tracklytics"


@router.get("/invoices/{invoice_id}")
def detalle_invoice(invoice_id: str, user: dict = Depends(get_current_user)):
    row = query_one(INVOICE_DETALLE, {"invoice_id": invoice_id})
    if not row:
        raise HTTPException(status_code=404, detail="Invoice no encontrada")
    objetivo_valido = row["usuario_id"] == user["record"]["id"]
    if not objetivo_valido:
        require_admin(user)
    row["plan_nombre"] = _nombre_plan_por_monto(row["monto"])
    return row


@router.get("/admin/dashboard")
def dashboard_facturacion(admin: dict = Depends(require_admin)):
    return {
        "ingreso_por_dia":         query_rows(INGRESO_POR_DIA),
        "transacciones_24h":      (query_one(TRANSACCIONES_ULTIMAS_24H) or {}).get("n", 0),
        "ingreso_total_historico": (query_one(INGRESO_TOTAL_HISTORICO) or {}).get("total") or 0,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Información de la empresa emisora (CU-O81) — fila única en DIM_EMPRESA
# ─────────────────────────────────────────────────────────────────────────────

class EmpresaBody(BaseModel):
    razon_social: str
    ruc:          str
    direccion:    str


@router.get("/empresa")
def obtener_empresa(user: dict = Depends(get_current_user)):
    row = query_one(EMPRESA_ACTUAL)
    if not row:
        raise HTTPException(status_code=404, detail="Información de la empresa no configurada")
    return row


@router.put("/empresa")
def actualizar_empresa(body: EmpresaBody, admin: dict = Depends(require_admin)):
    antes = query_one(EMPRESA_ACTUAL) or {}
    execute(
        "ALTER TABLE DIM_EMPRESA UPDATE razon_social = {razon_social:String}, "
        "ruc = {ruc:String}, direccion = {direccion:String} WHERE empresa_id = 1",
        {"razon_social": body.razon_social, "ruc": body.ruc, "direccion": body.direccion},
    )
    despues = {"razon_social": body.razon_social, "ruc": body.ruc, "direccion": body.direccion}
    audit.record(
        usuario_id=admin["record"]["id"], accion="editar_empresa", tabla_afectada="DIM_EMPRESA",
        antes=antes, despues=despues,
    )
    return {"status": "ok", **despues}
