from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request
from pydantic import BaseModel

from core.database import query_one, query_rows
from paquetes.partners import pb_client
from paquetes.partners.deps import require_partner, require_partner_admin
from paquetes.seguridad import audit
from paquetes.partners.queries import (
    ALBUM_DETAIL, ALBUMS_LIST,
    ARTIST_DETAIL, ARTISTS_LIST,
    GENRE_DETAIL, GENRES_LIST,
    METRICAS_POR_PARTNER, METRICAS_POR_PARTNER_TIER,
    TRACK_DETAIL, TRACKS_EXPORT, TRACKS_LIST,
)

router = APIRouter(prefix="/partners/v1", tags=["Partners"])

# Router interno (sesión de staff, no llave de API de partner) — separado del
# `router` de arriba a propósito, ver design.md de `partners-metricas-uso`:
# mismo patrón ya usado por `analitica`/`gestion_datos` (router público +
# router `/app/v1/...` interno dentro del mismo paquete).
v1_router = APIRouter(prefix="/app/v1/partners", tags=["Partners v1"], dependencies=[Depends(require_partner_admin)])


@v1_router.get("/metricas")
async def metricas_por_partner():
    """CU-O56: total de llamadas, tasa de éxito/error, latencia promedio de
    llamadas exitosas y desglose por tier, agregado por partner desde
    `LOG_LLAMADAS_PARTNER`. El nombre del partner no vive en ClickHouse
    (`DIM_PARTNER` está cubierta por la colección de PocketBase `partners`,
    ver completar-modelo-base/design.md) — se resuelve aparte."""
    filas = query_rows(METRICAS_POR_PARTNER)
    if not filas:
        return {"data": []}

    tiers = query_rows(METRICAS_POR_PARTNER_TIER)
    desglose: dict[str, list[dict]] = {}
    for fila in tiers:
        desglose.setdefault(fila["partner_id"], []).append({
            "tier": fila["tier_usado"],
            "total_llamadas": fila["total_llamadas"],
        })

    nombres = await pb_client.list_por_ids([f["partner_id"] for f in filas])

    return {
        "data": [
            {
                "partner_id": f["partner_id"],
                "nombre": nombres.get(f["partner_id"], {}).get("nombre", f["partner_id"]),
                "total_llamadas": f["total_llamadas"],
                "llamadas_exitosas": f["llamadas_exitosas"],
                "llamadas_error": f["llamadas_error"],
                "tasa_exito_pct": f["tasa_exito_pct"],
                "latencia_promedio_ms_exitosas": f["latencia_promedio_ms_exitosas"],
                "ultima_llamada": f["ultima_llamada"],
                "desglose_por_tier": desglose.get(f["partner_id"], []),
            }
            for f in filas
        ]
    }

# ── CRUD administrativo de partners + gestión de API keys (change p1-ciclos-vida) ─
# Van en el router interno de staff (`/app/v1/partners/admin`, ya bajo
# `require_partner_admin` = admin_comercial). Los partners viven en PocketBase
# (no en ClickHouse): pb_client escribe con token de superusuario (RT-01). La
# API key se guarda hasheada; su texto claro se devuelve una sola vez.
class PartnerCrearBody(BaseModel):
    nombre: str
    tier: Literal["basico", "pro", "enterprise"]
    email_contacto: str = ""


@v1_router.post("/admin", status_code=201)
async def crear_partner(body: PartnerCrearBody, admin: dict = Depends(require_partner_admin)):
    if not body.nombre.strip():
        raise HTTPException(status_code=422, detail="El nombre del partner no puede estar vacío")
    api_key = pb_client.generar_api_key()
    partner = await pb_client.crear_partner(body.nombre.strip(), body.tier, body.email_contacto.strip(), api_key)
    audit.record(
        usuario_id=admin["record"]["id"], accion="crear_partner", tabla_afectada="pocketbase.partners",
        antes=None, despues={"partner_id": partner["id"], "nombre": partner["nombre"], "tier": partner["tier"]},
    )
    # La key en claro se devuelve UNA sola vez — no se puede recuperar luego.
    return {"status": "ok", "partner": partner, "api_key": api_key}


