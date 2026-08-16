import random
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator, model_validator

from core.database import execute, get_client, query_one, query_rows
from core.deps import get_current_user
from paquetes.distribucion.router import resolver_pais_config
from paquetes.facturacion.deps import require_admin, require_suscripcion_activa
from paquetes.suscripciones import pb_client
from paquetes.facturacion.queries import (
    IVA_RATE,
    EMPRESA_ACTUAL,
    INGRESO_POR_DIA,
    INGRESO_TOTAL_HISTORICO,
    INVOICE_DETALLE,
    INVOICES_POR_USUARIO,
    METODO_PAGO_DETALLE,
    METODO_PAGO_EN_USO_VIGENTE,
    METODO_PAGO_EXISTE,
    METODOS_PAGO_POR_USUARIO,
    NOTIFICACIONES_EMAIL_POR_USUARIO,
    TASA_EXITO_DEFAULT,
    TRANSACCIONES_POR_USUARIO,
    TRANSACCIONES_RECIENTES,
    TRANSACCIONES_ULTIMAS_24H,
    ULTIMA_TRANSACCION_SUSCRIPCION_VIGENTE,
    USUARIO_PAIS,
)
from paquetes.seguridad import audit
from paquetes.suscripciones.planes import PLANES

router = APIRouter(prefix="/app/v1/facturacion", tags=["Facturacion"])

# Duplica `suscripciones.router.DIAS_CICLO_FACTURACION` a propósito (S13-P5):
# `suscripciones/router.py` importa `procesar_pago` de este módulo, así que
# importar en la otra dirección crearía un ciclo de imports. Mismo valor,
# mismo criterio que el resto de constantes duplicadas entre paquetes
# (`IVA_RATE`/`TASA_EXITO_DEFAULT` arriba).
DIAS_CICLO_FACTURACION = 30


def resolver_iva_pct(usuario_id: str) -> float:
    """IVA global + override por país (modelo-financiero-completar-huecos,
    design.md decisión 6): tasa propia del país del usuario si existe, si no
    la tasa global de plataforma."""
    fila_usuario = query_one(USUARIO_PAIS, {"usuario_id": usuario_id}) or {}
    pais_config = resolver_pais_config(fila_usuario.get("pais") or "")
    if pais_config and pais_config.get("iva_tasa") is not None:
        return float(pais_config["iva_tasa"])
    empresa = query_one(EMPRESA_ACTUAL) or {}
    return float(empresa.get("iva_tasa_global") or (IVA_RATE * 100))


def resolver_conversion_moneda(usuario_id: str) -> dict:
    """Moneda local + tasa de cambio de referencia (simulada, congelada) del
    país del usuario — decisión 4/7. Sin país reconocido, se muestra en USD
    1:1 (comportamiento actual, sin cambios)."""
    fila_usuario = query_one(USUARIO_PAIS, {"usuario_id": usuario_id}) or {}
    pais_config = resolver_pais_config(fila_usuario.get("pais") or "")
    if not pais_config:
        return {"moneda_codigo": "USD", "tasa_cambio_a_usd": 1.0}
    return {
        "moneda_codigo": pais_config.get("moneda_codigo") or "USD",
        "tasa_cambio_a_usd": float(pais_config.get("tasa_cambio_a_usd") or 1.0),
    }


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

_NUMERO_TARJETA_RE = re.compile(r"^\d{16}$")
_EXPIRACION_RE = re.compile(r"^(0[1-9]|1[0-2])/(\d{2})$")
_ULTIMOS_4_RE = re.compile(r"^\d{4}$")

# Cotas de longitud para los campos de texto libre de un método de pago —
# mismo criterio que `gestion_datos` (auditoría de validación): ninguno de
# estos campos tenía tope antes, así que un payload directo a la API (sin
# pasar por el formulario) podía escribir strings arbitrariamente largos en
# DIM_METODO_PAGO. Los valores son generosos para nombre/dirección real de
# facturación, no arbitrarios de negocio.
_TIPO_MAX_LEN = 30
_NOMBRE_TITULAR_MAX_LEN = 200
_DIRECCION_MAX_LEN = 300
_CIUDAD_MAX_LEN = 150
# 12 (no 20 como antes): cubre con margen los formatos reales más largos
# (ej. "12345-6789" EE.UU. ZIP+4 = 10, "SW1A 1AA" Reino Unido = 8) — el tope
# anterior fue señalado por revisores (S16) como excesivo para un código
# postal real.
_CODIGO_POSTAL_MAX_LEN = 12
_PAIS_MAX_LEN = 10


