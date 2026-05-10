"""
=============================================================================
TRACKLYTICS — API REST
=============================================================================
Sprint 2 | Mayo 2026

Endpoints básicos:
  GET /tracks          — listado paginado de canciones
  GET /tracks/{id}     — detalle de una canción + audio features
  GET /artists         — listado paginado de artistas
  GET /artists/{id}    — detalle de un artista + stats
  GET /albums          — listado paginado de álbumes
  GET /albums/{id}     — detalle de un álbum + tracks
  GET /genres          — listado de géneros

Endpoints analíticos:
  GET /genre-trends    — métricas promedio por género
  GET /artist-stats    — métricas promedio por artista

Endpoints de administración:
  POST /admin/run-etl  — ejecuta el pipeline ETL completo
  GET  /admin/etl-logs — historial de ejecuciones ETL

Sistema:
  GET /health          — estado de la API y la base de datos
  GET /counts          — totales globales

=============================================================================
"""

import os
import subprocess
import sys
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker
from dotenv import load_dotenv

# =============================================================================
# CONFIGURACIÓN
# =============================================================================
load_dotenv()

DB_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:postgresqlAdmin19@localhost:5432/tracklytics"
)

engine = create_engine(DB_URL, echo=False)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)

app = FastAPI(
    title="Tracklytics API",
    description="API REST para analítica musical sobre datos de Spotify.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# =============================================================================
# DEPENDENCIA DE SESIÓN
# =============================================================================
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# =============================================================================
# SCHEMAS (respuestas)
# =============================================================================

class Genre(BaseModel):
    genre_id: int
    name: str

class Album(BaseModel):
    album_id: int
    name: str

class AlbumDetail(BaseModel):
    album_id: int
    name: str
    tracks: list[dict]

class Artist(BaseModel):
    artist_id: int
    name: str

class ArtistDetail(BaseModel):
    artist_id: int
    name: str
    stats: Optional[dict]

class Track(BaseModel):
    track_id: str
    track_name: str
    album_id: int
    popularity: int
    duration_ms: int
    explicit: bool

class TrackDetail(BaseModel):
    track_id: str
    track_name: str
    album_id: int
    popularity: int
    duration_ms: int
    explicit: bool
    audio_features: Optional[dict]

class GenreTrend(BaseModel):
    trend_id: int
    genre_id: int
    genre_name: str
    avg_popularity: float
    avg_danceability: float
    avg_energy: float
    avg_valence: float
    track_count: int

class ArtistStat(BaseModel):
    stat_id: int
    artist_id: int
    artist_name: str
    avg_popularity: float
    track_count: int
    explicit_count: int

class EtlLog(BaseModel):
    log_id: int
    run_timestamp: str
    records_read: int
    records_inserted: int
    records_rejected: int
    status: str
    notes: Optional[str]

class EtlRunResult(BaseModel):
    status: str
    message: str
    log: Optional[dict]


# =============================================================================
# ENDPOINTS — GÉNEROS
# =============================================================================

@app.get("/genres", response_model=list[Genre], tags=["Géneros"])
def list_genres(db: Session = Depends(get_db)):
    """Retorna todos los géneros musicales disponibles."""
    rows = db.execute(
        text("SELECT genre_id, name FROM genres ORDER BY name")
    ).fetchall()
    return [{"genre_id": r.genre_id, "name": r.name} for r in rows]


# =============================================================================
# ENDPOINTS — ÁLBUMES
# =============================================================================

@app.get("/albums", response_model=list[Album], tags=["Álbumes"])
def list_albums(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """Retorna un listado paginado de álbumes."""
    rows = db.execute(
        text("SELECT album_id, name FROM albums ORDER BY name LIMIT :limit OFFSET :offset"),
        {"limit": limit, "offset": offset},
    ).fetchall()
    return [{"album_id": r.album_id, "name": r.name} for r in rows]


@app.get("/albums/{album_id}", response_model=AlbumDetail, tags=["Álbumes"])
def get_album(album_id: int, db: Session = Depends(get_db)):
    """Retorna el detalle de un álbum junto con sus canciones."""
    album = db.execute(
        text("SELECT album_id, name FROM albums WHERE album_id = :id"),
        {"id": album_id},
    ).fetchone()

    if not album:
        raise HTTPException(status_code=404, detail="Álbum no encontrado")

    tracks = db.execute(
        text("""
            SELECT track_id, track_name, popularity, duration_ms, explicit
            FROM tracks
            WHERE album_id = :album_id
            ORDER BY popularity DESC
        """),
        {"album_id": album_id},
    ).fetchall()

    return {
        "album_id": album.album_id,
        "name": album.name,
        "tracks": [
            {
                "track_id": t.track_id,
                "track_name": t.track_name,
                "popularity": t.popularity,
                "duration_ms": t.duration_ms,
                "explicit": t.explicit,
            }
            for t in tracks
        ],
    }


# =============================================================================
# ENDPOINTS — ARTISTAS
# =============================================================================

@app.get("/artists", response_model=list[Artist], tags=["Artistas"])
def list_artists(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Retorna un listado paginado de artistas, con búsqueda opcional por nombre."""
    if search:
        rows = db.execute(
            text("""
                SELECT artist_id, name FROM artists
                WHERE name ILIKE :search
                ORDER BY name LIMIT :limit OFFSET :offset
            """),
            {"search": f"%{search}%", "limit": limit, "offset": offset},
        ).fetchall()
    else:
        rows = db.execute(
            text("SELECT artist_id, name FROM artists ORDER BY name LIMIT :limit OFFSET :offset"),
            {"limit": limit, "offset": offset},
        ).fetchall()
    return [{"artist_id": r.artist_id, "name": r.name} for r in rows]


@app.get("/artists/{artist_id}", response_model=ArtistDetail, tags=["Artistas"])
def get_artist(artist_id: int, db: Session = Depends(get_db)):
    """Retorna el detalle de un artista junto con sus estadísticas."""
    artist = db.execute(
        text("SELECT artist_id, name FROM artists WHERE artist_id = :id"),
        {"id": artist_id},
    ).fetchone()

    if not artist:
        raise HTTPException(status_code=404, detail="Artista no encontrado")

    stats = db.execute(
        text("""
            SELECT avg_popularity, track_count, explicit_count
            FROM artist_stats
            WHERE artist_id = :id
        """),
        {"id": artist_id},
    ).fetchone()

    return {
        "artist_id": artist.artist_id,
        "name": artist.name,
        "stats": (
            {
                "avg_popularity": float(stats.avg_popularity),
                "track_count": stats.track_count,
                "explicit_count": stats.explicit_count,
            }
            if stats else None
        ),
    }


# =============================================================================
# ENDPOINTS — TRACKS
# =============================================================================

@app.get("/tracks", response_model=list[Track], tags=["Tracks"])
def list_tracks(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    min_popularity: Optional[int] = Query(None, ge=0, le=100),
    explicit: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
):
    """Retorna un listado paginado de canciones con filtros opcionales."""
    filters = ""
    params: dict = {"limit": limit, "offset": offset}

    if min_popularity is not None:
        filters += " AND popularity >= :min_popularity"
        params["min_popularity"] = min_popularity

    if explicit is not None:
        filters += " AND explicit = :explicit"
        params["explicit"] = explicit

    rows = db.execute(
        text(f"""
            SELECT track_id, track_name, album_id, popularity, duration_ms, explicit
            FROM tracks
            WHERE 1=1 {filters}
            ORDER BY popularity DESC
            LIMIT :limit OFFSET :offset
        """),
        params,
    ).fetchall()

    return [
        {
            "track_id": r.track_id,
            "track_name": r.track_name,
            "album_id": r.album_id,
            "popularity": r.popularity,
            "duration_ms": r.duration_ms,
            "explicit": r.explicit,
        }
        for r in rows
    ]


@app.get("/tracks/{track_id}", response_model=TrackDetail, tags=["Tracks"])
def get_track(track_id: str, db: Session = Depends(get_db)):
    """Retorna el detalle de una canción junto con sus características de audio."""
    track = db.execute(
        text("""
            SELECT track_id, track_name, album_id, popularity, duration_ms, explicit
            FROM tracks WHERE track_id = :id
        """),
        {"id": track_id},
    ).fetchone()

    if not track:
        raise HTTPException(status_code=404, detail="Track no encontrado")

    af = db.execute(
        text("""
            SELECT danceability, energy, musical_key, loudness, mode,
                   speechiness, acousticness, instrumentalness,
                   liveness, valence, tempo, time_signature
            FROM audio_features WHERE track_id = :id
        """),
        {"id": track_id},
    ).fetchone()

    return {
        "track_id": track.track_id,
        "track_name": track.track_name,
        "album_id": track.album_id,
        "popularity": track.popularity,
        "duration_ms": track.duration_ms,
        "explicit": track.explicit,
        "audio_features": (
            {
                "danceability": float(af.danceability),
                "energy": float(af.energy),
                "musical_key": af.musical_key,
                "loudness": float(af.loudness),
                "mode": af.mode,
                "speechiness": float(af.speechiness),
                "acousticness": float(af.acousticness),
                "instrumentalness": float(af.instrumentalness),
                "liveness": float(af.liveness),
                "valence": float(af.valence),
                "tempo": float(af.tempo),
                "time_signature": af.time_signature,
            }
            if af else None
        ),
    }


# =============================================================================
# ENDPOINTS — ANALÍTICOS
# =============================================================================

@app.get("/genre-trends", response_model=list[GenreTrend], tags=["Analíticos"])
def get_genre_trends(
    order_by: str = Query(
        "avg_popularity",
        enum=["avg_popularity", "avg_energy", "avg_danceability", "avg_valence", "track_count"]
    ),
    limit: int = Query(20, ge=1, le=114),
    db: Session = Depends(get_db),
):
    """Retorna métricas promedio por género ordenadas por el campo indicado."""
    rows = db.execute(
        text(f"""
            SELECT gt.trend_id, gt.genre_id, g.name AS genre_name,
                   gt.avg_popularity, gt.avg_danceability, gt.avg_energy,
                   gt.avg_valence, gt.track_count
            FROM genre_trends gt
            JOIN genres g ON g.genre_id = gt.genre_id
            ORDER BY gt.{order_by} DESC
            LIMIT :limit
        """),
        {"limit": limit},
    ).fetchall()

    return [
        {
            "trend_id": r.trend_id,
            "genre_id": r.genre_id,
            "genre_name": r.genre_name,
            "avg_popularity": float(r.avg_popularity),
            "avg_danceability": float(r.avg_danceability),
            "avg_energy": float(r.avg_energy),
            "avg_valence": float(r.avg_valence),
            "track_count": r.track_count,
        }
        for r in rows
    ]


@app.get("/artist-stats", response_model=list[ArtistStat], tags=["Artistas"])
def get_artist_stats(
    order_by: str = Query(
        "avg_popularity",
        enum=["avg_popularity", "track_count", "explicit_count"]
    ),
    limit: int = Query(20, ge=1, le=10000),
    db: Session = Depends(get_db),
):
    """Retorna métricas promedio por artista ordenadas por el campo indicado."""
    rows = db.execute(
        text(f"""
            SELECT s.stat_id, s.artist_id, a.name AS artist_name,
                   s.avg_popularity, s.track_count, s.explicit_count
            FROM artist_stats s
            JOIN artists a ON a.artist_id = s.artist_id
            ORDER BY s.{order_by} DESC
            LIMIT :limit
        """),
        {"limit": limit},
    ).fetchall()

    return [
        {
            "stat_id": r.stat_id,
            "artist_id": r.artist_id,
            "artist_name": r.artist_name,
            "avg_popularity": float(r.avg_popularity),
            "track_count": r.track_count,
            "explicit_count": r.explicit_count,
        }
        for r in rows
    ]


# =============================================================================
# ENDPOINTS — COUNTS (para el dashboard)
# =============================================================================

@app.get("/counts", tags=["Sistema"])
def get_counts(db: Session = Depends(get_db)):
    """Retorna el conteo total de tracks, artists, albums y genres."""
    row = db.execute(
        text("""
            SELECT
                (SELECT COUNT(*) FROM tracks)  AS total_tracks,
                (SELECT COUNT(*) FROM artists) AS total_artists,
                (SELECT COUNT(*) FROM albums)  AS total_albums,
                (SELECT COUNT(*) FROM genres)  AS total_genres
        """)
    ).fetchone()
    return {
        "total_tracks":  row.total_tracks,
        "total_artists": row.total_artists,
        "total_albums":  row.total_albums,
        "total_genres":  row.total_genres,
    }


# =============================================================================
# ENDPOINTS — ADMINISTRACIÓN
# =============================================================================

@app.post("/admin/run-etl", response_model=EtlRunResult, tags=["Administración"])
def run_etl(db: Session = Depends(get_db)):
    """
    Ejecuta el pipeline ETL completo.
    Lanza etl/main.py como subproceso y retorna el resultado del log registrado.
    """
    # Resolver la ruta al script ETL relativa a este archivo
    base_dir = os.path.dirname(os.path.abspath(__file__))
    etl_script = os.path.join(base_dir, "..", "etl", "main.py")
    etl_script = os.path.normpath(etl_script)

    if not os.path.exists(etl_script):
        raise HTTPException(
            status_code=500,
            detail=f"Script ETL no encontrado en: {etl_script}"
        )

    try:
        project_root = os.path.normpath(os.path.join(base_dir, ".."))

        result = subprocess.run(
            [sys.executable, etl_script],
            capture_output=True,
            text=True,
            timeout=600,
            cwd=project_root,
            env={**os.environ},
        )
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="El ETL superó el tiempo máximo de 10 minutos.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al lanzar el ETL: {e}")

    # Recuperar el último log registrado por el ETL
    log_row = db.execute(
        text("""
            SELECT log_id, run_timestamp, records_read, records_inserted,
                   records_rejected, status, notes
            FROM etl_logs
            ORDER BY log_id DESC
            LIMIT 1
        """)
    ).fetchone()

    last_log = None
    if log_row:
        last_log = {
            "log_id":            log_row.log_id,
            "run_timestamp":     str(log_row.run_timestamp),
            "records_read":      log_row.records_read,
            "records_inserted":  log_row.records_inserted,
            "records_rejected":  log_row.records_rejected,
            "status":            log_row.status,
            "notes":             log_row.notes or "",
        }

    if result.returncode == 0:
        return {
            "status":  "success",
            "message": "Pipeline ETL ejecutado exitosamente.",
            "log":     last_log,
        }
    else:
        return {
            "status":  "failed",
            "message": result.stderr[-2000:] if result.stderr else "Error desconocido.",
            "log":     last_log,
        }


@app.get("/admin/etl-logs", response_model=list[EtlLog], tags=["Administración"])
def get_etl_logs(
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Retorna el historial de ejecuciones ETL, más reciente primero."""
    rows = db.execute(
        text("""
            SELECT log_id, run_timestamp, records_read, records_inserted,
                   records_rejected, status, notes
            FROM etl_logs
            ORDER BY log_id DESC
            LIMIT :limit
        """),
        {"limit": limit},
    ).fetchall()

    return [
        {
            "log_id":           r.log_id,
            "run_timestamp":    str(r.run_timestamp),
            "records_read":     r.records_read,
            "records_inserted": r.records_inserted,
            "records_rejected": r.records_rejected,
            "status":           r.status,
            "notes":            r.notes or "",
        }
        for r in rows
    ]


# =============================================================================
# HEALTH CHECK
# =============================================================================

@app.get("/health", tags=["Sistema"])
def health_check(db: Session = Depends(get_db)):
    """Verifica que la API y la base de datos estén operativas."""
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ok", "database": "connected"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


# =============================================================================
# ARCHIVOS ESTÁTICOS (frontend)
# =============================================================================

app.mount("/", StaticFiles(directory=os.path.join(os.path.dirname(__file__), "static"), html=True), name="static")