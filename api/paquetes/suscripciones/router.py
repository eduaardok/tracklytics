import os
import uuid
from datetime import datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel, EmailStr, Field

from core.database import execute, get_client, query_one, query_rows
from core.deps import get_current_user
from paquetes.facturacion.router import metodo_pago_existe, procesar_pago, resolver_conversion_moneda
from paquetes.seguridad import audit
from paquetes.seguridad.deps import require_email_verificado, require_rol_admin

# Autorización administrativa segmentada (change roles-gestion-usuarios): la
# gestión de planes y sus precios pertenece al área comercial. `superadmin`
# siempre pasa.
require_admin = require_rol_admin("admin_comercial")
from paquetes.suscripciones import pb_client
from paquetes.suscripciones.queries import PLAN_PRECIO_ACTUAL, PLANES_PRECIOS_TODOS, USUARIOS_POR_IDS
from paquetes.suscripciones.planes import (
    PLANES, PlanId, email_institucional_valido, plan_valido_para_rol, planes_para_rol,
)

router = APIRouter(prefix="/app/v1/suscripciones", tags=["Suscripciones"])

MotivoCancelacion = Literal["precio", "no_uso", "competencia", "otro"]

# Estados reales que este paquete escribe en la colección `suscripciones` de
# PocketBase (campo `estado`, texto libre del lado de PocketBase — ver
# pb_init.py). "suspendida" NO es uno de ellos: no existe ningún `estado=
# "suspendida"` escrito en todo el paquete (grep verificado) — una suscripción
# incumplidora se degrada a `free`/se cancela (dunning, CU-O95), nunca queda
# "suspendida". Se documenta acá porque el filtro admin del frontend
# (`AdminSuscripcionesPage.tsx`) sí ofrecía esa opción — un filtro que nunca
# podía devolver resultados, corregido en este mismo cambio.
EstadoSuscripcion = Literal["activa", "cancelada", "pago_pendiente"]

# Dunning (modelo-financiero-completar-huecos, CU-O95, design.md decisión 2):
# número de intentos de cobro fallidos antes de degradar la suscripción.
MAX_INTENTOS_COBRO = 3

# Ciclo de facturación fijo para el prorrateo de cambio de plan (CU-O94,
# design.md decisión 1) — mismo valor que `etl/gold/facturacion_recurrente.py`.
DIAS_CICLO_FACTURACION = 30


def precio_efectivo(plan_id: str) -> float:
    """Precio configurable por admin (DIM_PLAN, CU-O98) con fallback al
    precio hardcodeado de `planes.py` si no hay fila (defensivo — nunca deja
    un plan sin precio). Independiente de `_TIER_RANK` (analitica/deps.py):
    esto solo cambia cuánto cuesta un plan, nunca qué desbloquea."""
    fila = query_one(PLAN_PRECIO_ACTUAL, {"plan_id": plan_id})
    if fila and fila.get("precio_usd") is not None:
        return float(fila["precio_usd"])
    return float(PLANES[plan_id]["precio"])


# Duración del período de prueba gratuito del plan premium
# (monetizacion-retencion-mejoras, ver spec.md "Período de prueba gratuito").
DIAS_TRIAL_PREMIUM = 7


class ConfirmarSuscripcion(BaseModel):
    plan_id: PlanId
    # `metodo_pago_id` real de DIM_METODO_PAGO (ver POST /facturacion/metodos-pago)
    # — activar un plan de pago cobra en la misma operación (cambio 2026-07-09,
    # antes aceptaba cualquier string libre sin verificar un método real).
    # min_length=1 (no solo `str | None`): un método de pago vacío `""` pasaba
    # el chequeo `if not body.metodo_pago_id` cuando el precio era 0, pero
    # llegaba tal cual hasta `metodo_pago_existe` en cualquier plan de pago.
    metodo_pago_id: str | None = Field(default=None, min_length=1, max_length=100)
    # Requerido solo para `plan_id='estudiante'` — validación de elegibilidad
    # de punto de venta, no se persiste (monetizacion-retencion-mejoras, ver
    # design.md decisión 6). EmailStr (no `str` libre): garantiza forma de
    # email válida antes de que `email_institucional_valido` (planes.py)
    # aplique la regla de negocio existente (substring de dominio
    # institucional) — esa regla de negocio no se toca, solo se le exige un
    # email real como entrada en vez de cualquier texto.
    email_institucional: EmailStr | None = None


