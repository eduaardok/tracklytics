from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request

from core.database import query_one, query_rows
from paquetes.partners.deps import require_partner
from paquetes.partners.queries import (
    ALBUM_DETAIL, ALBUMS_LIST,
    ARTIST_DETAIL, ARTISTS_LIST,
    GENRE_DETAIL, GENRES_LIST,
    TRACK_DETAIL, TRACKS_EXPORT, TRACKS_LIST,
)

router = APIRouter(prefix="/partners/v1", tags=["Partners"])

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
