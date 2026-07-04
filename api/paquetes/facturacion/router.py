import random
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from core.database import get_client, query_one, query_rows
from core.deps import get_current_user
from paquetes.facturacion.deps import require_admin, require_suscripcion_activa
from paquetes.suscripciones import pb_client
from paquetes.facturacion.queries import (
    IVA_RATE,
    INVOICES_POR_USUARIO,
    METODO_PAGO_EXISTE,
    METODOS_PAGO_POR_USUARIO,
    TASA_EXITO_DEFAULT,
    TRANSACCIONES_POR_USUARIO,
)
from paquetes.seguridad import audit

router = APIRouter(prefix="/app/v1/facturacion", tags=["Facturacion"])


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


@router.post("/transacciones", status_code=201)
def pagar_suscripcion(
    body: TransaccionBody,
    user: dict = Depends(get_current_user),
    suscripcion: dict = Depends(require_suscripcion_activa),
):
    usuario_id = user["record"]["id"]

    if not query_one(METODO_PAGO_EXISTE, {"usuario_id": usuario_id, "metodo_pago_id": body.metodo_pago_id}):
        raise HTTPException(status_code=404, detail="Método de pago no encontrado para este usuario")

    if body.forzar_resultado is not None:
        estado = body.forzar_resultado
    else:
        estado = "exitosa" if random.random() < TASA_EXITO_DEFAULT else "fallida"

    transaccion_id = str(uuid.uuid4())
    monto = float(suscripcion["monto"])
    moneda = suscripcion["moneda"]
    suscripcion_id = suscripcion["id"]

    get_client().insert(
        "FACT_TRANSACCION_PAGO",
        [(transaccion_id, usuario_id, body.metodo_pago_id, suscripcion_id, monto, moneda, estado)],
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
            "metodo_pago_id": body.metodo_pago_id,
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