def _role(user: dict) -> str:
    return user.get("record", {}).get("role", "user")


@router.get("/planes")
async def listar_planes(user: dict = Depends(get_current_user)):
    """El plan `premium` viaja con `elegible_trial` para que el frontend
    muestre el disclosure de fecha de cobro ANTES de confirmar solo cuando el
    usuario realmente va a entrar en período de prueba — misma condición
    ("nunca tuvo una suscripción previa a premium, activa o cancelada") que
    aplica `confirmar_suscripcion` al decidir `en_trial`, evaluada acá para no
    duplicarla en el cliente sin visibilidad del historial real."""
    planes = planes_para_rol(_role(user))
    conversion = resolver_conversion_moneda(user["record"]["id"])
    for plan in planes:
        if plan["id"] == "premium":
            historial_premium = await pb_client.list_historial_por_plan(
                user["token"], user["record"]["id"], "premium",
            )
            plan["elegible_trial"] = len(historial_premium) == 0
        # Precio configurable por admin (CU-O98) — nunca el hardcodeado de
        # `planes.py` directo, aunque sea el mismo valor por defecto.
        plan["precio"] = precio_efectivo(plan["id"])
        # Conversión a la moneda local del usuario (CU-O99, design.md
        # decisión 7) — tasa de referencia simulada, nunca forex real.
        plan["moneda_local"] = conversion["moneda_codigo"]
        plan["precio_moneda_local"] = round(plan["precio"] * conversion["tasa_cambio_a_usd"], 2)
    return {"data": planes}


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

    # Verificación de correo (change p2-descubrimiento-comunidad): solo frena
    # los planes DE PAGO. El plan free debe seguir siendo contratable sin
    # verificar, o la regla se convertiría en un muro para entrar al producto.
    if precio_efectivo(body.plan_id) > 0:
        require_email_verificado(user)

    # Plan estudiante (monetizacion-retencion-mejoras): exige email
    # institucional válido antes de aceptar la selección.
    if body.plan_id == "estudiante" and not (
        body.email_institucional and email_institucional_valido(body.email_institucional)
    ):
        raise HTTPException(
            status_code=422,
            detail="Se requiere un email institucional válido para el plan estudiante",
        )

    # Precio efectivo (CU-O98): configurable por admin, no el hardcodeado de
    # `planes.py` directo (ver `precio_efectivo`).
    precio = precio_efectivo(body.plan_id)

    if precio > 0:
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

    # Fin del período ya pagado (S17, RN-SUS-002 extendida): mismo ciclo de
    # 30 días que el prorrateo de `cambiar_plan` (DIAS_CICLO_FACTURACION) —
    # se fija desde el alta para que una cancelación posterior sepa hasta
    # cuándo el usuario ya pagó (ver `pb_client._filtro_vigentes`).
    fecha_fin_periodo = datetime.utcnow() + timedelta(days=DIAS_CICLO_FACTURACION)

    if en_trial:
        fecha_fin_trial = datetime.utcnow() + timedelta(days=DIAS_TRIAL_PREMIUM)
        nueva = await pb_client.crear(
            token, user_id, body.plan_id, precio, plan["moneda"],
            en_prueba=True, fecha_fin_trial=fecha_fin_trial, metodo_pago_id=body.metodo_pago_id,
            fecha_fin_periodo=fecha_fin_periodo,
        )
        # No se llama a `procesar_pago` durante el trial — el cobro se
        # difiere hasta que expire (ver `plan_activo` / GET /activa).
        return {"data": nueva, "pago": None}

    nueva = await pb_client.crear(
        token, user_id, body.plan_id, precio, plan["moneda"], fecha_fin_periodo=fecha_fin_periodo,
    )

    pago = None
    if precio > 0:
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


# ─────────────────────────────────────────────────────────────────────────────
# Cambio de plan con prorrateo (modelo-financiero-completar-huecos, CU-O94)
# ─────────────────────────────────────────────────────────────────────────────

