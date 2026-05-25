"""Capa Bronze: extracción fiel de PocketBase sin transformaciones.
Guarda los datos crudos en Parquet como respaldo inmutable."""

import os
from datetime import datetime

import pandas as pd

from utils.config import get_config
from utils.pocketbase_client import fetch_all_pages


def _get_week(context) -> int:
    conf = (context.get("dag_run") and context["dag_run"].conf) or {}
    val  = conf.get("week_number")
    if val is not None:
        return int(val)
    return int(os.getenv("WEEK_NUMBER", 1))


def _bool_to_int(v) -> int:
    if isinstance(v, bool):
        return int(v)
    return 1 if str(v).strip().lower() in ("true", "1") else 0


def run_bronze(**context):
    """Extrae todos los registros de PocketBase y los persiste como Parquet con schema mínimo."""
    cfg  = get_config()
    week = _get_week(context)
    print(f"[bronze] week={week} — descargando de PocketBase")

    records = fetch_all_pages(cfg)
    os.makedirs(cfg["parquet_dir"], exist_ok=True)

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
    print(f"[bronze] {len(df)} filas → {parquet_path}")

    context["ti"].xcom_push(key="week_number",  value=week)
    context["ti"].xcom_push(key="records_read", value=len(records))
    context["ti"].xcom_push(key="etl_start_ts", value=datetime.utcnow().isoformat())
    context["ti"].xcom_push(key="parquet_path", value=parquet_path)
