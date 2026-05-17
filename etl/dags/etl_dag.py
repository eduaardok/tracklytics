"""
Tracklytics v2 — ETL DAG  (lógica no-acumulativa)

Dado week_number = N, el DAG arranca con FACT_TRACKS limpia (el API ya hizo TRUNCATE)
y carga todos los datos correspondientes a N semanas:
  Semana 1  → 113,550 registros reales de PocketBase
  Semana 2  → 100,000 sintéticos (seed=84)
  Semana k  → 100,000 sintéticos (seed=k*42)
  ...
  Semana N  → 100,000 sintéticos (seed=N*42)
Total: 113,550 + (N-1) × 100,000

Pipeline:
  extract_pocketbase → write_parquet → load_to_staging
  → populate_dims → populate_fact → log_etl → cleanup
"""

import hashlib
import json
import math
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta

import httpx
import numpy as np
import pandas as pd
import pyarrow.parquet as pq

import clickhouse_connect
from airflow import DAG
from airflow.models.param import Param
from airflow.operators.python import PythonOperator


# ── Helpers ───────────────────────────────────────────────────────────────────

def _cfg() -> dict:
    return {
        "pb_url":      os.getenv("POCKETBASE_URL", "http://pocketbase:8090"),
        "pb_email":    os.getenv("POCKETBASE_EMAIL"),
        "pb_pass":     os.getenv("POCKETBASE_PASSWORD"),
        "pb_coll":     os.getenv("POCKETBASE_COLLECTION", "spotify_tracks"),
        "ch_host":     os.getenv("CLICKHOUSE_HOST", "clickhouse"),
        "ch_port":     int(os.getenv("CLICKHOUSE_PORT", 8123)),
        "ch_db":       os.getenv("CLICKHOUSE_DB", "tracklytics"),
        "ch_user":     os.getenv("CLICKHOUSE_USER", "default"),
        "ch_pass":     os.getenv("CLICKHOUSE_PASSWORD", ""),
        "parquet_dir": os.getenv("PARQUET_DIR", "/app/parquet_stage"),
    }


def _ch(cfg: dict):
    return clickhouse_connect.get_client(
        host=cfg["ch_host"],
        port=cfg["ch_port"],
        database=cfg["ch_db"],
        username=cfg["ch_user"],
        password=cfg["ch_pass"],
    )


def _scalar(client, sql: str, params: dict | None = None):
    result = client.query(sql, parameters=params or {})
    rows = result.result_rows
    return rows[0][0] if rows else None


def _get_week(context) -> int:
    conf = (context.get("dag_run") and context["dag_run"].conf) or {}
    val  = conf.get("week_number")
    if val is not None:
        return int(val)
    return int(os.getenv("WEEK_NUMBER", 1))


