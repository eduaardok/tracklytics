import os
from typing import Any, Optional
from contextlib import asynccontextmanager

import httpx
import clickhouse_connect
from fastapi import FastAPI, HTTPException, Query, Path
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ── Config ────────────────────────────────────────────────────────────────────

CH_HOST     = os.getenv("CLICKHOUSE_HOST", "localhost")
CH_PORT     = int(os.getenv("CLICKHOUSE_PORT", "8123"))
CH_DB       = os.getenv("CLICKHOUSE_DB", "tracklytics")
CH_USER     = os.getenv("CLICKHOUSE_USER", "default")
CH_PASSWORD = os.getenv("CLICKHOUSE_PASSWORD", "")

AIRFLOW_URL  = os.getenv("AIRFLOW_URL",      "http://airflow:8080")
AIRFLOW_USER = os.getenv("AIRFLOW_USER",     "admin")
AIRFLOW_PASS = os.getenv("AIRFLOW_PASSWORD", "tracklytics2026")
AIRFLOW_DAG  = os.getenv("AIRFLOW_DAG_ID",  "tracklytics_etl")

# DIM tables exposed via the generic CRUD router
DIM_TABLES: dict[str, str] = {
    "artists":          "DIM_ARTISTS",
    "albums":           "DIM_ALBUMS",
    "genres":           "DIM_GENRES",
    "date":             "DIM_DATE",
    "musical_key":      "DIM_MUSICAL_KEY",
    "mode":             "DIM_MODE",
    "time_signature":   "DIM_TIME_SIGNATURE",
    "explicit_type":    "DIM_EXPLICIT_TYPE",
    "popularity_range": "DIM_POPULARITY_RANGE",
    "tempo_range":      "DIM_TEMPO_RANGE",
    "energy_level":     "DIM_ENERGY_LEVEL",
}

# ── ClickHouse client ─────────────────────────────────────────────────────────

def get_client() -> clickhouse_connect.driver.Client:
    return clickhouse_connect.get_client(
        host=CH_HOST,
        port=CH_PORT,
        database=CH_DB,
        username=CH_USER,
        password=CH_PASSWORD,
    )


def query_rows(sql: str, parameters: Optional[dict] = None) -> list[dict]:
    client = get_client()
    result = client.query(sql, parameters=parameters or {})
    return [dict(zip(result.column_names, row)) for row in result.result_rows]


def query_one(sql: str, parameters: Optional[dict] = None) -> Optional[dict]:
    rows = query_rows(sql, parameters)
    return rows[0] if rows else None


def execute(sql: str, parameters: Optional[dict] = None) -> None:
    client = get_client()
    client.command(sql, parameters=parameters or {})


# ── App ───────────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Verify ClickHouse connectivity on startup
    try:
        client = get_client()
        client.command("SELECT 1")
    except Exception as exc:
        raise RuntimeError(f"ClickHouse unreachable at startup: {exc}") from exc
    yield


app = FastAPI(
    title="Tracklytics API",
    version="2.0.0",
    description="Analytics API for Tracklytics — powered by ClickHouse",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Schemas ───────────────────────────────────────────────────────────────────

class ETLTriggerRequest(BaseModel):
    week_number: int


class DimRecord(BaseModel):
    data: dict[str, Any]


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health", tags=["System"])
def health():
    try:
        client = get_client()
        client.command("SELECT 1")
        return {"status": "ok", "clickhouse": "reachable"}
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"ClickHouse unreachable: {exc}")


# ── ETL ───────────────────────────────────────────────────────────────────────

@app.get("/etl/logs", tags=["ETL"])
def etl_logs(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=200),
):
    offset = (page - 1) * limit
    rows = query_rows(
        """
        SELECT
            log_id,
            run_timestamp,
            week_number,
            status,
            records_read,
            records_inserted,
            records_rejected,
            duration_seconds
        FROM ETL_LOGS
        ORDER BY run_timestamp DESC
        LIMIT {limit:UInt32}
        OFFSET {offset:UInt32}
        """,
        {"limit": limit, "offset": offset},
    )
    total = query_one("SELECT count() AS n FROM ETL_LOGS")["n"]
    return {"data": rows, "page": page, "limit": limit, "total": total}


@app.get("/etl/status", tags=["ETL"])
def etl_status():
    row = query_one(
        """
        SELECT
            log_id,
            run_timestamp,
            week_number,
            status,
            records_read,
            records_inserted,
            records_rejected,
            duration_seconds
        FROM ETL_LOGS
        ORDER BY run_timestamp DESC
        LIMIT 1
        """
    )
    if not row:
        raise HTTPException(status_code=404, detail="No ETL runs found")
    return row


