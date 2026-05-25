"""Configuración centralizada: variables de entorno para el pipeline ETL."""
import os


def get_config() -> dict:
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
