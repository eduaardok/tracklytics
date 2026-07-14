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
RECALIFICACION_DAG = os.getenv("RECALIFICACION_DAG_ID", "tracklytics_recalificacion")

PB_URL      = os.getenv("POCKETBASE_URL", "http://pocketbase:8090")
# Credenciales de superusuario: usadas solo por `partners` para resolver la
# colección `partners` (admin-only, sin sesión de usuario final involucrada).
PB_ADMIN_EMAIL    = os.getenv("POCKETBASE_EMAIL", "admin@tracklytics.com")
PB_ADMIN_PASSWORD = os.getenv("POCKETBASE_PASSWORD", "")

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

# Columna de FACT_TRACKS que referencia la PK de cada dimensión (RN-ING-004):
# se usa para verificar si un valor de dimensión está en uso antes de eliminarlo.
DIM_FK_COLUMN: dict[str, str] = {
    "artists":          "artist_id",
    "albums":           "album_id",
    "genres":           "genre_id",
    "date":             "date_id",
    "musical_key":      "key_id",
    "mode":             "mode_id",
    "time_signature":   "time_signature_id",
    "explicit_type":    "explicit_id",
    "popularity_range": "popularity_range_id",
    "tempo_range":      "tempo_range_id",
    "energy_level":     "energy_level_id",
}
