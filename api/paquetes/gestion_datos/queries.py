ETL_LOGS = """
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
"""

ETL_LOGS_TOTAL = "SELECT count() AS n FROM ETL_LOGS"

ETL_STATUS_LAST = """
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


def facts_list_sql(where: str) -> str:
    return f"""
SELECT
    fact_id, track_id, track_name, artist_id, album_id, genre_id,
    popularity, duration_ms, danceability, energy, loudness,
    speechiness, acousticness, instrumentalness, liveness, valence,
    tempo, load_week, source_type, inserted_at
FROM FACT_TRACKS
{where}
ORDER BY fact_id
LIMIT {{limit:UInt32}}
OFFSET {{offset:UInt32}}
"""


def dim_list_sql(ch_table: str, where: str) -> str:
    return f"SELECT * FROM {ch_table} {where} ORDER BY 1 LIMIT {{limit:UInt32}} OFFSET {{offset:UInt32}}"


def dim_list_total_sql(ch_table: str, where: str) -> str:
    return f"SELECT count() AS n FROM {ch_table} {where}"


def dim_str_cols_sql(ch_db: str, ch_table: str) -> str:
    return (
        f"SELECT name FROM system.columns "
        f"WHERE database = '{ch_db}' AND table = '{ch_table}' AND type = 'String' "
        f"ORDER BY position"
    )


DATA_QUALITY_COUNTS = """
SELECT
    count()                                  AS total_records,
    countIf(source_type = 'real')            AS real_records,
    countIf(source_type = 'synthetic')       AS synthetic_records,
    countIf(source_type = 'user_uploaded')   AS user_uploaded_records
FROM FACT_TRACKS
"""

DATA_QUALITY_REJECTION = """
SELECT
    round(avg(records_rejected / nullIf(records_read, 0)) * 100, 2) AS rejection_rate
FROM ETL_LOGS
"""

DATA_QUALITY_LAST_LOAD = """
SELECT
    week_number,
    status,
    run_timestamp,
    records_inserted
FROM ETL_LOGS
ORDER BY run_timestamp DESC
LIMIT 1
"""


def dim_pk_sql(ch_db: str, ch_table: str) -> str:
    return (
        f"SELECT name FROM system.columns "
        f"WHERE database = '{ch_db}' AND table = '{ch_table}' "
        f"ORDER BY position LIMIT 1"
    )


def dim_fk_references_sql(fk_column: str) -> str:
    """RN-ING-004: cuenta referencias en FACT_TRACKS antes de eliminar un
    valor de dimensión."""
    return f"SELECT count() AS n FROM FACT_TRACKS WHERE {fk_column} = {{record_id:Int64}}"


# ── OpenSpec `ingesta` v1 ──────────────────────────────────────────────────────

ETL_BATCH_EXISTS = "SELECT count() AS n FROM ETL_BATCH_CONTROL WHERE week_number = {week_number:UInt8}"

CARGAS_HISTORIAL = """
SELECT
    log_id,
    run_timestamp,
    week_number,
    status,
    records_read,
    records_inserted,
    records_rejected,
    duration_seconds,
    round(records_rejected / nullIf(records_read, 0) * 100, 4) AS tasa_rechazo_pct
FROM ETL_LOGS
ORDER BY run_timestamp DESC
LIMIT {limit:UInt32}
OFFSET {offset:UInt32}
"""

CARGAS_ULTIMA = """
SELECT
    log_id,
    run_timestamp,
    week_number,
    status,
    records_read,
    records_inserted,
    records_rejected,
    duration_seconds,
    round(records_rejected / nullIf(records_read, 0) * 100, 4) AS tasa_rechazo_pct
FROM ETL_LOGS
ORDER BY run_timestamp DESC
LIMIT 1
"""
