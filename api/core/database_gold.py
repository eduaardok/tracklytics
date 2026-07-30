"""Conexión exclusiva a la capa Gold (S13-P2) — instancia de ClickHouse
separada del catálogo (`core/database.py`, puerto 8123). Ningún paquete de
negocio la usa todavía: P3 crea las tablas Gold y los DAGs que las pueblan;
esta semana solo se prepara la infraestructura (contenedor + conexión).

Mismo patrón que `core/database.py` (cliente cacheado por hilo, mismas
funciones `query_rows`/`query_one`/`execute`) para que migrar código de una
instancia a la otra sea un cambio de import, no de forma."""

import math
import threading
from typing import Optional

import clickhouse_connect

from core.config import CH_GOLD_HOST, CH_GOLD_PORT, CH_GOLD_DB, CH_USER, CH_PASSWORD

_local_gold = threading.local()


def get_gold_client() -> clickhouse_connect.driver.Client:
    if hasattr(_local_gold, 'client') and _local_gold.client is not None:
        try:
            _local_gold.client.ping()
            return _local_gold.client
        except Exception:
            _local_gold.client = None

    _local_gold.client = clickhouse_connect.get_client(
        host=CH_GOLD_HOST,
        port=CH_GOLD_PORT,
        database=CH_GOLD_DB,
        username=CH_USER,
        password=CH_PASSWORD,
    )
    return _local_gold.client


def _clean_row(row: dict) -> dict:
    return {
        k: (None if isinstance(v, float) and (math.isnan(v) or math.isinf(v)) else v)
        for k, v in row.items()
    }


def query_rows_gold(sql: str, parameters: Optional[dict] = None) -> list[dict]:
    client = get_gold_client()
    result = client.query(sql, parameters=parameters or {})
    return [_clean_row(dict(zip(result.column_names, row))) for row in result.result_rows]


def query_one_gold(sql: str, parameters: Optional[dict] = None) -> Optional[dict]:
    rows = query_rows_gold(sql, parameters)
    return rows[0] if rows else None


def execute_gold(sql: str, parameters: Optional[dict] = None) -> None:
    client = get_gold_client()
    client.command(sql, parameters=parameters or {})