def _pb_token(cfg: dict) -> str:
    resp = httpx.post(
        f"{cfg['pb_url']}/api/collections/_superusers/auth-with-password",
        json={"identity": cfg["pb_email"], "password": cfg["pb_pass"]},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["token"]


def _pop_range(pop: int) -> int:
    if pop <= 33:   return 1
    elif pop <= 66: return 2
    else:           return 3


def _tempo_range(bpm: float) -> int:
    if bpm < 90:    return 1
    elif bpm < 120: return 2
    elif bpm < 150: return 3
    else:           return 4


def _energy_level(e: float) -> int:
    if e <= 0.33:   return 1
    elif e <= 0.66: return 2
    else:           return 3


# Vocabulario para nombres de tracks sintéticos (reemplaza Faker.catch_phrase)
_CATCH_W1 = np.array([
    "Adaptive", "Advanced", "Automated", "Balanced", "Centralized", "Compatible",
    "Configurable", "Cross-platform", "Customer-focused", "Customizable", "Devolved",
    "Digitized", "Distributed", "Down-sized", "Enhanced", "Enterprise-wide", "Ergonomic",
    "Exclusive", "Expanded", "Extended", "Focused", "Front-line", "Function-based",
    "Fundamental", "Innovative", "Integrated", "Intuitive", "Managed", "Monitored",
    "Multi-layered", "Networked", "Object-based", "Open-architected", "Open-source",
    "Optimized", "Organic", "Organized", "Persistent", "Phased", "Proactive",
    "Progressive", "Quality-focused", "Re-engineered", "Reduced", "Robust", "Seamless",
    "Secured", "Sharable", "Stand-alone", "Streamlined", "Synchronised", "Synergistic",
    "Team-oriented", "Universal", "Upgradeable", "User-centric", "User-friendly",
    "Versatile", "Virtual", "Visionary",
])
_CATCH_W2 = np.array([
    "analyzing", "asynchronous", "bifurcated", "client-driven", "client-focused",
    "coherent", "composite", "context-sensitive", "dedicated", "demand-driven", "dynamic",
    "empowering", "even-keeled", "fault-tolerant", "fresh-thinking", "full-range",
    "global", "high-level", "holistic", "human-resource", "hybrid", "impactful",
    "incremental", "interactive", "leading edge", "local", "logistical", "maximized",
    "methodical", "mission-critical", "mobile", "modular", "motivating", "multi-tasking",
    "neutral", "next generation", "object-oriented", "optimal", "optimizing", "real-time",
    "reciprocal", "regional", "responsive", "scalable", "stable", "systematic",
    "transitional", "uniform", "user-facing", "value-added", "web-enabled", "zero defect",
])
_CATCH_W3 = np.array([
    "ability", "access", "adapter", "algorithm", "alliance", "analyzer", "application",
    "approach", "architecture", "array", "benchmark", "capability", "capacity",
    "challenge", "circuit", "collaboration", "complexity", "concept", "contingency",
    "core", "database", "definition", "emulation", "encoding", "encryption", "firmware",
    "flexibility", "forecast", "framework", "function", "functionalities", "groupware",
    "hardware", "hierarchy", "hub", "implementation", "infrastructure", "initiative",
    "interface", "intranet", "knowledge base", "leverage", "matrix", "methodology",
    "middleware", "migration", "model", "monitoring", "open system", "orchestration",
    "paradigm", "policy", "portal", "pricing structure", "process improvement", "product",
    "productivity", "project", "protocol", "software", "solution", "standardization",
    "strategy", "structure", "success", "support", "synergy", "system engine",
    "throughput", "toolset", "utilization", "website", "workforce",
])


# ── Task 1: extract_pocketbase ────────────────────────────────────────────────

def extract_pocketbase(**context):
    cfg      = _cfg()
    week     = _get_week(context)
    per_page = 1000
    print(f"[extract_pocketbase] week_number={week} — cargando semanas 1 a {week}")

    token   = _pb_token(cfg)
    headers = {"Authorization": f"Bearer {token}"}
    base_url = f"{cfg['pb_url']}/api/collections/{cfg['pb_coll']}/records"

    # 1. Obtener total de registros con una request ligera
    resp = httpx.get(base_url,
                     params={"page": 1, "perPage": 1, "skipTotal": "false"},
                     headers=headers, timeout=30)
    resp.raise_for_status()
    total = resp.json().get("totalItems", 0)
    pages = math.ceil(total / per_page)
    print(f"[extract_pocketbase] {total} registros — {pages} páginas (perPage={per_page})")

    # 2. Función que descarga una sola página
    def fetch_page(page: int) -> tuple[int, list]:
        r = httpx.get(base_url,
                      params={"page": page, "perPage": per_page, "skipTotal": "true"},
                      headers=headers, timeout=60)
        r.raise_for_status()
        items = r.json().get("items", [])
        print(f"[extract_pocketbase] página {page}/{pages} — {len(items)} items")
        return page, items

    # 3. Descarga paralela con hasta 10 workers simultáneos
    results: dict[int, list] = {}
    with ThreadPoolExecutor(max_workers=10) as pool:
        futures = {pool.submit(fetch_page, p): p for p in range(1, pages + 1)}
        for future in as_completed(futures):
            page_num, items = future.result()
            results[page_num] = items

    # 4. Combinar en orden de página para reproducibilidad
    records = []
    for p in range(1, pages + 1):
        records.extend(results[p])

    os.makedirs(cfg["parquet_dir"], exist_ok=True)
    raw_path = f"{cfg['parquet_dir']}/raw_week_{week}.json"
    with open(raw_path, "w") as fh:
        json.dump(records, fh)

    context["ti"].xcom_push(key="week_number",  value=week)
    context["ti"].xcom_push(key="raw_path",     value=raw_path)
    context["ti"].xcom_push(key="records_read", value=len(records))
    context["ti"].xcom_push(key="etl_start_ts", value=datetime.utcnow().isoformat())


# ── Task 2: write_parquet ─────────────────────────────────────────────────────

def write_parquet(**context):
    cfg      = _cfg()
    week     = context["ti"].xcom_pull(task_ids="extract_pocketbase", key="week_number")
    raw_path = context["ti"].xcom_pull(task_ids="extract_pocketbase", key="raw_path")

    with open(raw_path, "r") as fh:
        records = json.load(fh)

    def _bool_to_int(v) -> int:
        if isinstance(v, bool):
            return int(v)
        return 1 if str(v).strip().lower() in ("true", "1") else 0

    rows = []
    for r in records:
        rows.append({
            "track_id":         str(r.get("track_id") or r.get("id", "")),
            "artists":          str(r.get("artists", "")),
            "album_name":       str(r.get("album_name", "")),
            "track_name":       str(r.get("track_name", "")),
            "popularity":       int(r.get("popularity", 0)),
            "duration_ms":      int(r.get("duration_ms", 0)),
            "explicit":         _bool_to_int(r.get("explicit", 0)),
            "danceability":     float(r.get("danceability", 0.0)),
            "energy":           float(r.get("energy", 0.0)),
            "key":              int(r.get("key", 0)),
            "loudness":         float(r.get("loudness", 0.0)),
            "mode":             int(r.get("mode", 0)),
            "speechiness":      float(r.get("speechiness", 0.0)),
            "acousticness":     float(r.get("acousticness", 0.0)),
            "instrumentalness": float(r.get("instrumentalness", 0.0)),
            "liveness":         float(r.get("liveness", 0.0)),
            "valence":          float(r.get("valence", 0.0)),
            "tempo":            float(r.get("tempo", 0.0)),
            "time_signature":   int(r.get("time_signature", 4)),
            "track_genre":      str(r.get("track_genre", "")),
        })

    df = pd.DataFrame(rows)
    parquet_path = f"{cfg['parquet_dir']}/week_{week}.parquet"
    df.to_parquet(parquet_path, index=False, engine="pyarrow")
    os.remove(raw_path)
    context["ti"].xcom_push(key="parquet_path", value=parquet_path)


# ── Task 3: load_to_staging ───────────────────────────────────────────────────

def load_to_staging(**context):
    """Carga los registros reales en STG_RAW_TRACKS (siempre fresco)."""
    cfg          = _cfg()
    client       = _ch(cfg)
    parquet_path = context["ti"].xcom_pull(task_ids="write_parquet", key="parquet_path")

    # STG_RAW_TRACKS se limpió en cleanup del run anterior; la limpiamos aquí
    # por si el DAG anterior falló antes del cleanup.
    client.command("TRUNCATE TABLE STG_RAW_TRACKS")

    df = pd.read_parquet(parquet_path)
    for start in range(0, len(df), 50_000):
        client.insert_df("STG_RAW_TRACKS", df.iloc[start:start + 50_000])

    context["ti"].xcom_push(key="staging_count", value=len(df))


# ── Task 4: populate_dims ─────────────────────────────────────────────────────

def populate_dims(**context):
    cfg    = _cfg()
    week   = context["ti"].xcom_pull(task_ids="extract_pocketbase", key="week_number")
    client = _ch(cfg)

    def _count(table: str) -> int:
        return _scalar(client, f"SELECT count() FROM {table}") or 0

    # ── DIM_MUSICAL_KEY ───────────────────────────────────────────────────────
    if _count("DIM_MUSICAL_KEY") == 0:
        client.insert(
            "DIM_MUSICAL_KEY",
            [
                (1,  0,  "Do",   "C",  "Neutral",     "Classical"),
                (2,  1,  "Do#",  "C#", "Mysterious",  "Jazz"),
                (3,  2,  "Re",   "D",  "Triumphant",  "Folk"),
                (4,  3,  "Re#",  "D#", "Dark",        "Metal"),
                (5,  4,  "Mi",   "E",  "Bright",      "Rock"),
                (6,  5,  "Fa",   "F",  "Humble",      "Gospel"),
                (7,  6,  "Fa#",  "F#", "Melancholic", "Blues"),
                (8,  7,  "Sol",  "G",  "Warm",        "Country"),
                (9,  8,  "Sol#", "G#", "Tense",       "Electronic"),
                (10, 9,  "La",   "A",  "Confident",   "Pop"),
                (11, 10, "La#",  "A#", "Cheerful",    "Reggae"),
                (12, 11, "Si",   "B",  "Passionate",  "R&B"),
            ],
            column_names=["key_id", "key_number", "key_name", "key_name_english",
                          "associated_mood", "common_genre"],
        )

    # ── DIM_MODE ──────────────────────────────────────────────────────────────
    if _count("DIM_MODE") == 0:
        client.insert(
            "DIM_MODE",
            [
                (1, 0, "Minor", "Sad / Serious",  "Dark music, noir",    "Descending intervals"),
                (2, 1, "Major", "Happy / Bright", "Pop, upbeat anthems", "Ascending intervals"),
            ],
            column_names=["mode_id", "mode_value", "mode_name", "emotional_quality",
                          "common_use", "theory_description"],
        )

    # ── DIM_TIME_SIGNATURE ────────────────────────────────────────────────────
    if _count("DIM_TIME_SIGNATURE") == 0:
        client.insert(
            "DIM_TIME_SIGNATURE",
            [
                (1, 1, "1/4", "Marching",    "Experimental",  "One beat per measure"),
                (2, 3, "3/4", "Waltz",       "Classical/Jazz", "Three beats per measure"),
                (3, 4, "4/4", "Common time", "Pop/Rock",       "Four beats per measure"),
                (4, 5, "5/4", "Complex",     "Progressive",    "Five beats per measure"),
            ],
            column_names=["time_signature_id", "value", "name", "feel",
                          "common_genre", "description"],
        )

    # ── DIM_EXPLICIT_TYPE ─────────────────────────────────────────────────────
    if _count("DIM_EXPLICIT_TYPE") == 0:
        client.insert(
            "DIM_EXPLICIT_TYPE",
            [
                (1, 0, "Clean",    "G / All Ages",  "Available everywhere",         "Broader audience reach"),
                (2, 1, "Explicit", "E / 18+ Label", "Restricted on some platforms", "Niche but loyal fans"),
            ],
            column_names=["explicit_id", "value", "label", "content_rating",
                          "platform_policy", "market_impact"],
        )

    # ── DIM_POPULARITY_RANGE ──────────────────────────────────────────────────
    if _count("DIM_POPULARITY_RANGE") == 0:
        client.insert(
            "DIM_POPULARITY_RANGE",
            [
                (1, "Low",    0,  33,  "Niche",      "Low streams"),
                (2, "Medium", 34, 66,  "Mainstream", "Moderate streams"),
                (3, "High",   67, 100, "Viral",      "High streams"),
            ],
            column_names=["range_id", "label", "min_value", "max_value",
                          "market_tier", "streaming_potential"],
        )

    # ── DIM_TEMPO_RANGE ───────────────────────────────────────────────────────
    if _count("DIM_TEMPO_RANGE") == 0:
        client.insert(
            "DIM_TEMPO_RANGE",
            [
                (1, "Slow",      0.0,   89.9,  "Ballad",    "Romantic, sleep"),
                (2, "Moderate",  90.0,  119.9, "Groove",    "Pop, soul"),
                (3, "Fast",      120.0, 149.9, "Energetic", "Dance, EDM"),
                (4, "Very Fast", 150.0, 999.0, "Intense",   "Metal, hardcore"),
            ],
            column_names=["range_id", "label", "min_bpm", "max_bpm",
                          "musical_feel", "typical_use"],
        )

    # ── DIM_ENERGY_LEVEL ──────────────────────────────────────────────────────
    if _count("DIM_ENERGY_LEVEL") == 0:
        client.insert(
            "DIM_ENERGY_LEVEL",
            [
                (1, "Low",    0.0,  0.33, "Relax",   "Calm, ambient"),
                (2, "Medium", 0.34, 0.66, "Focus",   "Work, study"),
                (3, "High",   0.67, 1.0,  "Workout", "Running, gym"),
            ],
            column_names=["level_id", "label", "min_value", "max_value",
                          "listener_context", "mood_association"],
        )

    # ── DIM_DATE: insertar una fila por cada semana 1..N ─────────────────────
    existing_weeks = {
        r[0]
        for r in (client.query("SELECT week_number FROM DIM_DATE").result_rows or [])
    }
    for w in range(1, week + 1):
        if w not in existing_weeks:
            academic_month = ((w - 1) // 4) + 1
            client.insert(
                "DIM_DATE",
                [(
                    w,
                    w,
                    date.today(),
                    "S1" if w <= 8 else "S2",
                    f"Semana {w}",
                    w == 1,
                    academic_month,
                )],
                column_names=["date_id", "week_number", "load_date", "semester",
                              "period_label", "is_initial_load", "academic_month"],
            )

    # ── DIM_GENRES ────────────────────────────────────────────────────────────
    if _count("DIM_GENRES") == 0:
        genres = [
            r[0]
            for r in client.query(
                "SELECT DISTINCT track_genre FROM STG_RAW_TRACKS "
                "WHERE track_genre != '' ORDER BY track_genre"
            ).result_rows
        ]
        if genres:
            client.insert(
                "DIM_GENRES",
                [(i, g, "", "", "", "Neutral", "") for i, g in enumerate(genres, 1)],
                column_names=["genre_id", "name", "parent_genre", "origin_decade",
                              "origin_region", "mood", "description"],
            )

    # ── DIM_ALBUMS ────────────────────────────────────────────────────────────
    if _count("DIM_ALBUMS") == 0:
        albums = [
            r[0]
            for r in client.query(
                "SELECT DISTINCT album_name FROM STG_RAW_TRACKS "
                "WHERE album_name != '' ORDER BY album_name"
            ).result_rows
        ]
        if albums:
            for start in range(0, len(albums), 50_000):
                batch = albums[start:start + 50_000]
                client.insert(
                    "DIM_ALBUMS",
                    [(start + i, name, 0, "Studio", 0, "", "")
                     for i, name in enumerate(batch, 1)],
                    column_names=["album_id", "name", "release_year", "album_type",
                                  "total_tracks_listed", "language", "label"],
                )

    # ── DIM_ARTISTS ───────────────────────────────────────────────────────────
    if _count("DIM_ARTISTS") == 0:
        raw_artists = [
            r[0]
            for r in client.query(
                "SELECT DISTINCT artists FROM STG_RAW_TRACKS WHERE artists != ''"
            ).result_rows
        ]
        unique_artists = sorted({
            a.strip()
            for cell in raw_artists
            for a in str(cell).split(";")
            if a.strip()
        })
        if unique_artists:
            for start in range(0, len(unique_artists), 50_000):
                batch = unique_artists[start:start + 50_000]
                client.insert(
                    "DIM_ARTISTS",
                    [(start + i, name, "", 0, "", "Solo", True)
                     for i, name in enumerate(batch, 1)],
                    column_names=["artist_id", "name", "country", "debut_year",
                                  "record_label", "artist_type", "active"],
                )


# ── Task 5: populate_fact ─────────────────────────────────────────────────────

_FACT_COLS = [
    "fact_id", "track_id", "track_name", "artist_id", "album_id", "genre_id",
    "date_id", "key_id", "mode_id", "time_signature_id", "explicit_id",
    "popularity_range_id", "tempo_range_id", "energy_level_id",
    "popularity", "duration_ms", "danceability", "energy", "loudness",
    "speechiness", "acousticness", "instrumentalness", "liveness", "valence",
    "tempo", "load_week", "is_synthetic",
]

_TS_MAP = {1: 1, 3: 2, 4: 3, 5: 4}


def _load_lookup(client, table: str, name_col: str, id_col: str) -> dict:
    rows = client.query(f"SELECT {name_col}, {id_col} FROM {table}").result_rows
    return {r[0]: r[1] for r in rows}


def _get_date_id(client, week: int) -> int:
    return int(_scalar(
        client,
        "SELECT date_id FROM DIM_DATE WHERE week_number = {w:UInt8}",
        {"w": week},
    ) or week)


def populate_fact(**context):
    cfg    = _cfg()
    week   = context["ti"].xcom_pull(task_ids="extract_pocketbase", key="week_number")
    client = _ch(cfg)

    genre_map  = _load_lookup(client, "DIM_GENRES",  "name", "genre_id")
    album_map  = _load_lookup(client, "DIM_ALBUMS",  "name", "album_id")
    artist_map = _load_lookup(client, "DIM_ARTISTS", "name", "artist_id")

    # FACT_TRACKS fue truncada por el API antes de arrancar el DAG
    next_id  = 1
    inserted = 0

    # ── Semana 1: datos reales de PocketBase (vectorizado) ───────────────────
    date_id_1 = _get_date_id(client, 1)
    stg_df    = client.query_df("SELECT * FROM STG_RAW_TRACKS")
    n_real    = len(stg_df)

    pop_arr    = stg_df["popularity"].to_numpy(dtype=np.int32)
    tempo_arr  = stg_df["tempo"].to_numpy(dtype=np.float32)
    energy_arr = stg_df["energy"].to_numpy(dtype=np.float32)

    real_df = pd.DataFrame({
        "fact_id":             np.arange(next_id, next_id + n_real, dtype=np.int64),
        "track_id":            stg_df["track_id"].astype(str),
        "track_name":          stg_df["track_name"].astype(str),
        "artist_id":           stg_df["artists"].astype(str).str.split(";").str[0].str.strip()
                               .map(artist_map).fillna(1).astype(np.int64),
        "album_id":            stg_df["album_name"].astype(str).map(album_map).fillna(1).astype(np.int64),
        "genre_id":            stg_df["track_genre"].astype(str).map(genre_map).fillna(1).astype(np.int64),
        "date_id":             date_id_1,
        "key_id":              stg_df["key"].astype(int) + 1,
        "mode_id":             stg_df["mode"].astype(int) + 1,
        "time_signature_id":   stg_df["time_signature"].astype(int).map(_TS_MAP).fillna(3).astype(int),
        "explicit_id":         stg_df["explicit"].astype(int) + 1,
        "popularity_range_id": np.where(pop_arr <= 33, 1, np.where(pop_arr <= 66, 2, 3)),
        "tempo_range_id":      np.where(tempo_arr < 90, 1, np.where(tempo_arr < 120, 2,
                               np.where(tempo_arr < 150, 3, 4))),
        "energy_level_id":     np.where(energy_arr <= 0.33, 1, np.where(energy_arr <= 0.66, 2, 3)),
        "popularity":          pop_arr,
        "duration_ms":         stg_df["duration_ms"].astype(int),
        "danceability":        stg_df["danceability"].astype(float),
        "energy":              energy_arr,
        "loudness":            stg_df["loudness"].astype(float),
        "speechiness":         stg_df["speechiness"].astype(float),
        "acousticness":        stg_df["acousticness"].astype(float),
        "instrumentalness":    stg_df["instrumentalness"].astype(float),
        "liveness":            stg_df["liveness"].astype(float),
        "valence":             stg_df["valence"].astype(float),
        "tempo":               tempo_arr,
        "load_week":           1,
        "is_synthetic":        False,
    })

    for start in range(0, n_real, 50_000):
        client.insert_df("FACT_TRACKS", real_df.iloc[start:start + 50_000])

    next_id  += n_real
    inserted += n_real
    print(f"[populate_fact] Semana 1: {n_real} registros reales insertados")

    # ── Semanas 2..N: datos sintéticos (100k por semana) ─────────────────────
    for syn_week in range(2, week + 1):
        syn_date_id = _get_date_id(client, syn_week)
        syn_df      = _generate_synthetic(
            syn_week, next_id, syn_date_id, artist_map, album_map, genre_map
        )
        for start in range(0, len(syn_df), 50_000):
            client.insert_df("FACT_TRACKS", syn_df.iloc[start:start + 50_000])
        next_id  += len(syn_df)
        inserted += len(syn_df)
        print(f"[populate_fact] Semana {syn_week}: {len(syn_df)} registros sintéticos")

    context["ti"].xcom_push(key="inserted_count", value=inserted)
    print(f"[populate_fact] Total insertado: {inserted} registros en {week} semana(s)")


def _generate_synthetic(
    week: int,
    start_id: int,
    date_id: int,
    artist_map: dict,
    album_map: dict,
    genre_map: dict,
) -> pd.DataFrame:
    rng = np.random.default_rng(week * 42)

    n          = 100_000
    artist_ids = np.array(list(artist_map.values()), dtype=np.int64)
    album_ids  = np.array(list(album_map.values()),  dtype=np.int64)
    genre_ids  = np.array(list(genre_map.values()),  dtype=np.int64)

    pops      = rng.integers(0,       101,      n, dtype=np.int32)
    tempos    = rng.uniform(60,       200,      n).astype(np.float32)
    energies  = rng.uniform(0,        1,        n).astype(np.float32)
    dance     = rng.uniform(0,        1,        n).astype(np.float32)
    loud      = rng.uniform(-20,      0,        n).astype(np.float32)
    speech    = rng.uniform(0,        1,        n).astype(np.float32)
    acoust    = rng.uniform(0,        1,        n).astype(np.float32)
    instrum   = rng.uniform(0,        1,        n).astype(np.float32)
    livenes   = rng.uniform(0,        1,        n).astype(np.float32)
    valence   = rng.uniform(0,        1,        n).astype(np.float32)
    durations = rng.integers(120_000, 420_001,  n)
    keys_arr  = rng.integers(1,       13,       n)
    modes_arr = rng.integers(1,       3,        n)
    ts_ids    = rng.choice([1, 2, 3, 4],        n)
    exp_ids   = rng.integers(1,       3,        n)
    a_ids     = rng.choice(artist_ids,          n)
    al_ids    = rng.choice(album_ids,           n)
    g_ids     = rng.choice(genre_ids,           n)

    # Nombres de tracks: combinación de 3 arrays de palabras (sin Faker)
    w1 = _CATCH_W1[rng.integers(0, len(_CATCH_W1), n)]
    w2 = _CATCH_W2[rng.integers(0, len(_CATCH_W2), n)]
    w3 = _CATCH_W3[rng.integers(0, len(_CATCH_W3), n)]
    track_names = np.char.add(np.char.add(w1, " "), np.char.add(w2, np.char.add(" ", w3)))

    return pd.DataFrame({
        "fact_id":             np.arange(start_id, start_id + n, dtype=np.int64),
        "track_id":            [f"syn_{week}_{i:06d}" for i in range(n)],
        "track_name":          track_names,
        "artist_id":           a_ids,
        "album_id":            al_ids,
        "genre_id":            g_ids,
        "date_id":             date_id,
        "key_id":              keys_arr,
        "mode_id":             modes_arr,
        "time_signature_id":   ts_ids,
        "explicit_id":         exp_ids,
        "popularity_range_id": np.where(pops <= 33, 1, np.where(pops <= 66, 2, 3)),
        "tempo_range_id":      np.where(tempos < 90, 1, np.where(tempos < 120, 2,
                               np.where(tempos < 150, 3, 4))),
        "energy_level_id":     np.where(energies <= 0.33, 1, np.where(energies <= 0.66, 2, 3)),
        "popularity":          pops,
        "duration_ms":         durations,
        "danceability":        dance,
        "energy":              energies,
        "loudness":            loud,
        "speechiness":         speech,
        "acousticness":        acoust,
        "instrumentalness":    instrum,
        "liveness":            livenes,
        "valence":             valence,
        "tempo":               tempos,
        "load_week":           week,
        "is_synthetic":        True,
    })


# ── Task 6: log_etl ───────────────────────────────────────────────────────────

def log_etl(**context):
    cfg    = _cfg()
    week   = context["ti"].xcom_pull(task_ids="extract_pocketbase", key="week_number")
    client = _ch(cfg)

    records_read   = context["ti"].xcom_pull(task_ids="extract_pocketbase", key="records_read")   or 0
    inserted_count = context["ti"].xcom_pull(task_ids="populate_fact",      key="inserted_count") or 0

    start_ts_str = context["ti"].xcom_pull(task_ids="extract_pocketbase", key="etl_start_ts")
    duration = 0.0
    if start_ts_str:
        duration = (datetime.utcnow() - datetime.fromisoformat(start_ts_str)).total_seconds()

    next_log_id = int(_scalar(client, "SELECT max(log_id) FROM ETL_LOGS") or 0) + 1
    client.insert(
        "ETL_LOGS",
        [(next_log_id, week, records_read, inserted_count, 0, duration, "success")],
        column_names=["log_id", "week_number", "records_read", "records_inserted",
                      "records_rejected", "duration_seconds", "status"],
    )

    checksum      = hashlib.md5(f"{week}:{records_read}:{inserted_count}".encode()).hexdigest()
    next_batch_id = int(_scalar(client, "SELECT max(batch_id) FROM ETL_BATCH_CONTROL") or 0) + 1
    client.insert(
        "ETL_BATCH_CONTROL",
        [(next_batch_id, week, inserted_count, checksum)],
        column_names=["batch_id", "week_number", "record_count", "checksum"],
    )


# ── Task 7: cleanup ───────────────────────────────────────────────────────────

def cleanup(**context):
    client = _ch(_cfg())
    week   = context["ti"].xcom_pull(task_ids="extract_pocketbase", key="week_number")
    parquet_path = context["ti"].xcom_pull(task_ids="write_parquet", key="parquet_path")

    client.command("TRUNCATE TABLE STG_RAW_TRACKS")

    if parquet_path and os.path.exists(parquet_path):
        os.remove(parquet_path)

    print(f"[cleanup] Staging limpiado. Semanas 1-{week} cargadas correctamente.")


# ── DAG ───────────────────────────────────────────────────────────────────────

with DAG(
    dag_id="tracklytics_etl",
    description="PocketBase → ClickHouse: carga no-acumulativa de N semanas",
    default_args={
        "owner":       "tracklytics",
        "retries":     1,
        "retry_delay": timedelta(minutes=5),
    },
    start_date=datetime(2026, 5, 14),
    schedule_interval=None,
    catchup=False,
    tags=["tracklytics", "etl"],
    params={
        "week_number": Param(
            default=1,
            type="integer",
            minimum=1,
            maximum=16,
            description="Semanas a cargar (1-16). "
                        "Semana 1 = solo reales. Semana N = reales + (N-1)×100k sintéticos.",
        ),
    },
) as dag:

    t1 = PythonOperator(task_id="extract_pocketbase", python_callable=extract_pocketbase,
                        do_xcom_push=False)
    t2 = PythonOperator(task_id="write_parquet",      python_callable=write_parquet,
                        do_xcom_push=False)
    t3 = PythonOperator(task_id="load_to_staging",    python_callable=load_to_staging)
    t4 = PythonOperator(task_id="populate_dims",      python_callable=populate_dims)
    t5 = PythonOperator(task_id="populate_fact",      python_callable=populate_fact)
    t6 = PythonOperator(task_id="log_etl",            python_callable=log_etl)
    t7 = PythonOperator(task_id="cleanup",            python_callable=cleanup)

    t1 >> t2 >> t3 >> t4 >> t5 >> t6 >> t7
