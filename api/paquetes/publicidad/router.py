import random
import uuid
from datetime import date, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from pydantic import BaseModel, Field, field_validator

from core.database import execute, get_client, query_one, query_rows
from core.deps import get_current_user
from paquetes.creadores.queries import CUENTA_ACTUAL_POR_USUARIO
from paquetes.publicidad.queries import (
    ANUNCIANTE_EXISTE,
    ANUNCIANTE_ID_MAX,
    ANUNCIANTES_COUNT,
    CAMPANA_ESTADO,
    CAMPANA_ID_MAX,
    CAMPANA_POR_ID,
    CAMPANAS_ELEGIBLES_POR_TIPO,
    IMPRESION_POR_ID,
    INGRESO_YA_RECONOCIDO,
    anunciantes_list_sql,
    campanas_count_sql,
    campanas_list_sql,
    ingresos_por_campana_sql,
)
from paquetes.seguridad import audit
from paquetes.seguridad.deps import require_rol_admin, roles_admin_vigentes

# Autorización administrativa segmentada (change roles-gestion-usuarios): los
# anunciantes, campañas e ingresos por publicidad son una línea de ingresos que
# pertenece al área financiera. `superadmin` siempre pasa.
require_admin = require_rol_admin("admin_finanzas")
from paquetes.suscripciones import pb_client

router = APIRouter(prefix="/app/v1/publicidad", tags=["Publicidad"])


# Creativo con imagen (pedido directo: "pongo una url de alguna imagen y eso
# que se muestre") — mismo criterio y mismo alcance de validación que
# `paquetes/creadores/router.py::_validar_url_imagen` (duplicación
# intencional entre paquetes, misma convención ya usada en el proyecto):
# solo confirma que es un link http(s), nunca content-type/dimensiones
# reales (no hay fetch del lado del servidor).
def _validar_url_imagen(v: str | None) -> str | None:
    if v is None:
        return None
    v = v.strip()
    if not v:
        return None
    if not (v.startswith("http://") or v.startswith("https://")):
        raise ValueError("La URL de la imagen debe empezar con http:// o https://")
    return v


def _es_artista_aprobado(usuario_id: str) -> bool:
    cuenta = query_one(CUENTA_ACTUAL_POR_USUARIO, {"usuario_id": usuario_id})
    return bool(cuenta) and cuenta["estado_cuenta"] == "aprobada"


async def _usuario_exento_de_ads(user: dict) -> bool:
    """Exento de anuncios: plan de pago activo, cuenta de artista aprobada
    (`creadores`), o staff administrativo (superadmin o cualquiera de los
    roles de área en BRIDGE_USUARIO_ROL_ADMIN) — ver requirement "Impresión
    de anuncio..." de `publicidad`. Sin el check de staff, el superadmin demo
    (role crudo "user" en PocketBase, plan "free" al no tener suscripción)
    recibía intersticiales de publicidad en cada reproducción."""
    if user.get("record", {}).get("role", "") == "admin":
        return True
    if roles_admin_vigentes(user["record"]["id"]):
        return True
    if _es_artista_aprobado(user["record"]["id"]):
        return True
    activas = await pb_client.list_activas(user["token"], user["record"]["id"])
    plan = activas[0]["tipo_plan"] if activas else "free"
    return plan != "free"


# ─────────────────────────────────────────────────────────────────────────────
# 1. Anunciantes y campañas (CU-O66)
# ─────────────────────────────────────────────────────────────────────────────

class AnuncianteBody(BaseModel):
    nombre: str = Field(min_length=1, max_length=200)
    sector: str = Field("", max_length=100)


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
def listar_anunciantes(
    limit: int = Query(20, ge=1, le=200),
    page:  int = Query(1, ge=1),
    admin: dict = Depends(require_admin),
):
    offset = (page - 1) * limit
    rows   = query_rows(anunciantes_list_sql(), {"limit": limit, "offset": offset})
    total  = query_one(ANUNCIANTES_COUNT)["n"]
    return {"data": rows, "total": total, "page": page, "limit": limit}


class AnuncianteEditBody(BaseModel):
    nombre: str = Field(min_length=1, max_length=200)
    sector: str = Field("", max_length=100)


