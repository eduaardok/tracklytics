"""
etl/gold_ch/base.py — utilidades compartidas por los 12 módulos de agregación
de la capa Gold (S13-P3a): conexión a ambas instancias de ClickHouse, cálculo
de períodos ISO, relleno de demostración con seed fijo, y escritura
idempotente (DELETE + INSERT por período).

Ver docs/BITACORA_S13.md, entrada P3a, para la política de "real primero,
demo si falta": cada módulo de dominio agrega lo que el catálogo (8123)
realmente tiene, y solo rellena con `gold_ch.base.rng_for(...)` los períodos
donde el catálogo no tiene filas — nunca al revés.
"""

import random
from datetime import datetime, timedelta, timezone

import clickhouse_connect

from utils.clickhouse_client import get_client as get_catalog_client  # noqa: F401  (re-exportado)
from utils.config import get_config

PERIODOS_VENTANA = 12  # semanas ISO hacia atrás desde la semana actual


def periodo_sql(col: str) -> str:
    """Expresión SQL que calcula el período ISO 'YYYY-WNN' de una columna de
    fecha/datetime — la MISMA expresión en todos los módulos, para que un
    período calculado en una tabla sea comparable byte a byte con el
    calculado en otra."""
    return f"formatDateTime({col}, '%G-W%V')"


def _periodo_de(dt: datetime) -> str:
    iso_year, iso_week, _ = dt.isocalendar()
    return f"{iso_year}-W{iso_week:02d}"


def iso_weeks_back(n: int = PERIODOS_VENTANA) -> list[str]:
    """Las últimas `n` semanas ISO terminando en la semana actual (incluida),
    más antigua primero — la ventana objetivo que todas las tablas Gold
    intentan cubrir."""
    hoy = datetime.now(timezone.utc)
    periodos: list[str] = []
    vistos: set[str] = set()
    cursor = hoy
    while len(periodos) < n:
        p = _periodo_de(cursor)
        if p not in vistos:
            periodos.append(p)
            vistos.add(p)
        cursor -= timedelta(days=7)
    return list(reversed(periodos))


def get_gold_client() -> clickhouse_connect.driver.Client:
    cfg = get_config()
    return clickhouse_connect.get_client(
        host=cfg["ch_gold_host"], port=cfg["ch_gold_port"],
        database=cfg["ch_gold_db"], username=cfg["ch_user"], password=cfg["ch_pass"],
    )


def rng_for(*parts: str) -> random.Random:
    """Random determinista por combinación de partes (tabla + período +
    dimensión, típicamente) — misma corrida, mismo resultado, sin depender
    de un seed global compartido entre módulos (que acoplaría su orden de
    ejecución)."""
    seed = "|".join(str(p) for p in parts)
    return random.Random(seed)


def write_gold(client: clickhouse_connect.driver.Client, table: str, columns: list[str],
               rows: list[tuple], periodos: list[str]) -> int:
    """Reemplaza (DELETE + INSERT) las filas de `table` para los `periodos`
    dados — idempotente: correr el mismo período dos veces dejä el mismo
    resultado, nunca filas duplicadas. `periodos` son los que EL LLAMADOR
    va a reinsertar a continuación (no necesariamente todos los de la tabla)."""
    if periodos:
        lista = ", ".join(f"'{p}'" for p in periodos)
        client.command(f"ALTER TABLE {table} DELETE WHERE periodo IN ({lista})")
    if rows:
        client.insert(table, rows, column_names=columns)
    return len(rows)


def log_run(client: clickhouse_connect.driver.Client, tabla: str, periodos: list[str],
            registros: int, duracion_s: float, estado: str = "ok", detalle: str = "") -> None:
    client.insert(
        "GOLD_ETL_LOG",
        [(tabla, ",".join(periodos), registros, duracion_s, estado, detalle)],
        column_names=["tabla", "periodos_procesados", "registros_escritos", "duracion_s", "estado", "detalle"],
    )