class MetodoPagoBody(BaseModel):
    # `tipo` no se restringe a un `Literal` fijo (marca de tarjeta / método):
    # a diferencia de un estado de negocio, este campo es puramente
    # descriptivo (nunca hay una rama de código que decida comportamiento
    # según su valor) y el dominio ya admite más de una fuente en el
    # frontend (`checkout.ts.inferirMarcaTarjeta` infiere 'visa'/'mastercard'/
    # 'amex'/'discover'/'tarjeta'; `suscripciones/PlanesPage.tsx` usa
    # 'Visa'/'Mastercard'/'Amex' fijos) — cerrarlo a un enum rompería
    # cualquiera de los dos sin necesidad real. Se acota solo la longitud.
    tipo: str = Field(max_length=_TIPO_MAX_LEN)
    # Compatibilidad con el alta rápida ya existente en `suscripciones/
    # PlanesPage.tsx` (sin checkout completo): si se manda `numero_tarjeta`,
    # `ultimos_4_digitos` se ignora y se deriva de ahí (ver validator abajo).
    ultimos_4_digitos: str = Field(default="", max_length=4)
    pais: str = Field(default="", max_length=_PAIS_MAX_LEN)
    nombre_titular: str = Field(default="", max_length=_NOMBRE_TITULAR_MAX_LEN)
    direccion: str = Field(default="", max_length=_DIRECCION_MAX_LEN)
    ciudad: str = Field(default="", max_length=_CIUDAD_MAX_LEN)
    codigo_postal: str = Field(default="", max_length=_CODIGO_POSTAL_MAX_LEN)
    # Checkout realista (modelo-financiero-completar-huecos, CU-O99): número
    # de tarjeta y expiración simulados, SOLO para validar formato y derivar
    # los últimos 4 dígitos — nunca se persisten (design.md, decisión 7).
    numero_tarjeta: str | None = None
    fecha_expiracion: str | None = None

    @field_validator("tipo")
    @classmethod
    def _validar_tipo(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("El tipo de método de pago no puede estar vacío")
        return v

    @field_validator("pais", "nombre_titular", "direccion", "ciudad", "codigo_postal")
    @classmethod
    def _limpiar_opcionales(cls, v: str) -> str:
        return v.strip()

    @field_validator("codigo_postal")
    @classmethod
    def _validar_codigo_postal(cls, v: str) -> str:
        # Solo se rechaza lo demasiado corto para ser un código postal real
        # (ej. "1" o "AB") — el máximo ya lo acota `_CODIGO_POSTAL_MAX_LEN`.
        # Campo opcional: vacío sigue siendo válido.
        if v and len(v) < 3:
            raise ValueError("El código postal debe tener al menos 3 caracteres")
        return v

    @field_validator("numero_tarjeta")
    @classmethod
    def _validar_numero_tarjeta(cls, v: str | None) -> str | None:
        if v is not None and not _NUMERO_TARJETA_RE.match(v):
            raise ValueError("El número de tarjeta simulado debe tener 16 dígitos")
        return v

    @field_validator("fecha_expiracion")
    @classmethod
    def _validar_expiracion(cls, v: str | None) -> str | None:
        if v is None:
            return v
        m = _EXPIRACION_RE.match(v)
        if not m:
            raise ValueError("La fecha de expiración debe tener formato MM/YY")
        mes, anio = int(m.group(1)), 2000 + int(m.group(2))
        ahora = datetime.now(timezone.utc)
        if (anio, mes) < (ahora.year, ahora.month):
            raise ValueError("La tarjeta simulada está vencida")
        return v

    @model_validator(mode="after")
    def _validar_ultimos_4(self) -> "MetodoPagoBody":
        # Si no viene `numero_tarjeta`, `ultimos_4_digitos` es la ÚNICA fuente
        # de los dígitos mostrados al usuario (alta rápida de
        # `suscripciones/PlanesPage.tsx`, que ya solo habilita su botón con
        # exactamente 4 dígitos) — el backend no puede confiar en que todo
        # cliente respete esa regla de UI. Cuando sí viene `numero_tarjeta`,
        # el valor de este campo se ignora en el handler, así que no hace
        # falta validarlo acá.
        if self.numero_tarjeta is None and not _ULTIMOS_4_RE.match(self.ultimos_4_digitos):
            raise ValueError("ultimos_4_digitos debe tener exactamente 4 dígitos numéricos")
        return self


@router.post("/metodos-pago", status_code=201)
def registrar_metodo_pago(body: MetodoPagoBody, user: dict = Depends(get_current_user)):
    usuario_id = user["record"]["id"]
    metodo_pago_id = str(uuid.uuid4())

    # El número completo y la expiración solo sirvieron para validar formato
    # — se descartan acá, antes de tocar cualquier insert (nunca llegan a
    # DIM_METODO_PAGO ni a ningún log).
    ultimos_4 = body.numero_tarjeta[-4:] if body.numero_tarjeta else body.ultimos_4_digitos

    get_client().insert(
        "DIM_METODO_PAGO",
        [(
            metodo_pago_id, usuario_id, body.tipo, ultimos_4, body.pais,
            body.nombre_titular, body.direccion, body.ciudad, body.codigo_postal,
        )],
        column_names=[
            "metodo_pago_id", "usuario_id", "tipo", "ultimos_4_digitos", "pais",
            "nombre_titular", "direccion", "ciudad", "codigo_postal",
        ],
    )
    audit.record(
        usuario_id=usuario_id,
        accion="registro_metodo_pago",
        tabla_afectada="DIM_METODO_PAGO",
        antes=None,
        despues={
            "tipo": body.tipo, "ultimos_4_digitos": ultimos_4, "pais": body.pais,
            "nombre_titular": body.nombre_titular, "ciudad": body.ciudad,
        },
    )
    return {"status": "ok", "metodo_pago_id": metodo_pago_id}


@router.delete("/metodos-pago/{metodo_pago_id}")
def eliminar_metodo_pago(metodo_pago_id: str, user: dict = Depends(get_current_user)):
    usuario_id = user["record"]["id"]
    if not metodo_pago_existe(usuario_id, metodo_pago_id):
        raise HTTPException(status_code=404, detail="Método de pago no encontrado para este usuario")

    if query_one(METODO_PAGO_EN_USO_VIGENTE, {"usuario_id": usuario_id, "metodo_pago_id": metodo_pago_id}):
        raise HTTPException(
            status_code=409,
            detail="No se puede eliminar: este método de pago cubre el período de facturación en curso de una suscripción activa.",
        )

    antes = query_one(METODO_PAGO_DETALLE, {"usuario_id": usuario_id, "metodo_pago_id": metodo_pago_id}) or {}
    execute(
        "ALTER TABLE DIM_METODO_PAGO DELETE WHERE usuario_id = {usuario_id:String} AND metodo_pago_id = {metodo_pago_id:String}",
        {"usuario_id": usuario_id, "metodo_pago_id": metodo_pago_id},
    )
    audit.record(
        usuario_id=usuario_id,
        accion="eliminacion_metodo_pago",
        tabla_afectada="DIM_METODO_PAGO",
        antes=antes,
        despues=None,
    )
    return {"status": "ok"}


@router.get("/metodos-pago")
async def listar_metodos_pago(user: dict = Depends(get_current_user)):
    usuario_id = user["record"]["id"]
    methods = query_rows(METODOS_PAGO_POR_USUARIO, {"usuario_id": usuario_id})
    activas = await pb_client.list_activas(user["token"], usuario_id)
    suscripcion = None
    if activas:
        activa = activas[0]
        monto = float(activa.get("monto") or 0)
        # `pagado`/`periodo_fin`/`proximo_cobro` (S13-P5, AUDITORIA_S13.md
        # §5): antes el frontend no tenía forma de saber si el período en
        # curso ya estaba cubierto, así que el botón "Pagar" se mostraba
        # siempre — mismo guard que `procesar_pago` usa para la idempotencia.
        vigente = (
            query_one(ULTIMA_TRANSACCION_SUSCRIPCION_VIGENTE, {"suscripcion_id": activa["id"]})
            if monto > 0 else None
        )
        suscripcion = {
            "tipo_plan":      activa["tipo_plan"],
            "monto":          activa["monto"],
            "moneda":         activa["moneda"],
            "pagado":         bool(vigente),
            "periodo_inicio": str(vigente["periodo_inicio"]) if vigente else None,
            "periodo_fin":    str(vigente["periodo_fin"]) if vigente else None,
            # Próximo cobro = fin del período ya cubierto (o `None` si el
            # período actual todavía no se pagó — ahí el "próximo cobro" es
            # el propio botón "Pagar").
            "proximo_cobro":  str(vigente["periodo_fin"]) if vigente else None,
        }
    return {"data": methods, "suscripcion": suscripcion}


# ─────────────────────────────────────────────────────────────────────────────
# 2. Pago de una suscripción existente y emisión de invoice (CU-O21)
# ─────────────────────────────────────────────────────────────────────────────

class TransaccionBody(BaseModel):
    metodo_pago_id: str = Field(min_length=1)
    # Indicador de prueba (detalle técnico, no expuesto como concepto de
    # negocio): fuerza el resultado de la simulación de forma determinística.
    forzar_resultado: Literal["exitosa", "fallida"] | None = None

    @field_validator("metodo_pago_id")
    @classmethod
    def _limpiar_metodo_pago_id(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("metodo_pago_id no puede estar vacío")
        return v


def _registrar_notificacion_factura(usuario_id: str, invoice_id: str, monto: float, iva: float, moneda: str) -> None:
    """Notificación simulada de factura enviada por correo (CU-O99, design.md
    decisión 8) — nunca sale a un proveedor de email real, solo queda
    registrada y visible en `GET /facturacion/notificaciones`."""
    usuario = query_one("SELECT email FROM DIM_USUARIO WHERE usuario_id = {usuario_id:String} LIMIT 1", {"usuario_id": usuario_id})
    destinatario = (usuario or {}).get("email") or "desconocido@tracklytics.com"
    cuerpo = (
        f"Tu factura por {monto:.2f} {moneda} (IVA: {iva:.2f} {moneda}) fue generada exitosamente. "
        f"Invoice: {invoice_id}."
    )
    get_client().insert(
        "FACT_EMAIL_ENVIADO",
        [(str(uuid.uuid4()), usuario_id, "factura", invoice_id, destinatario, "Tu factura de Tracklytics", cuerpo, "enviado")],
        column_names=["notificacion_id", "usuario_id", "tipo", "referencia_id", "destinatario", "asunto", "cuerpo", "estado"],
    )


def procesar_pago(
    usuario_id: str,
    metodo_pago_id: str,
    suscripcion: dict,
    forzar_resultado: Literal["exitosa", "fallida"] | None = None,
    concepto: Literal["suscripcion", "ajuste_prorrateo"] = "suscripcion",
) -> dict:
    """Núcleo de CU-O21 — crea la transacción y, si es exitosa, la invoice.
    Reutilizado tanto por `POST /transacciones` (pago explícito de una
    suscripción ya activa) como por `suscripciones.confirmar_suscripcion`
    (activar un plan de pago cobra en la misma operación, sin un paso
    separado — ver openspec suscripciones/facturacion, cambio 2026-07-09).
    `concepto='ajuste_prorrateo'` (modelo-financiero-completar-huecos, CU-O94)
    distingue el cobro/crédito de un cambio de plan de un cobro normal."""
    if not metodo_pago_existe(usuario_id, metodo_pago_id):
        raise HTTPException(status_code=404, detail="Método de pago no encontrado para este usuario")

    suscripcion_id = suscripcion["id"]

    # Idempotencia (S13-P5, AUDITORIA_S13.md §5): un pago 'suscripcion'
    # no puede duplicar un período ya cubierto. Bug confirmado con datos
    # reales antes de este guard: cada clic en "Pagar" insertaba una
    # transacción e invoice nuevas aunque el período en curso ya estuviera
    # pagado. `ajuste_prorrateo` queda fuera a propósito (cambiar de plan
    # puede cobrar/acreditar más de una vez dentro del mismo período); un
    # reintento de un cobro fallido (dunning) tampoco se bloquea, porque el
    # guard solo mira pagos ya `exitosa`.
    if concepto == "suscripcion":
        vigente = query_one(ULTIMA_TRANSACCION_SUSCRIPCION_VIGENTE, {"suscripcion_id": suscripcion_id})
        if vigente:
            raise HTTPException(
                status_code=409,
                detail=f"Ya existe un pago vigente para este período (cubre hasta {vigente['periodo_fin']}).",
            )

    if forzar_resultado is not None:
        estado = forzar_resultado
    else:
        estado = "exitosa" if random.random() < TASA_EXITO_DEFAULT else "fallida"

    transaccion_id = str(uuid.uuid4())
    monto = float(suscripcion["monto"])
    moneda = suscripcion["moneda"]

    ahora = datetime.now(timezone.utc)
    periodo_inicio = ahora.date()
    periodo_fin = (ahora + timedelta(days=DIAS_CICLO_FACTURACION)).date()

    get_client().insert(
        "FACT_TRANSACCION_PAGO",
        [(
            transaccion_id, usuario_id, metodo_pago_id, suscripcion_id, monto, moneda, estado, concepto,
            periodo_inicio, periodo_fin,
        )],
        column_names=[
            "transaccion_id", "usuario_id", "metodo_pago_id", "suscripcion_id", "monto", "moneda", "estado",
            "concepto", "periodo_inicio", "periodo_fin",
        ],
    )

    invoice_id = None
    if estado == "exitosa":
        invoice_id = str(uuid.uuid4())
        iva_pct = resolver_iva_pct(usuario_id)
        iva = round(monto * (iva_pct / 100), 2)
        get_client().insert(
            "FACT_INVOICE",
            [(invoice_id, usuario_id, transaccion_id, monto, iva, "emitido", periodo_inicio, periodo_fin)],
            column_names=["invoice_id", "usuario_id", "transaccion_id", "monto", "iva", "estado", "periodo_inicio", "periodo_fin"],
        )
        _registrar_notificacion_factura(usuario_id, invoice_id, monto, iva, moneda)

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
            "periodo_inicio": str(periodo_inicio),
            "periodo_fin": str(periodo_fin),
        },
    )

    return {
        "status": "ok",
        "transaccion_id": transaccion_id,
        "estado": estado,
        "invoice_id": invoice_id,
        "periodo_inicio": str(periodo_inicio),
        "periodo_fin": str(periodo_fin),
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


@router.get("/admin/transacciones-recientes")
def transacciones_recientes(admin: dict = Depends(require_admin)):
    return {"data": query_rows(TRANSACCIONES_RECIENTES)}


# ─────────────────────────────────────────────────────────────────────────────
# Información de la empresa emisora (CU-O81) — fila única en DIM_EMPRESA
# ─────────────────────────────────────────────────────────────────────────────

class EmpresaBody(BaseModel):
    razon_social: str = Field(min_length=1, max_length=300)
    ruc:          str = Field(min_length=1, max_length=50)
    direccion:    str = Field(min_length=1, max_length=300)
    # IVA global + retención fiscal global (modelo-financiero-completar-
    # huecos, CU-O99/CU-O96) — reemplazan las constantes fijas anteriores;
    # un país con tasa propia en DIM_PAIS la sobreescribe (ver design.md,
    # decisiones 3 y 6). Ambos son porcentajes en escala 0-100 (no 0-1): se
    # dividen entre 100 en `resolver_iva_pct` / `regalias._resolver_retencion_pct`
    # antes de aplicarse, y el propio formulario (`EmpresaConfigPage.tsx`) los
    # etiqueta como "%" — de ahí `le=100`, nunca una fracción.
    iva_tasa_global: float = Field(default=15.0, ge=0, le=100)
    retencion_fiscal_pct_global: float = Field(default=10.0, ge=0, le=100)

    @field_validator("razon_social", "ruc", "direccion")
    @classmethod
    def _limpiar_requeridos(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("El campo no puede estar vacío")
        return v


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
        "ruc = {ruc:String}, direccion = {direccion:String}, "
        "iva_tasa_global = {iva:Float32}, retencion_fiscal_pct_global = {ret:Float32} WHERE empresa_id = 1",
        {
            "razon_social": body.razon_social, "ruc": body.ruc, "direccion": body.direccion,
            "iva": body.iva_tasa_global, "ret": body.retencion_fiscal_pct_global,
        },
    )
    despues = {
        "razon_social": body.razon_social, "ruc": body.ruc, "direccion": body.direccion,
        "iva_tasa_global": body.iva_tasa_global, "retencion_fiscal_pct_global": body.retencion_fiscal_pct_global,
    }
    audit.record(
        usuario_id=admin["record"]["id"], accion="editar_empresa", tabla_afectada="DIM_EMPRESA",
        antes=antes, despues=despues,
    )
    return {"status": "ok", **despues}


# ─────────────────────────────────────────────────────────────────────────────
# Notificaciones simuladas de factura enviada por correo (CU-O99)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/notificaciones")
def historial_notificaciones(usuario_id: str | None = Query(None), user: dict = Depends(get_current_user)):
    objetivo = _resolver_usuario_objetivo(usuario_id, user)
    return {"data": query_rows(NOTIFICACIONES_EMAIL_POR_USUARIO, {"usuario_id": objetivo})}