@router.put("/admin/anunciantes/{anunciante_id}")
def editar_anunciante(
    body: AnuncianteEditBody, anunciante_id: int = Path(..., ge=1), admin: dict = Depends(require_admin),
):
    """Edita nombre/sector de un anunciante existente (change p1-ciclos-vida)."""
    if not (query_one(ANUNCIANTE_EXISTE, {"anunciante_id": anunciante_id}) or {}).get("n"):
        raise HTTPException(status_code=404, detail="Anunciante no encontrado")
    if not body.nombre.strip():
        raise HTTPException(status_code=422, detail="El nombre del anunciante no puede estar vacío")
    execute(
        "ALTER TABLE DIM_ANUNCIANTE UPDATE nombre = {nombre:String}, sector = {sector:String} "
        "WHERE anunciante_id = {id:UInt32}",
        {"nombre": body.nombre.strip(), "sector": body.sector, "id": anunciante_id},
    )
    audit.record(
        usuario_id=admin["record"]["id"], accion="editar_anunciante",
        tabla_afectada="DIM_ANUNCIANTE", antes={"anunciante_id": anunciante_id},
        despues={"nombre": body.nombre.strip(), "sector": body.sector},
    )
    return {"status": "ok", "anunciante_id": anunciante_id}


@router.post("/admin/anunciantes/{anunciante_id}/desactivar")
def desactivar_anunciante(anunciante_id: int = Path(..., ge=1), admin: dict = Depends(require_admin)):
    """Marca el anunciante como inactivo (soft-delete, change p1-ciclos-vida)."""
    if not (query_one(ANUNCIANTE_EXISTE, {"anunciante_id": anunciante_id}) or {}).get("n"):
        raise HTTPException(status_code=404, detail="Anunciante no encontrado")
    execute(
        "ALTER TABLE DIM_ANUNCIANTE UPDATE activo = 0 WHERE anunciante_id = {id:UInt32}",
        {"id": anunciante_id},
    )
    audit.record(
        usuario_id=admin["record"]["id"], accion="desactivar_anunciante",
        tabla_afectada="DIM_ANUNCIANTE", antes={"anunciante_id": anunciante_id, "activo": 1},
        despues={"anunciante_id": anunciante_id, "activo": 0},
    )
    return {"status": "ok", "anunciante_id": anunciante_id, "activo": 0}


class CampanaBody(BaseModel):
    anunciante_id: int = Field(ge=1)
    nombre: str = Field(min_length=1, max_length=200)
    cpm: float = Field(gt=0)
    presupuesto_total: float = Field(gt=0)
    fecha_inicio: date
    fecha_fin: date | None = None
    # tipo_anuncio (monetizacion-retencion-mejoras): una campaña es de un solo
    # formato, así se contrata en la industria real — 'display' exige
    # url_destino para el redirect al hacer click.
    tipo_anuncio: Literal["audio", "display"] = "audio"
    url_destino: str = Field("", max_length=2048)
    # Creativo con imagen (pedido directo) — opcional en las 3 variantes de
    # formato: sin ella, el anuncio se ve con el texto genérico de siempre
    # (comportamiento previo, sin regresión).
    imagen_url: str | None = Field(default=None, max_length=500)

    @field_validator("imagen_url")
    @classmethod
    def _validar_imagen_url(cls, v: str | None) -> str | None:
        return _validar_url_imagen(v)

    @field_validator("fecha_fin")
    @classmethod
    def _validar_fecha_fin(cls, v: date | None, info) -> date | None:
        fecha_inicio = info.data.get("fecha_inicio")
        if v is not None and fecha_inicio is not None and v <= fecha_inicio:
            raise ValueError("La fecha de fin debe ser posterior a la fecha de inicio")
        return v


@router.post("/admin/campanas", status_code=201)
def crear_campana(body: CampanaBody, admin: dict = Depends(require_admin)):
    if not (query_one(ANUNCIANTE_EXISTE, {"anunciante_id": body.anunciante_id}) or {}).get("n"):
        raise HTTPException(status_code=404, detail="Anunciante no encontrado")
    if body.tipo_anuncio == "display" and not body.url_destino.strip():
        raise HTTPException(status_code=422, detail="Una campaña display requiere una URL de destino")

    nuevo_id = ((query_one(CAMPANA_ID_MAX) or {}).get("n") or 0) + 1
    get_client().insert(
        "DIM_CAMPANA_PUBLICITARIA",
        [(
            nuevo_id, body.anunciante_id, body.nombre, body.cpm, body.presupuesto_total,
            body.fecha_inicio, body.fecha_fin, body.tipo_anuncio, body.url_destino.strip(),
            # `formato` (bug real, encontrado al probar el creativo con
            # imagen): faltaba en este INSERT, así que toda campaña nueva
            # caía siempre en el DEFAULT de la columna ('display'), sin
            # importar el `tipo_anuncio` elegido — una campaña de audio
            # recién creada se mostraba como "Display" hasta que un admin la
            # editara a mano. `tipo_anuncio` es la fuente correcta al crear
            # (el formulario de creación solo ofrece audio/display, nunca
            # 'banner' — esa variante se elige después vía editar_campana).
            body.tipo_anuncio, body.imagen_url,
        )],
        column_names=[
            "campana_id", "anunciante_id", "nombre", "cpm", "presupuesto_total",
            "fecha_inicio", "fecha_fin", "tipo_anuncio", "url_destino",
            "formato", "imagen_url",
        ],
    )
    return {"status": "ok", "campana_id": nuevo_id}