class CambiarPlanBody(BaseModel):
    nuevo_plan_id: PlanId
    # Fallback si la suscripción no tiene `metodo_pago_id` propio — solo las
    # suscripciones creadas en período de prueba lo guardan hoy
    # (`confirmar_suscripcion`); un plan de pago normal no lo persiste, así
    # que un upgrade sobre esa suscripción necesita que el cliente indique
    # cuál de sus métodos ya registrados usar. Mismo min_length=1 que
    # `ConfirmarSuscripcion.metodo_pago_id` (auditoría de validación): evita
    # que un "" vacío llegue hasta `metodo_pago_existe`.
    metodo_pago_id: str | None = Field(default=None, min_length=1, max_length=100)


@router.put("/{suscripcion_id}/plan")
async def cambiar_plan(
    suscripcion_id: str,
    body: CambiarPlanBody,
    user: dict = Depends(get_current_user),
):
    """CU-O94: mueve una suscripción activa a otro plan sin cancelarla,
    cobrando/acreditando el ajuste prorrateado sobre los días restantes del
    ciclo de 30 días vigente (design.md, decisión 1)."""
    role    = _role(user)
    user_id = user["record"]["id"]
    token   = user["token"]

    activas = await pb_client.list_activas(token, user_id)
    activa = next((a for a in activas if a["id"] == suscripcion_id), None)
    if not activa:
        raise HTTPException(status_code=404, detail="Suscripción activa no encontrada")

    nuevo_plan = PLANES.get(body.nuevo_plan_id)
    if not nuevo_plan or not plan_valido_para_rol(body.nuevo_plan_id, role):
        raise HTTPException(status_code=404, detail="Plan no encontrado o no disponible para este tipo de cuenta")
    if body.nuevo_plan_id == activa["tipo_plan"]:
        raise HTTPException(status_code=422, detail="La suscripción ya está en ese plan")

    precio_actual = float(activa.get("monto") or 0)
    precio_nuevo  = precio_efectivo(body.nuevo_plan_id)

    creado_raw = str(activa.get("created", "")).replace(" ", "T").replace("Z", "+00:00")
    try:
        creado = datetime.fromisoformat(creado_raw)
    except ValueError:
        creado = datetime.utcnow()
    dias_transcurridos_ciclo = (datetime.utcnow() - creado.replace(tzinfo=None)).days % DIAS_CICLO_FACTURACION
    dias_restantes = DIAS_CICLO_FACTURACION - dias_transcurridos_ciclo

    ajuste = round((precio_nuevo - precio_actual) * dias_restantes / DIAS_CICLO_FACTURACION, 2)

    pago_ajuste = None
    if ajuste > 0:
        metodo_pago_id = body.metodo_pago_id or activa.get("metodo_pago_id")
        if not metodo_pago_id or not metodo_pago_existe(user_id, metodo_pago_id):
            raise HTTPException(
                status_code=422,
                detail="Se requiere un método de pago válido registrado para cobrar el ajuste del upgrade",
            )
        # Reusa `procesar_pago` con un "suscripcion" temporal solo para el
        # ajuste (monto=ajuste, no el precio completo del plan nuevo) —
        # `concepto='ajuste_prorrateo'` lo distingue de un cobro normal.
        pago_ajuste = procesar_pago(
            user_id, metodo_pago_id, {"id": suscripcion_id, "monto": ajuste, "moneda": activa["moneda"]},
            concepto="ajuste_prorrateo",
        )
        if pago_ajuste["estado"] != "exitosa":
            raise HTTPException(
                status_code=402,
                detail="El cobro del ajuste prorrateado falló — el plan no se cambió",
            )
    elif ajuste < 0:
        # Downgrade: crédito informativo, sin cobro real (design.md, decisión 1).
        get_client().insert(
            "FACT_TRANSACCION_PAGO",
            [(str(uuid.uuid4()), user_id, activa.get("metodo_pago_id") or "", suscripcion_id,
              ajuste, activa["moneda"], "exitosa", "ajuste_prorrateo")],
            column_names=["transaccion_id", "usuario_id", "metodo_pago_id", "suscripcion_id", "monto", "moneda", "estado", "concepto"],
        )

    actualizada = await pb_client.actualizar_campos(token, suscripcion_id, {
        "tipo_plan": body.nuevo_plan_id, "monto": precio_nuevo, "moneda": nuevo_plan["moneda"],
    })
    return {"data": actualizada, "ajuste": ajuste, "pago_ajuste": pago_ajuste}