def _truncate_fact_tables() -> None:
    for table in ("FACT_TRACKS", "ETL_BATCH_CONTROL"):
        try:
            execute(f"TRUNCATE TABLE {table}")
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Error truncando {table}: {exc}")


@app.post("/etl/clear", tags=["ETL"])
def etl_clear():
    _truncate_fact_tables()
    return {"status": "cleared"}


@app.post("/etl/trigger", tags=["ETL"], status_code=202)
async def etl_trigger(body: ETLTriggerRequest):
    _truncate_fact_tables()

    payload = {"conf": {"week_number": body.week_number}}
    url = f"{AIRFLOW_URL}/api/v1/dags/{AIRFLOW_DAG}/dagRuns"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                url,
                json=payload,
                auth=(AIRFLOW_USER, AIRFLOW_PASS),
            )
        if resp.status_code not in (200, 201):
            raise HTTPException(
                status_code=resp.status_code,
                detail=f"Airflow error: {resp.text}",
            )
        return {"message": "DAG run triggered", "week_number": body.week_number, "airflow": resp.json()}
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"Cannot reach Airflow: {exc}")


@app.get("/etl/run-status", tags=["ETL"])
async def etl_run_status(run_id: str = Query(..., description="Airflow dag_run_id")):
    url = f"{AIRFLOW_URL}/api/v1/dags/{AIRFLOW_DAG}/dagRuns/{run_id}"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, auth=(AIRFLOW_USER, AIRFLOW_PASS))
        if resp.status_code == 404:
            raise HTTPException(status_code=404, detail="DAG run not found")
        if not resp.is_success:
            raise HTTPException(status_code=resp.status_code, detail=f"Airflow error: {resp.text}")
        data = resp.json()
        return {"run_id": run_id, "state": data.get("state")}
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"Cannot reach Airflow: {exc}")


# ── Genres ────────────────────────────────────────────────────────────────────

@app.get("/genres/trends", tags=["Genres"])
def genres_trends(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=500),
):
    offset = (page - 1) * limit
    rows = query_rows(
        """
        SELECT
            g.genre_id                      AS genre_id,
            g.name                          AS name,
            round(avg(ft.popularity), 2)    AS avg_popularity,
            count()                         AS track_count,
            round(avg(ft.energy), 4)        AS avg_energy,
            round(avg(ft.danceability), 4)  AS avg_danceability,
            round(avg(ft.valence), 4)       AS avg_valence
        FROM FACT_TRACKS ft
        JOIN DIM_GENRES g ON ft.genre_id = g.genre_id
        GROUP BY g.genre_id, g.name
        ORDER BY track_count DESC
        LIMIT {limit:UInt32}
        OFFSET {offset:UInt32}
        """,
        {"limit": limit, "offset": offset},
    )
    total = query_one("SELECT uniq(genre_id) AS n FROM FACT_TRACKS")["n"]
    return {"data": rows, "page": page, "limit": limit, "total": total}


@app.get("/genres/{genre_id}/audio-profile", tags=["Genres"])
def genre_audio_profile(genre_id: int = Path(..., ge=1)):
    row = query_one(
        """
        SELECT
            g.genre_id                      AS genre_id,
            g.name                          AS name,
            round(avg(ft.danceability),  4) AS danceability,
            round(avg(ft.energy),        4) AS energy,
            round(avg(ft.speechiness),   4) AS speechiness,
            round(avg(ft.acousticness),  4) AS acousticness,
            round(avg(ft.instrumentalness), 4) AS instrumentalness,
            round(avg(ft.liveness),      4) AS liveness,
            round(avg(ft.valence),       4) AS valence,
            round(avg(ft.tempo),         2) AS avg_tempo,
            round(avg(ft.loudness),      2) AS avg_loudness
        FROM FACT_TRACKS ft
        JOIN DIM_GENRES g ON ft.genre_id = g.genre_id
        WHERE g.genre_id = {genre_id:Int32}
        GROUP BY g.genre_id, g.name
        """,
        {"genre_id": genre_id},
    )
    if not row:
        raise HTTPException(status_code=404, detail="Genre not found")
    return row


# ── Artists ───────────────────────────────────────────────────────────────────

@app.get("/artists/search", tags=["Artists"])
def artists_search(
    name: str = Query(..., min_length=1),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
):
    offset = (page - 1) * limit
    pattern = f"%{name}%"
    rows = query_rows(
        """
        SELECT artist_id, name
        FROM DIM_ARTISTS
        WHERE lower(name) LIKE lower({pattern:String})
        ORDER BY name
        LIMIT {limit:UInt32}
        OFFSET {offset:UInt32}
        """,
        {"pattern": pattern, "limit": limit, "offset": offset},
    )
    total_row = query_one(
        "SELECT count() AS n FROM DIM_ARTISTS WHERE lower(name) LIKE lower({pattern:String})",
        {"pattern": pattern},
    )
    return {"data": rows, "page": page, "limit": limit, "total": total_row["n"]}


