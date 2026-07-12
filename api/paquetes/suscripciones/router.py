from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core.deps import get_current_user
from paquetes.facturacion.router import metodo_pago_existe, procesar_pago
from paquetes.suscripciones import pb_client
from paquetes.suscripciones.planes import PLANES, plan_valido_para_rol, planes_para_rol

router = APIRouter(prefix="/app/v1/suscripciones", tags=["Suscripciones"])


class ConfirmarSuscripcion(BaseModel):
    plan_id: str
    # `metodo_pago_id` real de DIM_METODO_PAGO (ver POST /facturacion/metodos-pago)
    # — activar un plan de pago cobra en la misma operación (cambio 2026-07-09,
    # antes aceptaba cualquier string libre sin verificar un método real).
    metodo_pago_id: str | None = None


def _role(user: dict) -> str:
    return user.get("record", {}).get("role", "user")


@router.get("/planes")
async def listar_planes(user: dict = Depends(get_current_user)):
    return {"data": planes_para_rol(_role(user))}


@router.post("", status_code=201)
async def confirmar_suscripcion(
    body: ConfirmarSuscripcion,
    user: dict = Depends(get_current_user),
):
    role    = _role(user)
    user_id = user["record"]["id"]
    token   = user["token"]

    plan = PLANES.get(body.plan_id)
    if not plan or not plan_valido_para_rol(body.plan_id, role):
        raise HTTPException(
            status_code=404,
            detail="Plan no encontrado o no disponible para este tipo de cuenta",
        )

    if plan["precio"] > 0:
        if not body.metodo_pago_id:
            raise HTTPException(
                status_code=422,
                detail="Se requiere un método de pago válido para activar un plan de pago",
            )
        # El método de pago debe ser real (DIM_METODO_PAGO), no un string libre
        # sin validar — ver POST /facturacion/metodos-pago para registrarlo.
        if not metodo_pago_existe(user_id, body.metodo_pago_id):
            raise HTTPException(status_code=404, detail="Método de pago no encontrado para este usuario")

    # Invariante de un único plan activo (RN-SUS-001): cancela cualquier
    # suscripción previa activa antes de crear la nueva.
    activas = await pb_client.list_activas(token, user_id)
    for activa in activas:
        await pb_client.cancelar(token, activa["id"])

    nueva = await pb_client.crear(token, user_id, body.plan_id, plan["precio"], plan["moneda"])

    pago = None
    if plan["precio"] > 0:
        # Activar un plan de pago cobra en la misma operación — no son dos
        # pasos separados desde la perspectiva del usuario (cambio 2026-07-09).
        pago = procesar_pago(user_id, body.metodo_pago_id, nueva)

    return {"data": nueva, "pago": pago}


@router.get("/activa")
async def plan_activo(user: dict = Depends(get_current_user)):
    token   = user["token"]
    user_id = user["record"]["id"]
    activas = await pb_client.list_activas(token, user_id)
    return {"data": activas[0] if activas else None}


@router.post("/{suscripcion_id}/cancelar")
async def cancelar_suscripcion(suscripcion_id: str, user: dict = Depends(get_current_user)):
    token   = user["token"]
    user_id = user["record"]["id"]
    activas = await pb_client.list_activas(token, user_id)
    if not any(a["id"] == suscripcion_id for a in activas):
        raise HTTPException(status_code=404, detail="Suscripción activa no encontrada")

    cancelada = await pb_client.cancelar(token, suscripcion_id)
    return {"data": cancelada}