@router.get("/admin/campanas")
def listar_campanas(
    limit: int = Query(20, ge=1, le=200),
    page:  int = Query(1, ge=1),
    estado: str | None = Query(None),
    tipo_anuncio: str | None = Query(None),
    q: str | None = Query(None),
    admin: dict = Depends(require_admin),
):
    clauses, params = [], {}
    if estado:
        if estado == "Activa":
            clauses.append("estado_manual = '' AND activa = 1")
        elif estado == "Pausada":
            clauses.append("estado_manual = 'pausada'")
        elif estado == "Finalizada":
            clauses.append("estado_manual = 'finalizada'")
        elif estado == "Sin presupuesto":
            clauses.append("estado_manual = '' AND activa = 0")
    if tipo_anuncio:
        clauses.append("tipo_anuncio = {tipo_anuncio:String}")
        params["tipo_anuncio"] = tipo_anuncio
    if q:
        clauses.append("positionCaseInsensitive(nombre, {q:String}) > 0")
        params["q"] = q
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    offset = (page - 1) * limit
    rows   = query_rows(campanas_list_sql(where), {**params, "limit": limit, "offset": offset})
    total  = query_one(campanas_count_sql(where), params)["n"]
    return {"data": rows, "total": total, "page": page, "limit": limit}


# ── Ciclo de vida de una campaña (change p1-ciclos-vida) ──────────────────────
# `formato` es el atributo comercial editable; `tipo_anuncio` gobierna el canal
# de servido (design.md, Decisión 2): al fijar audio/display se sincroniza,
# 'banner' se sirve por display. Pausa/reanudación/finalización operan sobre
# `estado_manual`, eje independiente del presupuesto (`activa`).
_FORMATO_A_TIPO = {"audio": "audio", "display": "display", "banner": "display"}


class CampanaEditBody(BaseModel):
    nombre: str | None = Field(None, min_length=1, max_length=200)
    presupuesto_total: float | None = Field(None, gt=0)
    fecha_inicio: date | None = None
    fecha_fin: date | None = None
    formato: Literal["audio", "display", "banner"] | None = None
    # "" limpia el creativo; `None` (campo omitido) no lo toca — mismo
    # contrato opcional que `EditarTrackBody.imagen_url` en `creadores`.
    imagen_url: str | None = Field(default=None, max_length=500)

    @field_validator("imagen_url")
    @classmethod
    def _validar_imagen_url(cls, v: str | None) -> str | None:
        if v is not None and v.strip() == "":
            return ""
        return _validar_url_imagen(v)

    @field_validator("fecha_fin")
    @classmethod
    def _validar_fecha_fin(cls, v: date | None, info) -> date | None:
        # Solo detecta el caso en que AMBAS fechas llegan en el mismo PATCH.
        # Cuando solo una llega, `editar_campana` completa la comparación
        # contra la fecha ya guardada (no disponible acá: este validador
        # solo ve el payload, no el estado en ClickHouse).
        fecha_inicio = info.data.get("fecha_inicio")
        if v is not None and fecha_inicio is not None and v <= fecha_inicio:
            raise ValueError("La fecha de fin debe ser posterior a la fecha de inicio")
        return v


def _campana_o_404(campana_id: int) -> dict:
    fila = query_one(CAMPANA_ESTADO, {"campana_id": campana_id})
    if not fila:
        raise HTTPException(status_code=404, detail="Campaña no encontrada")
    return fila