@v1_router.get("/admin")
async def listar_partners(admin: dict = Depends(require_partner_admin)):
    return {"data": await pb_client.listar_partners()}


@v1_router.post("/admin/{partner_id}/rotar-key")
async def rotar_key(partner_id: str, admin: dict = Depends(require_partner_admin)):
    if not await pb_client.get_partner(partner_id):
        raise HTTPException(status_code=404, detail="Partner no encontrado")
    api_key = pb_client.generar_api_key()
    partner = await pb_client.rotar_api_key(partner_id, api_key)
    audit.record(
        usuario_id=admin["record"]["id"], accion="rotar_api_key_partner", tabla_afectada="pocketbase.partners",
        antes={"partner_id": partner_id}, despues={"partner_id": partner_id, "rotada": True},
    )
    return {"status": "ok", "partner": partner, "api_key": api_key}


@v1_router.post("/admin/{partner_id}/desactivar")
async def desactivar_partner(partner_id: str, admin: dict = Depends(require_partner_admin)):
    if not await pb_client.get_partner(partner_id):
        raise HTTPException(status_code=404, detail="Partner no encontrado")
    partner = await pb_client.desactivar_partner(partner_id)
    audit.record(
        usuario_id=admin["record"]["id"], accion="desactivar_partner", tabla_afectada="pocketbase.partners",
        antes={"partner_id": partner_id, "estado": "vigente"}, despues={"partner_id": partner_id, "estado": "inactivo"},
    )
    return {"status": "ok", "partner": partner}


# S13-P2 (patrón CRUD docente): al auditar en S13-P1 se encontró que Partners
# tenía Insertar y Desactivar pero no Editar — se agrega aquí, mismo criterio
# de auditoría (`audit.record`) que el resto de las mutaciones de este router.
class PartnerEditarBody(BaseModel):
    nombre: str | None = None
    tier: Literal["basico", "pro", "enterprise"] | None = None
    email_contacto: str | None = None
    estado: Literal["vigente", "inactivo"] | None = None


@v1_router.patch("/admin/{partner_id}")
async def editar_partner(partner_id: str, body: PartnerEditarBody, admin: dict = Depends(require_partner_admin)):
    antes = await pb_client.get_partner(partner_id)
    if not antes:
        raise HTTPException(status_code=404, detail="Partner no encontrado")
    campos = {k: v for k, v in body.model_dump().items() if v is not None}
    if not campos:
        raise HTTPException(status_code=422, detail="No se envió ningún campo para editar")
    if "nombre" in campos and not campos["nombre"].strip():
        raise HTTPException(status_code=422, detail="El nombre del partner no puede estar vacío")
    partner = await pb_client.actualizar_partner(partner_id, campos)
    audit.record(
        usuario_id=admin["record"]["id"], accion="editar_partner", tabla_afectada="pocketbase.partners",
        antes={"partner_id": partner_id, **{k: antes.get(k) for k in campos}}, despues={"partner_id": partner_id, **campos},
    )
    return {"status": "ok", "partner": partner}


# RF-PAR-003: campos devueltos por tier en los endpoints de tracks. Cada tier
# incluye los campos del anterior — básico ve solo lo esencial, enterprise ve
# el perfil de audio completo.
_TRACK_FIELDS = {
    "basico":     ["fact_id", "track_id", "track_name", "artist_name", "genre_name", "popularity"],
    "pro":        ["duration_ms", "danceability", "energy", "valence", "tempo"],
    "enterprise": ["loudness", "speechiness", "acousticness", "instrumentalness", "liveness"],
}
_TIER_ORDER = ["basico", "pro", "enterprise"]


def _fields_for_tier(tier: str) -> list[str]:
    idx = _TIER_ORDER.index(tier) if tier in _TIER_ORDER else 0
    fields: list[str] = []
    for t in _TIER_ORDER[: idx + 1]:
        fields += _TRACK_FIELDS[t]
    return fields


def _project(row: dict, fields: list[str]) -> dict:
    return {k: row[k] for k in fields if k in row}


