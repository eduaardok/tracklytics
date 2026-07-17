import random
import uuid
from datetime import date, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from core.database import execute, get_client, query_one, query_rows
from core.deps import get_current_user
from paquetes.creadores.queries import CUENTA_ACTUAL_POR_USUARIO
from paquetes.publicidad.queries import (
    ANUNCIANTE_EXISTE,
    ANUNCIANTE_ID_MAX,
    ANUNCIANTES_LIST,
    CAMPANA_ID_MAX,
    CAMPANA_POR_ID,
    CAMPANAS_ELEGIBLES_POR_TIPO,
    CAMPANAS_LIST,
    IMPRESION_POR_ID,
    INGRESO_YA_RECONOCIDO,
    ingresos_por_campana_sql,
)
from paquetes.seguridad.deps import require_rol_admin

# Autorización administrativa segmentada (change roles-gestion-usuarios): los
# anunciantes, campañas e ingresos por publicidad son una línea de ingresos que
# pertenece al área financiera. `superadmin` siempre pasa.
require_admin = require_rol_admin("admin_finanzas")
from paquetes.suscripciones import pb_client

router = APIRouter(prefix="/app/v1/publicidad", tags=["Publicidad"])


def _es_artista_aprobado(usuario_id: str) -> bool:
    cuenta = query_one(CUENTA_ACTUAL_POR_USUARIO, {"usuario_id": usuario_id})
    return bool(cuenta) and cuenta["estado_cuenta"] == "aprobada"


async def _usuario_exento_de_ads(user: dict) -> bool:
    """Exento de anuncios: plan de pago activo, o cuenta de artista aprobada
    (`creadores`) — ver requirement "Impresión de anuncio..." de `publicidad`."""
    if _es_artista_aprobado(user["record"]["id"]):
        return True
    activas = await pb_client.list_activas(user["token"], user["record"]["id"])
    plan = activas[0]["tipo_plan"] if activas else "free"
    return plan != "free"


# ─────────────────────────────────────────────────────────────────────────────
# 1. Anunciantes y campañas (CU-O66)
# ─────────────────────────────────────────────────────────────────────────────

class AnuncianteBody(BaseModel):
    nombre: str
    sector: str = ""


@router.post("/admin/anunciantes", status_code=201)
def crear_anunciante(body: AnuncianteBody, admin: dict = Depends(require_admin)):
    if not body.nombre.strip():
        raise HTTPException(status_code=422, detail="El nombre del anunciante no puede estar vacío")
    nuevo_id = ((query_one(ANUNCIANTE_ID_MAX) or {}).get("n") or 0) + 1
    get_client().insert(
        "DIM_ANUNCIANTE", [(nuevo_id, body.nombre.strip(), body.sector)],
        column_names=["anunciante_id", "nombre", "sector"],
    )
    return {"status": "ok", "anunciante_id": nuevo_id, "nombre": body.nombre.strip()}


@router.get("/admin/anunciantes")
def listar_anunciantes(admin: dict = Depends(require_admin)):
    return {"data": query_rows(ANUNCIANTES_LIST)}


class CampanaBody(BaseModel):
    anunciante_id: int
    nombre: str
    cpm: float
    presupuesto_total: float
    fecha_inicio: date
    fecha_fin: date | None = None
    # tipo_anuncio (monetizacion-retencion-mejoras): una campaña es de un solo
    # formato, así se contrata en la industria real — 'display' exige
    # url_destino para el redirect al hacer click.
    tipo_anuncio: Literal["audio", "display"] = "audio"
    url_destino: str = ""


@router.post("/admin/campanas", status_code=201)
def crear_campana(body: CampanaBody, admin: dict = Depends(require_admin)):
    if not (query_one(ANUNCIANTE_EXISTE, {"anunciante_id": body.anunciante_id}) or {}).get("n"):
        raise HTTPException(status_code=404, detail="Anunciante no encontrado")
    if body.cpm <= 0:
        raise HTTPException(status_code=422, detail="El CPM debe ser mayor que 0")
    if body.tipo_anuncio == "display" and not body.url_destino.strip():
        raise HTTPException(status_code=422, detail="Una campaña display requiere una URL de destino")

    nuevo_id = ((query_one(CAMPANA_ID_MAX) or {}).get("n") or 0) + 1
    get_client().insert(
        "DIM_CAMPANA_PUBLICITARIA",
        [(
            nuevo_id, body.anunciante_id, body.nombre, body.cpm, body.presupuesto_total,
            body.fecha_inicio, body.fecha_fin, body.tipo_anuncio, body.url_destino.strip(),
        )],
        column_names=[
            "campana_id", "anunciante_id", "nombre", "cpm", "presupuesto_total",
            "fecha_inicio", "fecha_fin", "tipo_anuncio", "url_destino",
        ],
    )
    return {"status": "ok", "campana_id": nuevo_id}


@router.get("/admin/campanas")
def listar_campanas(admin: dict = Depends(require_admin)):
    return {"data": query_rows(CAMPANAS_LIST)}


