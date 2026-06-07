from fastapi import APIRouter, HTTPException, Path, Query

from core.cache import cached
from core.database import query_one, query_rows
from paquetes.analitica.queries import (
    ARTIST_GENRE_BENCHMARKS, ARTIST_STATS,
    ARTISTS_SEARCH, ARTISTS_SEARCH_TOTAL,
    DASHBOARD_AUDIO_AVG, DASHBOARD_EXPLICIT_DIST, DASHBOARD_LAST_ETL,
    DASHBOARD_TOP_ARTISTS, DASHBOARD_TOP_GENRES,
    DASHBOARD_TOTAL_ARTISTS, DASHBOARD_TOTAL_GENRES, DASHBOARD_TOTAL_TRACKS,
    GENRE_AUDIO_PROFILE, GENRES_TOTAL, GENRES_TRENDS,
    TRENDS_WEEKLY,
)

router = APIRouter(tags=["Analytics"])


@router.get("/trends/weekly", tags=["Trends"])
@cached(ttl=60)
def trends_weekly():
    rows = query_rows(TRENDS_WEEKLY)
    return {"data": rows, "weeks": len(rows)}


@router.get("/genres/trends", tags=["Genres"])
@cached(ttl=60)
def genres_trends(
    page:  int = Query(1,  ge=1),
    limit: int = Query(50, ge=1, le=500),
):
    offset = (page - 1) * limit
    rows  = query_rows(GENRES_TRENDS, {"limit": limit, "offset": offset})
    total = query_one(GENRES_TOTAL)["n"]
    return {"data": rows, "page": page, "limit": limit, "total": total}


@router.get("/genres/{genre_id}/audio-profile", tags=["Genres"])
def genre_audio_profile(genre_id: int = Path(..., ge=1)):
    row = query_one(GENRE_AUDIO_PROFILE, {"genre_id": genre_id})
    if not row:
        raise HTTPException(status_code=404, detail="Genre not found")
    return row


@router.get("/artists/search", tags=["Artists"])
def artists_search(
    name:  str = Query(..., min_length=1),
    page:  int = Query(1,  ge=1),
    limit: int = Query(20, ge=1, le=100),
):
    offset    = (page - 1) * limit
    pattern   = f"%{name}%"
    rows      = query_rows(ARTISTS_SEARCH, {"pattern": pattern, "limit": limit, "offset": offset})
    total_row = query_one(ARTISTS_SEARCH_TOTAL, {"pattern": pattern})
    return {"data": rows, "page": page, "limit": limit, "total": total_row["n"]}


@router.get("/artists/{artist_id}/stats", tags=["Artists"])
def artist_stats(artist_id: int = Path(..., ge=1)):
    artist = query_one(ARTIST_STATS, {"artist_id": artist_id})
    if not artist:
        raise HTTPException(status_code=404, detail="Artist not found")
    artist["genre_benchmarks"] = query_rows(ARTIST_GENRE_BENCHMARKS, {"artist_id": artist_id})
    return artist


@router.get("/dashboard/executive", tags=["Dashboard"])
@cached(ttl=60)
def dashboard_executive():
    return {
        "totals": {
            "tracks":  query_one(DASHBOARD_TOTAL_TRACKS)["n"],
            "artists": query_one(DASHBOARD_TOTAL_ARTISTS)["n"],
            "genres":  query_one(DASHBOARD_TOTAL_GENRES)["n"],
        },
        "audio_averages":        query_one(DASHBOARD_AUDIO_AVG),
        "top_genres":            query_rows(DASHBOARD_TOP_GENRES),
        "top_artists":           query_rows(DASHBOARD_TOP_ARTISTS),
        "last_etl":              query_one(DASHBOARD_LAST_ETL),
        "explicit_distribution": query_rows(DASHBOARD_EXPLICIT_DIST),
    }
