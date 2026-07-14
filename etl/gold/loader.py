"""Capa Gold: carga del modelo dimensional en ClickHouse.
Resuelve FKs, aplica idempotencia via ETL_BATCH_CONTROL,
genera datos sintéticos y registra métricas en ETL_LOGS."""

import hashlib
import os
from datetime import date, datetime

import numpy as np
import pandas as pd

from gold.enriquecimiento import asignar_country, asignar_release_year
from gold.portada import cargar_cache_portadas
from utils.clickhouse_client import get_client, get_date_id, load_lookup, scalar
from utils.config import get_config

_TS_MAP = {1: 1, 3: 2, 4: 3, 5: 4}


def run_gold(**context):
    """Pobla todas las dimensiones y carga los registros reales de la semana 1."""
    cfg    = get_config()
    week   = context["ti"].xcom_pull(task_ids="task_bronze", key="week_number")
    client = get_client(cfg)

    def _count(table: str) -> int:
        return scalar(client, f"SELECT count() FROM {table}") or 0

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
                (1, 1, "1/4", "Marching",    "Experimental",   "One beat per measure"),
                (2, 3, "3/4", "Waltz",       "Classical/Jazz",  "Three beats per measure"),
                (3, 4, "4/4", "Common time", "Pop/Rock",        "Four beats per measure"),
                (4, 5, "5/4", "Complex",     "Progressive",     "Five beats per measure"),
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

    # ── DIM_DATE: una fila por cada semana 1..N ───────────────────────────────
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
                    w, w, date.today(),
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
            r[0] for r in client.query(
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

    # Portadas ya resueltas en sesiones anteriores (etl/gold/portadas_cache.json,
    # fuera del volumen de ClickHouse — ver comentario en portada.py). Se
    # restauran aquí, en el propio INSERT masivo de creación, en vez de con
    # un UPDATE posterior: mucho más barato en ClickHouse (un INSERT vs. miles
    # de mutaciones ALTER UPDATE) y evita perder cobertura ya ganada tras un
    # `docker compose down -v` o una recarga a los ~113.550 registros reales.
    _cache = cargar_cache_portadas()

    # ── DIM_ALBUMS ────────────────────────────────────────────────────────────
    if _count("DIM_ALBUMS") == 0:
        albums = [
            r[0] for r in client.query(
                "SELECT DISTINCT album_name FROM STG_RAW_TRACKS "
                "WHERE album_name != '' ORDER BY album_name"
            ).result_rows
        ]
        if albums:
            for start in range(0, len(albums), 50_000):
                batch = albums[start:start + 50_000]
                client.insert(
                    "DIM_ALBUMS",
                    [(start + i, name, asignar_release_year(start + i), "Studio", 0, "", 0, _cache["albumes"].get(name))
                     for i, name in enumerate(batch, 1)],
                    column_names=["album_id", "name", "release_year", "album_type",
                                  "total_tracks_listed", "language", "sello_id", "imagen_url"],
                )

    # ── DIM_ARTISTS (split por ";") ───────────────────────────────────────────
    if _count("DIM_ARTISTS") == 0:
        raw_artists = [
            r[0] for r in client.query(
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
                    [(start + i, name, asignar_country(start + i), 0, "Solo", True, 0, _cache["artistas"].get(name))
                     for i, name in enumerate(batch, 1)],
                    column_names=["artist_id", "name", "country", "debut_year",
                                  "artist_type", "active", "sello_id", "imagen_url"],
                )

    # ── FACT_TRACKS: registros reales (semana 1, vectorizado) ─────────────────
    # Guard de idempotencia (mismo patrón que las dimensiones de arriba,
    # `if _count(tabla) == 0`): los registros reales son inmutables (siempre
    # semana 1, mismo dataset base) y no deben re-insertarse en cada corrida
    # del DAG — a diferencia de los datos sintéticos (`run_synthetic`), que sí
    # varían por semana y sí deben poder correr repetidamente. Antes de este
    # guard, una re-corrida de `task_gold` (incluso accidental — ej.
    # `airflow tasks test` sobre una tarea downstream que arrastra sus
    # dependencias upstream) duplicaba los 113 550 `fact_id` reales completos,
    # cada uno con un mapeo a track distinto por el orden no determinista de
    # extracción (ver docs/decisiones-refactorizacion.md §20).
    real_count_existente = scalar(client, "SELECT count() FROM FACT_TRACKS WHERE source_type = 'real'") or 0
    if real_count_existente > 0:
        print(f"[gold] {real_count_existente} registros reales ya cargados — se omite el insert (idempotencia).")
        n_real = real_count_existente
    else:
        genre_map  = load_lookup(client, "DIM_GENRES",  "name", "genre_id")
        album_map  = load_lookup(client, "DIM_ALBUMS",  "name", "album_id")
        artist_map = load_lookup(client, "DIM_ARTISTS", "name", "artist_id")
        date_id_1  = get_date_id(client, 1)

        stg_df     = client.query_df("SELECT * FROM STG_RAW_TRACKS")
        n_real     = len(stg_df)
        pop_arr    = stg_df["popularity"].to_numpy(dtype=np.int32)
        tempo_arr  = stg_df["tempo"].to_numpy(dtype=np.float32)
        energy_arr = stg_df["energy"].to_numpy(dtype=np.float32)

        real_df = pd.DataFrame({
            "fact_id":             np.arange(1, n_real + 1, dtype=np.int64),
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
            "source_type":         "real",
        })

        for start in range(0, n_real, 50_000):
            client.insert_df("FACT_TRACKS", real_df.iloc[start:start + 50_000])

        print(f"[gold] {n_real} registros reales insertados (semana 1)")

    # `next_id` debe reflejar el punto más alto ya ocupado en FACT_TRACKS
    # (reales + sintéticos de semanas previas), no solo `n_real` — de lo
    # contrario `run_synthetic` reinicia su rango de fact_id en cada corrida
    # (semana 2+, o cualquier `forzar_recarga`) y genera fact_id duplicados
    # que apuntan a tracks distintos según el orden de merge de ClickHouse
    # (ver docs/decisiones-refactorizacion.md §20 — causa raíz #2).
    max_fact_id = scalar(client, "SELECT max(fact_id) FROM FACT_TRACKS") or n_real
    context["ti"].xcom_push(key="next_id",    value=int(max_fact_id) + 1)
    context["ti"].xcom_push(key="real_count", value=n_real)


def run_log(**context):
    """Registra métricas en ETL_LOGS + ETL_BATCH_CONTROL y limpia staging."""
    cfg    = get_config()
    client = get_client(cfg)

    week           = context["ti"].xcom_pull(task_ids="task_bronze",    key="week_number")
    records_read   = context["ti"].xcom_pull(task_ids="task_bronze",    key="records_read")   or 0
    etl_start_ts   = context["ti"].xcom_pull(task_ids="task_bronze",    key="etl_start_ts")
    parquet_path   = context["ti"].xcom_pull(task_ids="task_bronze",    key="parquet_path")
    inserted_count = context["ti"].xcom_pull(task_ids="task_synthetic", key="inserted_count") or 0

    duration = 0.0
    if etl_start_ts:
        duration = (datetime.utcnow() - datetime.fromisoformat(etl_start_ts)).total_seconds()

    next_log_id = int(scalar(client, "SELECT max(log_id) FROM ETL_LOGS") or 0) + 1
    client.insert(
        "ETL_LOGS",
        [(next_log_id, week, records_read, inserted_count, 0, duration, "success")],
        column_names=["log_id", "week_number", "records_read", "records_inserted",
                      "records_rejected", "duration_seconds", "status"],
    )

    checksum      = hashlib.md5(f"{week}:{records_read}:{inserted_count}".encode()).hexdigest()
    next_batch_id = int(scalar(client, "SELECT max(batch_id) FROM ETL_BATCH_CONTROL") or 0) + 1
    client.insert(
        "ETL_BATCH_CONTROL",
        [(next_batch_id, week, inserted_count, checksum)],
        column_names=["batch_id", "week_number", "record_count", "checksum"],
    )

    client.command("TRUNCATE TABLE STG_RAW_TRACKS")
    if parquet_path and os.path.exists(parquet_path):
        os.remove(parquet_path)

    print(f"[log] Semana {week} completada. Insertados: {inserted_count}. Duración: {duration:.1f}s")


def run_log_failure(**context):
    """RF-ING-004: registra en ETL_LOGS una ejecución fallida con las
    métricas parciales disponibles hasta el punto de falla. Se ejecuta solo
    cuando alguna task previa (bronze/silver/gold/synthetic) falla
    (trigger_rule=ONE_FAILED en la DAG); no corre en el camino feliz."""
    cfg    = get_config()
    client = get_client(cfg)

    week         = context["params"]["week_number"]
    records_read = context["ti"].xcom_pull(task_ids="task_bronze", key="records_read") or 0
    etl_start_ts = context["ti"].xcom_pull(task_ids="task_bronze", key="etl_start_ts")

    duration = 0.0
    if etl_start_ts:
        duration = (datetime.utcnow() - datetime.fromisoformat(etl_start_ts)).total_seconds()

    next_log_id = int(scalar(client, "SELECT max(log_id) FROM ETL_LOGS") or 0) + 1
    client.insert(
        "ETL_LOGS",
        [(next_log_id, week, records_read, 0, 0, duration, "failed")],
        column_names=["log_id", "week_number", "records_read", "records_inserted",
                      "records_rejected", "duration_seconds", "status"],
    )
    print(f"[log_failure] Semana {week} registrada como fallida. Leídos: {records_read}.")