# ─────────────────────────────────────────────────────────────────────────────
# Dunning: reintento de cobro fallido (modelo-financiero-completar-huecos, CU-O95)
# ─────────────────────────────────────────────────────────────────────────────

class ProcesarCobroBody(BaseModel):
    metodo_pago_id: str | None = Field(default=None, min_length=1, max_length=100)
    forzar_resultado: Literal["exitosa", "fallida"] | None = None


@router.post("/{suscripcion_id}/procesar-cobro")
async def procesar_cobro(
    suscripcion_id: str,
    body: ProcesarCobroBody,
    user: dict = Depends(get_current_user),
):
    """CU-O95: intenta cobrar una suscripción `activa` o `pago_pendiente`.
    Éxito -> vuelve a `activa` con el contador en cero. Falla -> incrementa
    `intentos_fallidos`; al llegar a `MAX_INTENTOS_COBRO`, degrada (B2C ->
    free, B2B -> cancelada) en vez de reintentar indefinidamente (design.md,
    decisión 2)."""
    user_id = user["record"]["id"]
    token   = user["token"]

    sus = await pb_client.obtener_por_id(token, user_id, suscripcion_id)
    if not sus or sus.get("estado") not in ("activa", "pago_pendiente"):
        raise HTTPException(status_code=404, detail="Suscripción no encontrada o no elegible para cobro")

    metodo_pago_id = body.metodo_pago_id or sus.get("metodo_pago_id")
    if not metodo_pago_id or not metodo_pago_existe(user_id, metodo_pago_id):
        raise HTTPException(status_code=422, detail="Se requiere un método de pago válido para procesar el cobro")

    pago = procesar_pago(user_id, metodo_pago_id, sus, forzar_resultado=body.forzar_resultado)

    if pago["estado"] == "exitosa":
        # Renovación exitosa (S17): corre el fin del período pagado 30 días
        # más — mismo constante que el alta (`confirmar_suscripcion`) y que
        # el DAG `etl/gold/facturacion_recurrente.py` para no divergir entre
        # los dos caminos que pueden renovar una suscripción.
        nueva_fecha_fin_periodo = datetime.utcnow() + timedelta(days=DIAS_CICLO_FACTURACION)
        actualizada = await pb_client.actualizar_campos(token, suscripcion_id, {
            "estado": "activa", "intentos_fallidos": 0,
            "fecha_fin_periodo": nueva_fecha_fin_periodo.isoformat(sep=" "),
        })
        return {"data": actualizada, "pago": pago, "degradado": False}

    intentos = int(sus.get("intentos_fallidos") or 0) + 1

    if intentos >= MAX_INTENTOS_COBRO:
        role = _role(user)
        if role == "analyst":
            # B2B: cancela — suspende acceso a `analitica` vía
            # `require_b2b_panel_access` (ya valida estado='activa').
            actualizada = await pb_client.cancelar(token, suscripcion_id)
            get_client().insert(
                "FACT_CANCELACION_SUSCRIPCION",
                [(str(uuid.uuid4()), suscripcion_id, user_id, "precio", 0)],
                column_names=["cancelacion_id", "suscripcion_id", "usuario_id", "motivo", "voluntaria"],
            )
        else:
            # B2C: degrada a free, mantiene el acceso a la plataforma
            # (mismo criterio que un downgrade real de Spotify).
            actualizada = await pb_client.actualizar_campos(token, suscripcion_id, {
                "tipo_plan": "free", "monto": 0, "estado": "activa", "intentos_fallidos": 0,
            })
        return {"data": actualizada, "pago": pago, "degradado": True, "intentos_fallidos": intentos}

    actualizada = await pb_client.actualizar_campos(token, suscripcion_id, {
        "estado": "pago_pendiente", "intentos_fallidos": intentos,
    })
    return {"data": actualizada, "pago": pago, "degradado": False, "intentos_fallidos": intentos}


# ─────────────────────────────────────────────────────────────────────────────
# Precios de plan configurables (modelo-financiero-completar-huecos, CU-O98)
# ─────────────────────────────────────────────────────────────────────────────

class PrecioPlanBody(BaseModel):
    precio_usd: float = Field(ge=0)