@app.get("/artists/{artist_id}/stats", tags=["Artists"])
def artist_stats(artist_id: int = Path(..., ge=1)):
    artist = query_one(
        """
        SELECT
            a.artist_id                      AS artist_id,
            a.name                           AS name,
            count()                          AS track_count,
            round(avg(ft.popularity),   2)   AS avg_popularity,
            round(avg(ft.energy),       4)   AS avg_energy,
            round(avg(ft.danceability), 4)   AS avg_danceability,
            round(avg(ft.valence),      4)   AS avg_valence,
            countIf(ft.explicit_id = 1)      AS explicit_count
        FROM FACT_TRACKS ft
        JOIN DIM_ARTISTS a ON ft.artist_id = a.artist_id
        WHERE a.artist_id = {artist_id:Int32}
        GROUP BY a.artist_id, a.name
        """,
        {"artist_id": artist_id},
    )
    if not artist:
        raise HTTPException(status_code=404, detail="Artist not found")

    # Genre benchmark: avg popularity of genres this artist appears in
    genre_bench = query_rows(
        """
        SELECT
            g.name                        AS name,
            round(avg(ft2.popularity), 2) AS genre_avg_popularity
        FROM FACT_TRACKS ft
        JOIN DIM_ARTISTS a   ON ft.artist_id  = a.artist_id
        JOIN DIM_GENRES  g   ON ft.genre_id   = g.genre_id
        JOIN FACT_TRACKS ft2 ON ft2.genre_id  = g.genre_id
        WHERE a.artist_id = {artist_id:Int32}
        GROUP BY g.name
        ORDER BY genre_avg_popularity DESC
        """,
        {"artist_id": artist_id},
    )
    artist["genre_benchmarks"] = genre_bench
    return artist


# ── Dashboard ─────────────────────────────────────────────────────────────────

@app.get("/dashboard/executive", tags=["Dashboard"])
def dashboard_executive():
    total_tracks   = query_one("SELECT count() AS n FROM FACT_TRACKS")["n"]
    total_artists  = query_one("SELECT count() AS n FROM DIM_ARTISTS")["n"]
    total_genres   = query_one("SELECT count() AS n FROM DIM_GENRES")["n"]

    audio_avg = query_one(
        """
        SELECT
            round(avg(popularity),   2) AS avg_popularity,
            round(avg(energy),       4) AS avg_energy,
            round(avg(danceability), 4) AS avg_danceability,
            round(avg(valence),      4) AS avg_valence,
            round(avg(tempo),        2) AS avg_tempo
        FROM FACT_TRACKS
        """
    )

    top_genres = query_rows(
        """
        SELECT g.name AS name, count() AS track_count
        FROM FACT_TRACKS ft
        JOIN DIM_GENRES g ON ft.genre_id = g.genre_id
        GROUP BY g.name
        ORDER BY track_count DESC
        LIMIT 10
        """
    )

    top_artists = query_rows(
        """
        SELECT a.name                          AS name,
               count()                         AS track_count,
               round(avg(ft.popularity), 2)    AS avg_popularity
        FROM FACT_TRACKS ft
        JOIN DIM_ARTISTS a ON ft.artist_id = a.artist_id
        GROUP BY a.name
        ORDER BY track_count DESC
        LIMIT 10
        """
    )

    etl_last = query_one(
        """
        SELECT status, run_timestamp, records_inserted
        FROM ETL_LOGS
        ORDER BY run_timestamp DESC
        LIMIT 1
        """
    )

    explicit_dist = query_rows(
        """
        SELECT e.label AS explicit_label, count() AS track_count
        FROM FACT_TRACKS ft
        JOIN DIM_EXPLICIT_TYPE e ON ft.explicit_id = e.explicit_id
        GROUP BY e.label
        """
    )

    return {
        "totals": {
            "tracks":  total_tracks,
            "artists": total_artists,
            "genres":  total_genres,
        },
        "audio_averages":    audio_avg,
        "top_genres":        top_genres,
        "top_artists":       top_artists,
        "last_etl":          etl_last,
        "explicit_distribution": explicit_dist,
    }


# ── FACT_TRACKS (read-only) ───────────────────────────────────────────────────

