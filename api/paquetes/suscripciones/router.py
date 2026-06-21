from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core.deps import get_current_user
from paquetes.suscripciones import pb_client
from paquetes.suscripciones.planes import PLANES, plan_valido_para_rol, planes_para_rol

router = APIRouter(prefix="/app/v1/suscripciones", tags=["Suscripciones"])


class ConfirmarSuscripcion(BaseModel):
    plan_id: str
    metodo_pago: str | None = None


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

    if plan["precio"] > 0 and not (body.metodo_pago and body.metodo_pago.strip()):
        raise HTTPException(
            status_code=422,
            detail="Se requiere un método de pago válido para activar un plan de pago",
        )

    # Invariante de un único plan activo (RN-SUS-001): cancela cualquier
    # suscripción previa activa antes de crear la nueva.
    activas = await pb_client.list_activas(token, user_id)
    for activa in activas:
        await pb_client.cancelar(token, activa["id"])

    nueva = await pb_client.crear(token, user_id, body.plan_id, plan["precio"], plan["moneda"])
    return {"data": nueva}


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
