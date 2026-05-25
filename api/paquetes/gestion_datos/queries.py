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
    tempo, load_week, is_synthetic, inserted_at
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


def dim_pk_sql(ch_db: str, ch_table: str) -> str:
    return (
        f"SELECT name FROM system.columns "
        f"WHERE database = '{ch_db}' AND table = '{ch_table}' "
        f"ORDER BY position LIMIT 1"
    )
