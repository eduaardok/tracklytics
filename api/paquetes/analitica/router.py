from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Path, Query

from core.cache import cached
from core.database import query_one, query_rows
from paquetes.analitica.deps import require_b2b_panel_access, require_staff
from paquetes.analitica.queries import (
    ARTIST_AUDIO_STATS_V1, ARTIST_GENRE_BENCHMARKS, ARTIST_PREDOMINANT_GENRE, ARTIST_STATS,
    ARTISTS_SEARCH, ARTISTS_SEARCH_TOTAL,
    DASHBOARD_AUDIO_AVG, DASHBOARD_EXPLICIT_DIST, DASHBOARD_KPIS, DASHBOARD_LAST_ETL,
    DASHBOARD_TOP_ARTISTS, DASHBOARD_TOP_GENRES,
    DASHBOARD_TOTAL_ARTISTS, DASHBOARD_TOTAL_GENRES, DASHBOARD_TOTAL_TRACKS,
    ENGAGEMENT_BY_ARTIST, ENGAGEMENT_BY_FACT,
    GENRE_AUDIO_PROFILE, GENRE_AUDIO_PROFILE_V1, GENRES_TOTAL, GENRES_TRENDS,
    REPORTE_DIARIO_ENGAGEMENT, REPORTE_DIARIO_INGESTAS,
    TENDENCIAS_LOAD_WEEK, TRACK_POPULARITY, TRENDS_WEEKLY,
)

router = APIRouter(tags=["Analytics"], dependencies=[Depends(require_b2b_panel_access)])


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


# ─────────────────────────────────────────────────────────────────────────────
# OpenSpec `analitica` v1 — endpoints bajo /app/v1/analitica/* (tasks.md)
# ─────────────────────────────────────────────────────────────────────────────

v1_router = APIRouter(
    prefix="/app/v1/analitica",
    tags=["Analitica v1"],
    dependencies=[Depends(require_b2b_panel_access)],
)


@v1_router.get("/dashboard")
@cached(ttl=60)
def v1_dashboard():
    """RF-ANA-001: KPIs agregados del catálogo en una sola pantalla."""
    return query_one(DASHBOARD_KPIS)


@v1_router.get("/generos/{genero_id}/perfil")
def v1_genero_perfil(genero_id: int = Path(..., ge=1)):
    """RF-ANA-002: perfil de audio (7 atributos) de un género."""
    row = query_one(GENRE_AUDIO_PROFILE_V1, {"genre_id": genero_id})
    if not row:
        raise HTTPException(status_code=404, detail="Género no encontrado")
    return row


def _artist_or_404(artist_id: int) -> dict:
    row = query_one(ARTIST_AUDIO_STATS_V1, {"artist_id": artist_id})
    if not row:
        raise HTTPException(status_code=404, detail=f"Artista {artist_id} no encontrado")
    return row


@v1_router.get("/artistas/comparar")
def v1_artistas_comparar(
    artista_a: int = Query(..., ge=1),
    artista_b: int = Query(..., ge=1),
):
    """RF-ANA-003: comparación lado a lado de dos artistas."""
    return {"artista_a": _artist_or_404(artista_a), "artista_b": _artist_or_404(artista_b)}


@v1_router.get("/artistas/{artist_id}/benchmark")
def v1_artista_benchmark(artist_id: int = Path(..., ge=1)):
    """RF-ANA-004 / RN-ANA-002: artista vs. promedio simple de su género
    predominante (sin excluir outliers)."""
    artist = _artist_or_404(artist_id)

    predominant = query_one(ARTIST_PREDOMINANT_GENRE, {"artist_id": artist_id})
    if not predominant:
        raise HTTPException(status_code=404, detail="El artista no tiene tracks registrados")

    genre = query_one(GENRE_AUDIO_PROFILE_V1, {"genre_id": predominant["genre_id"]})
    return {"artista": artist, "genero_benchmark": genre}