@app.get("/facts", tags=["Facts"])
def facts_list(
    page:   int = Query(1,  ge=1),
    limit:  int = Query(50, ge=1, le=500),
    search: Optional[str] = Query(None),
):
    offset = (page - 1) * limit
    params: dict = {"limit": limit, "offset": offset}
    where = ""

    if search and search.strip():
        where = "WHERE position(lower(track_name), lower({search:String})) > 0"
        params["search"] = search.strip()

    rows = query_rows(
        f"""
        SELECT
            fact_id, track_id, track_name, artist_id, album_id, genre_id,
            popularity, duration_ms, danceability, energy, loudness,
            speechiness, acousticness, instrumentalness, liveness, valence,
            tempo, load_week, is_synthetic, inserted_at
        FROM FACT_TRACKS
        {where}
        ORDER BY fact_id
        LIMIT {{limit:UInt32}}
        OFFSET {{offset:UInt32}}
        """,
        params,
    )
    total = query_one(f"SELECT count() AS n FROM FACT_TRACKS {where}", params)["n"]
    return {"data": rows, "page": page, "limit": limit, "total": total}


# ── Generic DIM CRUD ──────────────────────────────────────────────────────────

def _resolve_table(table: str) -> str:
    """Map URL slug to actual ClickHouse table name."""
    resolved = DIM_TABLES.get(table)
    if not resolved:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown dimension table '{table}'. Valid options: {list(DIM_TABLES)}",
        )
    return resolved


def _get_pk_column(ch_table: str) -> str:
    """Return the first column of the table (assumed to be the PK)."""
    row = query_one(
        f"SELECT name FROM system.columns WHERE database = '{CH_DB}' AND table = '{ch_table}' ORDER BY position LIMIT 1"
    )
    if not row:
        raise HTTPException(status_code=500, detail=f"Cannot resolve PK for {ch_table}")
    return row["name"]


@app.get("/dim/{table}", tags=["Dimensions"])
def dim_list(
    table: str,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=500),
    search: Optional[str] = Query(None),
):
    ch_table = _resolve_table(table)
    offset   = (page - 1) * limit
    params: dict = {"limit": limit, "offset": offset}
    where = ""

    if search and search.strip():
        str_cols = query_rows(
            f"SELECT name FROM system.columns "
            f"WHERE database = '{CH_DB}' AND table = '{ch_table}' AND type = 'String' "
            f"ORDER BY position"
        )
        if str_cols:
            conditions = " OR ".join(
                f"position(lower({col['name']}), lower({{search:String}})) > 0"
                for col in str_cols
            )
            where = f"WHERE {conditions}"
            params["search"] = search.strip()

    rows = query_rows(
        f"SELECT * FROM {ch_table} {where} ORDER BY 1 LIMIT {{limit:UInt32}} OFFSET {{offset:UInt32}}",
        params,
    )
    total = query_one(f"SELECT count() AS n FROM {ch_table} {where}", params)["n"]
    return {"data": rows, "page": page, "limit": limit, "total": total}


@app.get("/dim/{table}/{record_id}", tags=["Dimensions"])
def dim_get(table: str, record_id: int):
    ch_table = _resolve_table(table)
    pk = _get_pk_column(ch_table)
    row = query_one(
        f"SELECT * FROM {ch_table} WHERE {pk} = {{record_id:Int32}}",
        {"record_id": record_id},
    )
    if not row:
        raise HTTPException(status_code=404, detail="Record not found")
    return row


@app.post("/dim/{table}", tags=["Dimensions"], status_code=201)
def dim_create(table: str, body: DimRecord):
    ch_table = _resolve_table(table)
    if not body.data:
        raise HTTPException(status_code=422, detail="data must not be empty")
    cols   = ", ".join(body.data.keys())
    vals   = ", ".join(
        f"'{v}'" if isinstance(v, str) else str(v)
        for v in body.data.values()
    )
    try:
        execute(f"INSERT INTO {ch_table} ({cols}) VALUES ({vals})")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"message": "Record created", "data": body.data}


@app.put("/dim/{table}/{record_id}", tags=["Dimensions"])
def dim_update(table: str, record_id: int, body: DimRecord):
    ch_table = _resolve_table(table)
    pk = _get_pk_column(ch_table)
    if not body.data:
        raise HTTPException(status_code=422, detail="data must not be empty")
    assignments = ", ".join(
        f"{k} = '{v}'" if isinstance(v, str) else f"{k} = {v}"
        for k, v in body.data.items()
        if k != pk
    )
    if not assignments:
        raise HTTPException(status_code=422, detail="No updatable fields provided")
    try:
        execute(
            f"ALTER TABLE {ch_table} UPDATE {assignments} WHERE {pk} = {record_id}"
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"message": "Record updated", "id": record_id}


@app.delete("/dim/{table}/{record_id}", tags=["Dimensions"], status_code=204)
def dim_delete(table: str, record_id: int):
    ch_table = _resolve_table(table)
    pk = _get_pk_column(ch_table)
    try:
        execute(f"ALTER TABLE {ch_table} DELETE WHERE {pk} = {record_id}")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
