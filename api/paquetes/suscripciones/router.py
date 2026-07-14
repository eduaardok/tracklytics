import uuid
from datetime import datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from core.database import get_client
from core.deps import get_current_user
from paquetes.facturacion.router import metodo_pago_existe, procesar_pago
from paquetes.suscripciones import pb_client
from paquetes.suscripciones.planes import (
    PLANES, email_institucional_valido, plan_valido_para_rol, planes_para_rol,
)

router = APIRouter(prefix="/app/v1/suscripciones", tags=["Suscripciones"])

MotivoCancelacion = Literal["precio", "no_uso", "competencia", "otro"]

# Duración del período de prueba gratuito del plan premium
# (monetizacion-retencion-mejoras, ver spec.md "Período de prueba gratuito").
DIAS_TRIAL_PREMIUM = 7


class ConfirmarSuscripcion(BaseModel):
    plan_id: str
    # `metodo_pago_id` real de DIM_METODO_PAGO (ver POST /facturacion/metodos-pago)
    # — activar un plan de pago cobra en la misma operación (cambio 2026-07-09,
    # antes aceptaba cualquier string libre sin verificar un método real).
    metodo_pago_id: str | None = None
    # Requerido solo para `plan_id='estudiante'` — validación de elegibilidad
    # de punto de venta, no se persiste (monetizacion-retencion-mejoras, ver
    # design.md decisión 6).
    email_institucional: str | None = None


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

    # admin (Lead Data Engineer/CTO) ya tiene acceso completo sin pagar — se
    # rechaza acá con un mensaje claro en vez de caer en el 404 genérico de
    # "plan no disponible" de abajo (`plan_valido_para_rol` también lo
    # bloquea, pero este mensaje es más específico).
    if role == "admin":
        raise HTTPException(
            status_code=403,
            detail="El rol admin ya tiene acceso completo a la plataforma — no aplica un plan de suscripción",
        )

    plan = PLANES.get(body.plan_id)
    if not plan or not plan_valido_para_rol(body.plan_id, role):
        raise HTTPException(
            status_code=404,
            detail="Plan no encontrado o no disponible para este tipo de cuenta",
        )

    # Plan estudiante (monetizacion-retencion-mejoras): exige email
    # institucional válido antes de aceptar la selección.
    if body.plan_id == "estudiante" and not (
        body.email_institucional and email_institucional_valido(body.email_institucional)
    ):
        raise HTTPException(
            status_code=422,
            detail="Se requiere un email institucional válido para el plan estudiante",
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

    # Período de prueba gratuito (monetizacion-retencion-mejoras): solo
    # aplica al plan premium, y solo si el usuario nunca tuvo una suscripción
    # previa a ese plan (activa o cancelada) — ver spec.md "Período de prueba
    # gratuito al confirmar el plan premium por primera vez".
    en_trial = False
    if body.plan_id == "premium":
        historial_premium = await pb_client.list_historial_por_plan(token, user_id, "premium")
        en_trial = len(historial_premium) == 0

    if en_trial:
        fecha_fin_trial = datetime.utcnow() + timedelta(days=DIAS_TRIAL_PREMIUM)
        nueva = await pb_client.crear(
            token, user_id, body.plan_id, plan["precio"], plan["moneda"],
            en_prueba=True, fecha_fin_trial=fecha_fin_trial, metodo_pago_id=body.metodo_pago_id,
        )
        # No se llama a `procesar_pago` durante el trial — el cobro se
        # difiere hasta que expire (ver `plan_activo` / GET /activa).
        return {"data": nueva, "pago": None}

    nueva = await pb_client.crear(token, user_id, body.plan_id, plan["precio"], plan["moneda"])

    pago = None
    if plan["precio"] > 0:
        # Activar un plan de pago cobra en la misma operación — no son dos
        # pasos separados desde la perspectiva del usuario (cambio 2026-07-09).
        pago = procesar_pago(user_id, body.metodo_pago_id, nueva)

    return {"data": nueva, "pago": pago}


def _trial_vencido(activa: dict) -> bool:
    fecha_fin = activa.get("fecha_fin_trial")
    if not activa.get("en_prueba") or not fecha_fin:
        return False
    try:
        limite = datetime.fromisoformat(str(fecha_fin).replace("Z", "").strip())
    except ValueError:
        return False
    return datetime.utcnow() >= limite


async def _resolver_trial_vencido(token: str, user_id: str, activa: dict) -> dict:
    """Verificación en el próximo acceso (monetizacion-retencion-mejoras,
    ver design.md decisión 6) — no hay scheduler real: `GET /activa` es el
    mismo endpoint que ya consulta `usePlanActivo()` en cada carga de la app
    y `resolverDestinoPostAuth` en cada login. Si el trial venció, cobra con
    el método de pago guardado; si falla, cancela en vez de dejar premium sin
    cobro exitoso."""
    metodo_pago_id = activa.get("metodo_pago_id")
    if metodo_pago_id and metodo_pago_existe(user_id, metodo_pago_id):
        pago = procesar_pago(user_id, metodo_pago_id, activa)
        if pago["estado"] == "exitosa":
            return await pb_client.marcar_trial_cobrado(token, activa["id"])

    # Cobro fallido (o sin método de pago válido) al expirar el trial: se
    # cancela, no queda un plan premium activo sin cobro exitoso. Se registra
    # como cancelación involuntaria (`voluntaria=0`) para no mezclarla con
    # cancelaciones explícitas del usuario en el reporte de churn.
    cancelada = await pb_client.cancelar(token, activa["id"])
    get_client().insert(
        "FACT_CANCELACION_SUSCRIPCION",
        [(str(uuid.uuid4()), activa["id"], user_id, "precio", 0)],
        column_names=["cancelacion_id", "suscripcion_id", "usuario_id", "motivo", "voluntaria"],
    )
    return cancelada


@router.get("/activa")
async def plan_activo(user: dict = Depends(get_current_user)):
    token   = user["token"]
    user_id = user["record"]["id"]
    activas = await pb_client.list_activas(token, user_id)
    activa  = activas[0] if activas else None

    if activa and _trial_vencido(activa):
        activa = await _resolver_trial_vencido(token, user_id, activa)

    return {"data": activa}


@router.post("/{suscripcion_id}/cancelar")
async def cancelar_suscripcion(
    suscripcion_id: str,
    motivo: MotivoCancelacion = Query("otro"),
    user: dict = Depends(get_current_user),
):
    token   = user["token"]
    user_id = user["record"]["id"]
    activas = await pb_client.list_activas(token, user_id)
    if not any(a["id"] == suscripcion_id for a in activas):
        raise HTTPException(status_code=404, detail="Suscripción activa no encontrada")

    cancelada = await pb_client.cancelar(token, suscripcion_id)

    # Hecho de negocio auditable (monetizacion-retencion-mejoras): se escribe
    # síncronamente en el mismo request, mismo patrón que
    # FACT_IMPRESION_ANUNCIO en `publicidad` (ver design.md, decisión 4). Si
    # cancelar en PocketBase ya tuvo éxito pero este insert fallara, la
    # suscripción queda cancelada de todas formas — no bloquea al usuario por
    # un fallo de auditoría analítica.
    get_client().insert(
        "FACT_CANCELACION_SUSCRIPCION",
        [(str(uuid.uuid4()), suscripcion_id, user_id, motivo, 1)],
        column_names=["cancelacion_id", "suscripcion_id", "usuario_id", "motivo", "voluntaria"],
    )
    return {"data": cancelada}
