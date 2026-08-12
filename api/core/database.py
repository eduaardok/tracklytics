import math
import threading
from typing import Optional

import clickhouse_connect

from core.config import CH_HOST, CH_PORT, CH_DB, CH_USER, CH_PASSWORD

_local = threading.local()


def get_client() -> clickhouse_connect.driver.Client:
    if hasattr(_local, 'client') and _local.client is not None:
        try:
            _local.client.ping()
            return _local.client
        except Exception:
            _local.client = None

    _local.client = clickhouse_connect.get_client(
        host=CH_HOST,
        port=CH_PORT,
        database=CH_DB,
        username=CH_USER,
        password=CH_PASSWORD,
    )
    return _local.client


def clean_row(row: dict) -> dict:
    return {
        k: (None if isinstance(v, float) and (math.isnan(v) or math.isinf(v)) else v)
        for k, v in row.items()
    }


def query_rows(sql: str, parameters: Optional[dict] = None) -> list[dict]:
    client = get_client()
    result = client.query(sql, parameters=parameters or {})
    return [clean_row(dict(zip(result.column_names, row))) for row in result.result_rows]


def query_one(sql: str, parameters: Optional[dict] = None) -> Optional[dict]:
    rows = query_rows(sql, parameters)
    return rows[0] if rows else None


def execute(sql: str, parameters: Optional[dict] = None) -> None:
    client = get_client()
    client.command(sql, parameters=parameters or {})


def insert_row(table: str, data: dict) -> None:
    """Inserta una fila vía el protocolo nativo de clickhouse-connect
    (`Client.insert`), no SQL de texto — los valores viajan serializados por
    el driver, nunca interpolados en una query (auditoría de validación,
    hallazgo crítico `gestion_datos.dim_create`: la versión anterior
    construía `INSERT ... VALUES (...)` con f-strings, inyectable)."""
    client = get_client()
    client.insert(table, [list(data.values())], column_names=list(data.keys()))
