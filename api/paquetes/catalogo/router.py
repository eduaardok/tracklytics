from fastapi import APIRouter, HTTPException, Query

from core.database import query_one, query_rows
from paquetes.catalogo.queries import (
    ALBUM_DETAIL, ALBUMS_SEARCH,
    ARTIST_DETAIL, ARTISTS_SEARCH, ARTISTS_TOP,
    GENRE_DETAIL, GENRES_LIST,
    TRACK_DETAIL, TRACK_DETAIL_BY_FACT_ID,
    TRACKS_BY_ALBUM, TRACKS_BY_ARTIST, TRACKS_BY_GENRE, TRACKS_TOP,
    tracks_search_count_sql, tracks_search_sql,
)

router = APIRouter(prefix="/app/v1", tags=["App"])


# ── Tracks ────────────────────────────────────────────────────────────────────

@router.get("/tracks/top")
def tracks_top(limit: int = Query(20, ge=1, le=200)):
    rows = query_rows(TRACKS_TOP, {"limit": limit})
    return {"data": rows, "total": len(rows)}


@router.get("/tracks/search")
def tracks_search(
    q:      str = Query(""),
    genre:  str = Query(""),
    limit:  int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    conditions: list[str] = []
    params: dict = {"limit": limit, "offset": offset}

    if q.strip():
        params["q"] = f"%{q.strip()}%"
        conditions.append(
            "(lower(ft.track_name) LIKE lower({q:String})"
            " OR lower(a.name) LIKE lower({q:String}))"
        )

    if genre.strip():
        params["genre"] = genre.strip()
        conditions.append("g.name = {genre:String}")

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    rows = query_rows(tracks_search_sql(where), params)
    total = query_one(tracks_search_count_sql(where), params)["total"]
    return {"data": rows, "total": total, "limit": limit, "offset": offset}


@router.get("/tracks/by-artist/{artist_id}")
def tracks_by_artist(artist_id: int, limit: int = Query(20, ge=1, le=100)):
    rows = query_rows(TRACKS_BY_ARTIST, {"artist_id": artist_id, "limit": limit})
    return {"data": rows}


@router.get("/tracks/by-album/{album_id}")
def tracks_by_album(album_id: int, limit: int = Query(50, ge=1, le=200)):
    rows = query_rows(TRACKS_BY_ALBUM, {"album_id": album_id, "limit": limit})
    return {"data": rows}


@router.get("/tracks/by-genre/{genre_id}")
def tracks_by_genre(genre_id: int, limit: int = Query(50, ge=1, le=200)):
    rows = query_rows(TRACKS_BY_GENRE, {"genre_id": genre_id, "limit": limit})
    return {"data": rows}


@router.get("/tracks/fact/{fact_id}")
def track_detail_by_fact(fact_id: int):
    row = query_one(TRACK_DETAIL_BY_FACT_ID, {"fact_id": fact_id})
    if not row:
        raise HTTPException(status_code=404, detail="Track not found")
    return row


@router.get("/tracks/{track_id}")
def track_detail(track_id: str):
    row = query_one(TRACK_DETAIL, {"track_id": track_id})
    if not row:
        raise HTTPException(status_code=404, detail="Track not found")
    return row


# ── Artists ───────────────────────────────────────────────────────────────────

@router.get("/artists/top")
def artists_top(limit: int = Query(20, ge=1, le=100)):
    rows = query_rows(ARTISTS_TOP, {"limit": limit})
    return {"data": rows}


@router.get("/artists/search")
def artists_search(q: str = Query(""), limit: int = Query(20, ge=1, le=100)):
    pattern = f"%{q.strip()}%" if q.strip() else "%"
    rows = query_rows(ARTISTS_SEARCH, {"pattern": pattern, "limit": limit})
    return {"data": rows, "total": len(rows)}


@router.get("/artists/{artist_id}")
def artist_detail(artist_id: int):
    row = query_one(ARTIST_DETAIL, {"artist_id": artist_id})
    if not row:
        raise HTTPException(status_code=404, detail="Artist not found")
    return row


# ── Albums ────────────────────────────────────────────────────────────────────

@router.get("/albums/search")
def albums_search(q: str = Query(""), limit: int = Query(20, ge=1, le=100)):
    pattern = f"%{q.strip()}%" if q.strip() else "%"
    rows = query_rows(ALBUMS_SEARCH, {"pattern": pattern, "limit": limit})
    return {"data": rows}


@router.get("/albums/{album_id}")
def album_detail(album_id: int):
    row = query_one(ALBUM_DETAIL, {"album_id": album_id})
    if not row:
        raise HTTPException(status_code=404, detail="Album not found")
    return row


# ── Genres ────────────────────────────────────────────────────────────────────

@router.get("/genres")
def genres_list():
    rows = query_rows(GENRES_LIST)
    return {"data": rows}


@router.get("/genres/{genre_id}")
def genre_detail(genre_id: int):
    row = query_one(GENRE_DETAIL, {"genre_id": genre_id})
    if not row:
        raise HTTPException(status_code=404, detail="Genre not found")
    return row
