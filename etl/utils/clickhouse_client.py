"""Cliente ClickHouse reutilizable para el pipeline ETL."""
import clickhouse_connect

from utils.config import get_config


def get_client(cfg: dict | None = None):
    if cfg is None:
        cfg = get_config()
    return clickhouse_connect.get_client(
        host=cfg["ch_host"],
        port=cfg["ch_port"],
        database=cfg["ch_db"],
        username=cfg["ch_user"],
        password=cfg["ch_pass"],
    )


def scalar(client, sql: str, params: dict | None = None):
    result = client.query(sql, parameters=params or {})
    rows = result.result_rows
    return rows[0][0] if rows else None


def load_lookup(client, table: str, name_col: str, id_col: str) -> dict:
    rows = client.query(f"SELECT {name_col}, {id_col} FROM {table}").result_rows
    return {r[0]: r[1] for r in rows}


def get_date_id(client, week: int) -> int:
    return int(scalar(
        client,
        "SELECT date_id FROM DIM_DATE WHERE week_number = {w:UInt8}",
        {"w": week},
    ) or week)