# ─────────────────────────────────────────────────────────────────────────────
# 2. Impresión + ingreso real (CU-O67/CU-O68)
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/impresion", status_code=201)
async def registrar_impresion(user: dict = Depends(get_current_user)):
    """Se llama cuando un Usuario B2C reproduce un track. Usuarios con plan de
    pago o con cuenta de artista aprobada no reciben anuncio (`campana: null`)
    — ver CU-O67. Solo campañas `tipo_anuncio='audio'` son elegibles para este
    trigger."""
    if await _usuario_exento_de_ads(user):
        return {"campana": None}

    elegibles = query_rows(CAMPANAS_ELEGIBLES_POR_TIPO, {"tipo": "audio"})
    if not elegibles:
        return {"campana": None}

    campana = random.choice(elegibles)
    impresion_id = str(uuid.uuid4())
    get_client().insert(
        "FACT_IMPRESION_ANUNCIO",
        [(impresion_id, campana["campana_id"], user["record"]["id"], 0)],
        column_names=["impresion_id", "campana_id", "usuario_id", "completado"],
    )
    return {"campana": {"campana_id": campana["campana_id"], "cpm": campana["cpm"]}, "impresion_id": impresion_id}


@router.post("/impresion-display", status_code=201)
async def registrar_impresion_display(user: dict = Depends(get_current_user)):
    """Trigger nuevo (monetizacion-retencion-mejoras), independiente del
    reproductor — se llama al cargar home/catálogo. Solo campañas
    `tipo_anuncio='display'` son elegibles; usuarios con plan de pago o con
    cuenta de artista aprobada no reciben banner (`campana: null`)."""
    if await _usuario_exento_de_ads(user):
        return {"campana": None}

    elegibles = query_rows(CAMPANAS_ELEGIBLES_POR_TIPO, {"tipo": "display"})
    if not elegibles:
        return {"campana": None}

    campana = random.choice(elegibles)
    impresion_id = str(uuid.uuid4())
    get_client().insert(
        "FACT_IMPRESION_ANUNCIO",
        [(impresion_id, campana["campana_id"], user["record"]["id"], 0)],
        column_names=["impresion_id", "campana_id", "usuario_id", "completado"],
    )
    return {
        "campana": {"campana_id": campana["campana_id"], "cpm": campana["cpm"], "url_destino": campana["url_destino"]},
        "impresion_id": impresion_id,
    }


def _completar_impresion(impresion_id: str, user: dict) -> dict:
    """Reconoce el ingreso real de una impresión completada
    (`monto = cpm/1000`, ver design.md Decisión 4) — idempotente: completar
    la misma impresión dos veces no duplica el ingreso. Compartida por el
    cierre del anuncio de audio y el click de un banner display."""
    impresion = query_one(IMPRESION_POR_ID, {"impresion_id": impresion_id})
    if not impresion:
        raise HTTPException(status_code=404, detail="Impresión no encontrada")
    if impresion["usuario_id"] != user["record"]["id"]:
        raise HTTPException(status_code=403, detail="Esta impresión no pertenece a este usuario")

    execute(
        "ALTER TABLE FACT_IMPRESION_ANUNCIO UPDATE completado = 1 WHERE impresion_id = {id:String}",
        {"id": impresion_id},
    )

    if (query_one(INGRESO_YA_RECONOCIDO, {"impresion_id": impresion_id}) or {}).get("n"):
        return {"status": "ok", "ya_reconocido": True}

    campana = query_one(CAMPANA_POR_ID, {"campana_id": impresion["campana_id"]})
    monto = round(float(campana["cpm"]) / 1000, 4) if campana else 0.0

    ingreso_id = str(uuid.uuid4())
    get_client().insert(
        "FACT_INGRESO_PUBLICITARIO",
        [(ingreso_id, impresion_id, impresion["campana_id"], monto)],
        column_names=["ingreso_id", "impresion_id", "campana_id", "monto"],
    )
    return {"status": "ok", "ingreso_id": ingreso_id, "monto": monto}


@router.post("/impresion/{impresion_id}/completar", status_code=201)
def completar_impresion(impresion_id: str, user: dict = Depends(get_current_user)):
    return _completar_impresion(impresion_id, user)


@router.post("/impresion/{impresion_id}/click", status_code=201)
def registrar_click(impresion_id: str, user: dict = Depends(get_current_user)):
    """Click en un banner display (monetizacion-retencion-mejoras): marca
    `click=1` y reconoce el ingreso igual que "completar" en audio —
    completarse en display significa haber hecho click (ver spec.md,
    "Registro de click en anuncio display")."""
    impresion = query_one(IMPRESION_POR_ID, {"impresion_id": impresion_id})
    if not impresion:
        raise HTTPException(status_code=404, detail="Impresión no encontrada")
    if impresion["usuario_id"] != user["record"]["id"]:
        raise HTTPException(status_code=403, detail="Esta impresión no pertenece a este usuario")

    execute(
        "ALTER TABLE FACT_IMPRESION_ANUNCIO UPDATE click = 1 WHERE impresion_id = {id:String}",
        {"id": impresion_id},
    )
    return _completar_impresion(impresion_id, user)


# ─────────────────────────────────────────────────────────────────────────────
# 3. Ingreso publicitario (CU-O68)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/admin/ingresos")
def ingresos_por_campana(
    campana_id: int | None = None,
    desde: datetime | None = None,
    hasta: datetime | None = None,
    admin: dict = Depends(require_admin),
):
    clauses, params = [], {}
    if campana_id is not None:
        clauses.append("campana_id = {campana_id:UInt32}")
        params["campana_id"] = campana_id
    if desde is not None:
        clauses.append("fecha >= {desde:DateTime}")
        params["desde"] = desde
    if hasta is not None:
        clauses.append("fecha < {hasta:DateTime}")
        params["hasta"] = hasta
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    return {"data": query_rows(ingresos_por_campana_sql(where), params)}