@router.put("/admin/campanas/{campana_id}")
def editar_campana(
    body: CampanaEditBody, campana_id: int = Path(..., ge=1), admin: dict = Depends(require_admin),
):
    _campana_o_404(campana_id)

    # `CampanaEditBody` es un PATCH parcial: si el request solo trae una de
    # las dos fechas, la comparación fecha_fin > fecha_inicio del
    # `field_validator` (que solo ve el payload) no alcanza — hay que
    # completar la fecha faltante con el valor ya guardado antes de comparar.
    if body.fecha_inicio is not None or body.fecha_fin is not None:
        actual = query_one(CAMPANA_POR_ID, {"campana_id": campana_id}) or {}
        efectivo_inicio = body.fecha_inicio if body.fecha_inicio is not None else actual.get("fecha_inicio")
        efectivo_fin = body.fecha_fin if body.fecha_fin is not None else actual.get("fecha_fin")
        if efectivo_inicio is not None and efectivo_fin is not None and efectivo_fin <= efectivo_inicio:
            raise HTTPException(status_code=422, detail="La fecha de fin debe ser posterior a la fecha de inicio")

    sets, params = [], {"id": campana_id}
    if body.nombre is not None:
        if not body.nombre.strip():
            raise HTTPException(status_code=422, detail="El nombre no puede estar vacío")
        sets.append("nombre = {nombre:String}"); params["nombre"] = body.nombre.strip()
    if body.presupuesto_total is not None:
        sets.append("presupuesto_total = {presupuesto:Float32}"); params["presupuesto"] = body.presupuesto_total
    if body.fecha_inicio is not None:
        sets.append("fecha_inicio = {fecha_inicio:Date}"); params["fecha_inicio"] = body.fecha_inicio
    if body.fecha_fin is not None:
        sets.append("fecha_fin = {fecha_fin:Date}"); params["fecha_fin"] = body.fecha_fin
    if body.formato is not None:
        sets.append("formato = {formato:String}"); params["formato"] = body.formato
        sets.append("tipo_anuncio = {tipo:String}"); params["tipo"] = _FORMATO_A_TIPO[body.formato]
    if body.imagen_url is not None:
        if body.imagen_url:
            sets.append("imagen_url = {img:String}"); params["img"] = body.imagen_url
        else:
            sets.append("imagen_url = NULL")
    if not sets:
        raise HTTPException(status_code=422, detail="No se enviaron campos a editar")
    execute(f"ALTER TABLE DIM_CAMPANA_PUBLICITARIA UPDATE {', '.join(sets)} WHERE campana_id = {{id:UInt32}}", params)
    audit.record(
        usuario_id=admin["record"]["id"], accion="editar_campana",
        tabla_afectada="DIM_CAMPANA_PUBLICITARIA", antes={"campana_id": campana_id},
        despues={k: v for k, v in params.items() if k != "id"},
    )
    return {"status": "ok", "campana_id": campana_id}


def _set_estado_manual(campana_id: int, estado: str, admin: dict, accion: str) -> dict:
    execute(
        "ALTER TABLE DIM_CAMPANA_PUBLICITARIA UPDATE estado_manual = {estado:String} WHERE campana_id = {id:UInt32}",
        {"estado": estado, "id": campana_id},
    )
    audit.record(
        usuario_id=admin["record"]["id"], accion=accion,
        tabla_afectada="DIM_CAMPANA_PUBLICITARIA", antes={"campana_id": campana_id},
        despues={"estado_manual": estado},
    )
    return {"status": "ok", "campana_id": campana_id, "estado_manual": estado}


@router.post("/admin/campanas/{campana_id}/pausar")
def pausar_campana(campana_id: int = Path(..., ge=1), admin: dict = Depends(require_admin)):
    fila = _campana_o_404(campana_id)
    if fila["estado_manual"] == "finalizada":
        raise HTTPException(status_code=409, detail="Una campaña finalizada no puede pausarse")
    return _set_estado_manual(campana_id, "pausada", admin, "pausar_campana")


@router.post("/admin/campanas/{campana_id}/reanudar")
def reanudar_campana(campana_id: int = Path(..., ge=1), admin: dict = Depends(require_admin)):
    fila = _campana_o_404(campana_id)
    if fila["estado_manual"] == "finalizada":
        raise HTTPException(status_code=409, detail="Una campaña finalizada no puede reanudarse")
    return _set_estado_manual(campana_id, "", admin, "reanudar_campana")


@router.post("/admin/campanas/{campana_id}/finalizar")
def finalizar_campana(campana_id: int = Path(..., ge=1), admin: dict = Depends(require_admin)):
    _campana_o_404(campana_id)
    return _set_estado_manual(campana_id, "finalizada", admin, "finalizar_campana")


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
    return {
        "campana": {
            "campana_id": campana["campana_id"], "cpm": campana["cpm"],
            "nombre": campana["nombre"], "formato": campana["formato"], "imagen_url": campana["imagen_url"],
        },
        "impresion_id": impresion_id,
    }


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
        "campana": {
            "campana_id": campana["campana_id"], "cpm": campana["cpm"], "url_destino": campana["url_destino"],
            "nombre": campana["nombre"], "formato": campana["formato"], "imagen_url": campana["imagen_url"],
        },
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
def completar_impresion(
    impresion_id: str = Path(..., min_length=1, max_length=64), user: dict = Depends(get_current_user),
):
    return _completar_impresion(impresion_id, user)


@router.post("/impresion/{impresion_id}/click", status_code=201)
def registrar_click(
    impresion_id: str = Path(..., min_length=1, max_length=64), user: dict = Depends(get_current_user),
):
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
