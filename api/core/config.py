import os

CH_HOST     = os.getenv("CLICKHOUSE_HOST", "localhost")
CH_PORT     = int(os.getenv("CLICKHOUSE_PORT", "8123"))
CH_DB       = os.getenv("CLICKHOUSE_DB", "tracklytics")
CH_USER     = os.getenv("CLICKHOUSE_USER", "default")
CH_PASSWORD = os.getenv("CLICKHOUSE_PASSWORD", "")

AIRFLOW_URL  = os.getenv("AIRFLOW_URL",      "http://airflow:8080")
AIRFLOW_USER = os.getenv("AIRFLOW_USER",     "admin")
AIRFLOW_PASS = os.getenv("AIRFLOW_PASSWORD", "tracklytics2026")
AIRFLOW_DAG  = os.getenv("AIRFLOW_DAG_ID",  "tracklytics_etl")

PB_URL = os.getenv("POCKETBASE_URL", "http://pocketbase:8090")

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
