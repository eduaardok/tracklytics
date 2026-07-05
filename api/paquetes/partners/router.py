from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request

from core.database import query_one, query_rows
from paquetes.partners import pb_client
from paquetes.partners.deps import require_partner, require_partner_admin
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
                "desglose_por_tier": desglose.get(f["partner_id"], []),
            }
            for f in filas
        ]
    }

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