@router.get("/admin/planes")
def listar_precios_planes(admin: dict = Depends(require_admin)):
    filas = {f["plan_id"]: f for f in query_rows(PLANES_PRECIOS_TODOS)}
    return {
        "data": [
            {
                "plan_id": pid, "nombre": p["nombre"], "tipo_actor": p["tipo_actor"],
                "precio_usd": float(filas[pid]["precio_usd"]) if pid in filas else p["precio"],
            }
            for pid, p in PLANES.items()
        ],
    }


@router.put("/admin/planes/{plan_id}/precio")
def actualizar_precio_plan(plan_id: str, body: PrecioPlanBody, admin: dict = Depends(require_admin)):
    if plan_id not in PLANES:
        raise HTTPException(status_code=404, detail="Plan no encontrado")
    get_client().insert(
        "DIM_PLAN", [(plan_id, body.precio_usd, 1)], column_names=["plan_id", "precio_usd", "activo"],
    )
    return {"status": "ok", "plan_id": plan_id, "precio_usd": body.precio_usd}


# ─────────────────────────────────────────────────────────────────────────────
# Administración de suscripciones individuales (change p1-ciclos-vida, CU comercial)
# ─────────────────────────────────────────────────────────────────────────────

# Historial de cobros de una suscripción (detalle admin) — vive en ClickHouse
# (FACT_TRANSACCION_PAGO), a diferencia de la suscripción (PocketBase).
COBROS_POR_SUSCRIPCION = """
SELECT transaccion_id, monto, moneda, estado, concepto, fecha
FROM FACT_TRANSACCION_PAGO
WHERE suscripcion_id = {suscripcion_id:String}
ORDER BY fecha DESC
"""


def _pb_escape(valor: str) -> str:
    # Los filtros de PocketBase se construyen con comillas dobles; se neutraliza
    # cualquier comilla en el valor recibido para no romper el filtro.
    return valor.replace('"', "")


@router.get("/admin/suscripciones")
async def listar_suscripciones_admin(
    estado: EstadoSuscripcion | None = Query(None),
    plan_id: PlanId | None = Query(None),
    fecha_desde: str | None = Query(None),
    fecha_hasta: str | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    admin: dict = Depends(require_admin),
):
    clauses = []
    if estado:
        clauses.append(f'estado="{_pb_escape(estado)}"')
    if plan_id:
        clauses.append(f'tipo_plan="{_pb_escape(plan_id)}"')
    if fecha_desde:
        clauses.append(f'created >= "{_pb_escape(fecha_desde)}"')
    if fecha_hasta:
        clauses.append(f'created <= "{_pb_escape(fecha_hasta)}"')
    filtro = " && ".join(clauses)
    res = await pb_client.list_admin(filtro, page, limit)
    items = res["items"]
    # Enriquecer con nombre/email del usuario desde DIM_USUARIO
    usuario_ids = list({s.get("usuario_o_cliente", "") for s in items if s.get("usuario_o_cliente")})
    if usuario_ids:
        usuarios = query_rows(USUARIOS_POR_IDS, {"ids": usuario_ids})
        lookup = {u["usuario_id"]: u for u in usuarios}
        for s in items:
            uid = s.get("usuario_o_cliente", "")
            u = lookup.get(uid)
            if u:
                s["usuario_nombre"] = u.get("nombre") or ""
                s["usuario_email"] = u.get("email") or ""
    return {"data": items, "total": res["total"], "total_pages": res["total_pages"], "page": page, "limit": limit}


@router.get("/admin/suscripciones/{suscripcion_id}")
async def detalle_suscripcion_admin(suscripcion_id: str, admin: dict = Depends(require_admin)):
    sus = await pb_client.obtener_admin(suscripcion_id)
    if not sus:
        raise HTTPException(status_code=404, detail="Suscripción no encontrada")
    cobros = query_rows(COBROS_POR_SUSCRIPCION, {"suscripcion_id": suscripcion_id})
    return {"suscripcion": sus, "cobros": cobros}


class CancelarAdminBody(BaseModel):
    motivo: str = Field(default="", max_length=500)