@router.get("/tracks")
def tracks_list(
    request: Request,
    page:  int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    partner: dict = Depends(require_partner("basico")),
):
    """RF-PAR-002/RF-PAR-003: catálogo de tracks, campos según tier."""
    offset = (page - 1) * limit
    rows = query_rows(TRACKS_LIST, {"limit": limit, "offset": offset})
    fields = _fields_for_tier(partner["tier"])
    request.state.registros = len(rows)
    return {"data": [_project(r, fields) for r in rows], "page": page, "limit": limit}


@router.get("/tracks/export")
def tracks_export(
    request: Request,
    page:  int = Query(1, ge=1),
    limit: int = Query(500, ge=1, le=5000),
    partner: dict = Depends(require_partner("enterprise")),
):
    """RF-PAR-003/CA-PAR-003: exportación masiva, exclusiva de tier enterprise."""
    offset = (page - 1) * limit
    rows = query_rows(TRACKS_EXPORT, {"limit": limit, "offset": offset})
    request.state.registros = len(rows)
    return {"data": rows, "page": page, "limit": limit}


@router.get("/tracks/{fact_id}")
def track_detail(
    request: Request,
    fact_id: int = Path(..., ge=1),
    partner: dict = Depends(require_partner("basico")),
):
    row = query_one(TRACK_DETAIL, {"fact_id": fact_id})
    if not row:
        request.state.registros = 0
        raise HTTPException(status_code=404, detail="Track not found")
    request.state.registros = 1
    return _project(row, _fields_for_tier(partner["tier"]))


@router.get("/artistas")
def artistas_list(
    request: Request,
    page: int = Query(1, ge=1), limit: int = Query(20, ge=1, le=100),
    partner: dict = Depends(require_partner("basico")),
):
    offset = (page - 1) * limit
    rows = query_rows(ARTISTS_LIST, {"limit": limit, "offset": offset})
    request.state.registros = len(rows)
    return {"data": rows, "page": page, "limit": limit}


@router.get("/artistas/{artist_id}")
def artista_detail(
    request: Request,
    artist_id: int = Path(..., ge=1),
    partner: dict = Depends(require_partner("basico")),
):
    row = query_one(ARTIST_DETAIL, {"artist_id": artist_id})
    if not row:
        request.state.registros = 0
        raise HTTPException(status_code=404, detail="Artist not found")
    request.state.registros = 1
    return row


@router.get("/albumes")
def albumes_list(
    request: Request,
    page: int = Query(1, ge=1), limit: int = Query(20, ge=1, le=100),
    partner: dict = Depends(require_partner("basico")),
):
    offset = (page - 1) * limit
    rows = query_rows(ALBUMS_LIST, {"limit": limit, "offset": offset})
    request.state.registros = len(rows)
    return {"data": rows, "page": page, "limit": limit}


@router.get("/albumes/{album_id}")
def album_detail(
    request: Request,
    album_id: int = Path(..., ge=1),
    partner: dict = Depends(require_partner("basico")),
):
    row = query_one(ALBUM_DETAIL, {"album_id": album_id})
    if not row:
        request.state.registros = 0
        raise HTTPException(status_code=404, detail="Album not found")
    request.state.registros = 1
    return row


@router.get("/generos")
def generos_list(
    request: Request,
    page: int = Query(1, ge=1), limit: int = Query(50, ge=1, le=200),
    partner: dict = Depends(require_partner("basico")),
):
    offset = (page - 1) * limit
    rows = query_rows(GENRES_LIST, {"limit": limit, "offset": offset})
    request.state.registros = len(rows)
    return {"data": rows, "page": page, "limit": limit}


@router.get("/generos/{genre_id}")
def genero_detail(
    request: Request,
    genre_id: int = Path(..., ge=1),
    partner: dict = Depends(require_partner("basico")),
):
    row = query_one(GENRE_DETAIL, {"genre_id": genre_id})
    if not row:
        request.state.registros = 0
        raise HTTPException(status_code=404, detail="Genre not found")
    request.state.registros = 1
    return row