@v1_router.get("/tendencias")
def v1_tendencias(
    semana_desde: int | None = Query(None, ge=1),
    semana_hasta: int | None = Query(None, ge=1),
):
    """RF-ANA-005: serie temporal de popularidad/energy por `load_week`."""
    if semana_desde is not None and semana_hasta is not None and semana_desde > semana_hasta:
        raise HTTPException(
            status_code=422,
            detail="semana_desde no puede ser mayor que semana_hasta",
        )

    params: dict = {}
    where = ""
    if semana_desde is not None and semana_hasta is not None:
        where = "WHERE load_week BETWEEN {semana_desde:UInt8} AND {semana_hasta:UInt8}"
        params = {"semana_desde": semana_desde, "semana_hasta": semana_hasta}

    rows = query_rows(TENDENCIAS_LOAD_WEEK.format(where=where), params)
    return {"data": rows}


@v1_router.get("/engagement")
def v1_engagement(
    fact_id:   int | None = Query(None, ge=1),
    artist_id: int | None = Query(None, ge=1),
):
    """RF-ANA-006: engagement_score normalizado (0-100) por track o artista."""
    if (fact_id is None) == (artist_id is None):
        raise HTTPException(
            status_code=422,
            detail="Debe especificarse exactamente uno de: fact_id, artist_id",
        )

    if fact_id is not None:
        row = query_one(ENGAGEMENT_BY_FACT, {"fact_id": fact_id})
        return {"fact_id": fact_id, **row}

    row = query_one(ENGAGEMENT_BY_ARTIST, {"artist_id": artist_id})
    return {"artist_id": artist_id, **row}


@v1_router.get("/desempeno-relativo")
def v1_desempeno_relativo(fact_id: int = Query(..., ge=1)):
    """RF-ANA-007 / RN-ANA-001: engagement_score / popularity para un track
    con al menos una interacción registrada ("Mercado vs. Tracklytics")."""
    track = query_one(TRACK_POPULARITY, {"fact_id": fact_id})
    if not track:
        raise HTTPException(status_code=404, detail=f"fact_id {fact_id} no encontrado")

    engagement = query_one(ENGAGEMENT_BY_FACT, {"fact_id": fact_id})
    if not engagement or engagement["raw_score"] == 0:
        return {
            "fact_id": fact_id,
            "suficiente": False,
            "mensaje": "Datos de engagement insuficientes para calcular el índice de desempeño relativo",
        }

    popularity = track["popularity"]
    indice = round(engagement["engagement_score"] / popularity, 4) if popularity else None

    return {
        "fact_id":           fact_id,
        "track_name":        track["track_name"],
        "artist_name":       track["artist_name"],
        "suficiente":        True,
        "popularity":        popularity,
        "engagement_score":  engagement["engagement_score"],
        "indice_desempeno":  indice,
    }


@v1_router.get("/reporte-diario", dependencies=[Depends(require_staff)])
def v1_reporte_diario(fecha: date | None = Query(None)):
    """RF-ANA-008: reporte diario operativo (CU-O16, Data Analyst/BI Lead).

    Agrega ingestas (ETL_LOGS) y actividad de engagement del día corriente.
    No incluye suscripciones ni adquisiciones: FACT_SUSCRIPCION y
    FACT_ADQUISICION no existen en el esquema ClickHouse actual (ver
    decisiones de diseño de la implementación) — esta capability no inventa
    ni acopla una fuente de datos que no está desplegada.
    """
    fecha = fecha or date.today()
    ingestas   = query_one(REPORTE_DIARIO_INGESTAS, {"fecha": fecha}) or {}
    engagement = query_rows(REPORTE_DIARIO_ENGAGEMENT, {"fecha": fecha})

    return {
        "fecha": fecha.isoformat(),
        "ingestas": {
            "corridas":          ingestas.get("corridas", 0),
            "records_read":      ingestas.get("records_read", 0),
            "records_inserted":  ingestas.get("records_inserted", 0),
            "records_rejected":  ingestas.get("records_rejected", 0),
            "statuses":          ingestas.get("statuses", []),
        },
        "engagement_por_tipo": engagement,
        "suscripciones": None,
        "adquisiciones": None,
        "nota": (
            "suscripciones y adquisiciones no se reportan: FACT_SUSCRIPCION y "
            "FACT_ADQUISICION no existen en el ClickHouse actual."
        ),
    }