@router.post("/admin/suscripciones/{suscripcion_id}/cancelar")
async def cancelar_suscripcion_admin(suscripcion_id: str, body: CancelarAdminBody, admin: dict = Depends(require_admin)):
    sus = await pb_client.obtener_admin(suscripcion_id)
    if not sus:
        raise HTTPException(status_code=404, detail="Suscripción no encontrada")
    if sus.get("estado") == "cancelada":
        raise HTTPException(status_code=409, detail="La suscripción ya está cancelada")
    token = await pb_client._get_admin_token()
    cancelada = await pb_client.cancelar(token, suscripcion_id)
    # FACT_CANCELACION_SUSCRIPCION.motivo es un Enum8 cerrado — una cancelación
    # administrativa se registra como 'otro' + voluntaria=1; el motivo libre del
    # admin queda en la auditoría.
    get_client().insert(
        "FACT_CANCELACION_SUSCRIPCION",
        [(str(uuid.uuid4()), suscripcion_id, sus.get("usuario_o_cliente", ""), "otro", 1)],
        column_names=["cancelacion_id", "suscripcion_id", "usuario_id", "motivo", "voluntaria"],
    )
    audit.record(
        usuario_id=admin["record"]["id"], accion="cancelar_suscripcion_admin",
        tabla_afectada="pocketbase.suscripciones",
        antes={"suscripcion_id": suscripcion_id, "estado": sus.get("estado")},
        despues={"suscripcion_id": suscripcion_id, "estado": "cancelada", "motivo": body.motivo},
    )
    return {"data": cancelada}


class ExtenderBody(BaseModel):
    # Tope de 365 días (auditoría de validación): una extensión de cortesía
    # administrativa de más de un año no es un caso de negocio real — algo
    # así debería pasar por un plan/proceso distinto, no por este endpoint.
    dias: int = Field(gt=0, le=365)
    motivo: str = Field(default="", max_length=500)


@router.post("/admin/suscripciones/{suscripcion_id}/extender")
async def extender_suscripcion_admin(suscripcion_id: str, body: ExtenderBody, admin: dict = Depends(require_admin)):
    sus = await pb_client.obtener_admin(suscripcion_id)
    if not sus:
        raise HTTPException(status_code=404, detail="Suscripción no encontrada")

    base = datetime.utcnow()
    actual = str(sus.get("fecha_vencimiento") or "").strip()
    if actual:
        try:
            venc = datetime.fromisoformat(actual.replace("Z", "").replace(" ", "T").split(".")[0])
            base = max(base, venc)
        except ValueError:
            pass
    nueva_fecha = base + timedelta(days=body.dias)
    token = await pb_client._get_admin_token()
    actualizada = await pb_client.actualizar_campos(token, suscripcion_id, {
        "fecha_vencimiento": nueva_fecha.isoformat(sep=" "),
    })
    audit.record(
        usuario_id=admin["record"]["id"], accion="extender_suscripcion_admin",
        tabla_afectada="pocketbase.suscripciones",
        antes={"suscripcion_id": suscripcion_id, "fecha_vencimiento": actual or None},
        despues={"suscripcion_id": suscripcion_id, "fecha_vencimiento": nueva_fecha.isoformat(sep=" "),
                 "dias": body.dias, "motivo": body.motivo},
    )
    return {"data": actualizada, "fecha_vencimiento": nueva_fecha.isoformat(sep=" ")}


# ─────────────────────────────────────────────────────────────────────────────
# Comprobante de estudiante real (P2, S16): el checkout de `estudiante` sigue
# auto-servido por dominio de email (regla de negocio ya decidida, sin tocar
# acá). Esto es un canal AUDITABLE aparte — el usuario sube evidencia real y
# un admin la revisa — que cierra el hueco "el wizard S16-P8 era simulación
# cliente, falta endpoint que reciba/almacene el archivo".
# ─────────────────────────────────────────────────────────────────────────────

_COMPROBANTE_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "uploads", "comprobantes_estudiante")
_COMPROBANTE_EXT_VALIDAS = {".pdf", ".jpg", ".jpeg", ".png"}
_COMPROBANTE_MAX_BYTES = 5 * 1024 * 1024  # 5MB — mismo tope que el wizard del frontend (S16-P8)


@router.post("/estudiante/comprobante", status_code=201)
async def subir_comprobante_estudiante(
    email_institucional: EmailStr = Query(...),
    archivo: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    if not email_institucional_valido(email_institucional):
        raise HTTPException(status_code=422, detail="El email institucional no pertenece al dominio requerido")

    ext = os.path.splitext(archivo.filename or "")[1].lower()
    if ext not in _COMPROBANTE_EXT_VALIDAS:
        raise HTTPException(status_code=422, detail="Formato no admitido — usar PDF, JPG o PNG")

    contenido = await archivo.read()
    if len(contenido) > _COMPROBANTE_MAX_BYTES:
        raise HTTPException(status_code=422, detail="El archivo supera el máximo de 5MB")

    os.makedirs(_COMPROBANTE_DIR, exist_ok=True)
    solicitud_id = str(uuid.uuid4())
    nombre_guardado = f"{solicitud_id}{ext}"
    with open(os.path.join(_COMPROBANTE_DIR, nombre_guardado), "wb") as f:
        f.write(contenido)

    ahora = datetime.now()
    get_client().insert(
        "SOLICITUD_VERIFICACION_ESTUDIANTE",
        [(
            solicitud_id, user["record"]["id"], email_institucional,
            archivo.filename or nombre_guardado, nombre_guardado, "pendiente", ahora, None, None,
        )],
        column_names=[
            "solicitud_id", "usuario_id", "email_institucional", "archivo_nombre",
            "archivo_path", "estado", "creado_en", "revisado_en", "revisado_por",
        ],
    )
    return {"data": {"solicitud_id": solicitud_id, "estado": "pendiente", "creado_en": ahora}}


@router.get("/estudiante/mi-solicitud")
def mi_solicitud_estudiante(user: dict = Depends(get_current_user)):
    """Última solicitud del usuario autenticado (o `None` si nunca subió una)
    — el wizard del frontend la consulta para no re-mostrar el formulario a
    quien ya tiene una revisión pendiente/resuelta."""
    fila = query_one(
        "SELECT solicitud_id, email_institucional, archivo_nombre, estado, creado_en, revisado_en "
        "FROM SOLICITUD_VERIFICACION_ESTUDIANTE WHERE usuario_id = {usuario_id:String} "
        "ORDER BY creado_en DESC LIMIT 1",
        {"usuario_id": user["record"]["id"]},
    )
    return {"data": fila}


@router.get("/admin/estudiante/solicitudes")
def solicitudes_estudiante_admin(
    estado: Literal["pendiente", "aprobado", "rechazado"] | None = Query(None),
    admin: dict = Depends(require_admin),
):
    where = "WHERE estado = {estado:String}" if estado else ""
    params = {"estado": estado} if estado else {}
    return {"data": query_rows(
        f"SELECT solicitud_id, usuario_id, email_institucional, archivo_nombre, estado, "
        f"creado_en, revisado_en, revisado_por FROM SOLICITUD_VERIFICACION_ESTUDIANTE "
        f"{where} ORDER BY creado_en DESC",
        params,
    )}


class RevisarSolicitudEstudianteBody(BaseModel):
    estado: Literal["aprobado", "rechazado"]


@router.patch("/admin/estudiante/solicitudes/{solicitud_id}")
def revisar_solicitud_estudiante(
    solicitud_id: str, body: RevisarSolicitudEstudianteBody, admin: dict = Depends(require_admin),
):
    existe = query_one(
        "SELECT solicitud_id FROM SOLICITUD_VERIFICACION_ESTUDIANTE WHERE solicitud_id = {id:String} LIMIT 1",
        {"id": solicitud_id},
    )
    if not existe:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    execute(
        "ALTER TABLE SOLICITUD_VERIFICACION_ESTUDIANTE UPDATE "
        "estado = {estado:String}, revisado_en = now(), revisado_por = {revisor:String} "
        "WHERE solicitud_id = {id:String}",
        {"estado": body.estado, "revisor": admin["record"]["id"], "id": solicitud_id},
    )
    audit.record(
        usuario_id=admin["record"]["id"], accion="revisar_solicitud_estudiante",
        tabla_afectada="SOLICITUD_VERIFICACION_ESTUDIANTE",
        antes={"solicitud_id": solicitud_id, "estado": "pendiente"},
        despues={"solicitud_id": solicitud_id, "estado": body.estado},
    )
    return {"status": "ok", "solicitud_id": solicitud_id, "estado": body.estado}
