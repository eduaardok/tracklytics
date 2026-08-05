"""etl/gold_ch/base.py — utilidades compartidas por los 12 módulos de agregación
de la capa Gold: conexión a ambas instancias de ClickHouse, cálculo de
períodos por granularidad configurable (S14-P2), y escritura idempotente
(DELETE + INSERT por granularidad+período).

Hasta S14-P2 cada módulo rellenaba con `gold_ch.base.rng_for(...)` los
períodos donde el catálogo no tenía filas ("real primero, demo si falta",
ver docs/BITACORA_S13.md P3a). S14-P3 eliminó ese mecanismo por completo:
`etl/gold/backfill_negocio.py` genera 24 meses de eventos de negocio reales
directamente en el catálogo, así que los 12 módulos ya no necesitan
fabricar nada — un período sin dato real simplemente no se escribe. `rng_for`
y `permite_relleno_demo` (S14-P2) se retiraron de este módulo junto con sus
últimos llamadores (ver docs/BITACORA_S14.md, P3).
"""

from datetime import date, datetime, timedelta, timezone

import clickhouse_connect

from utils.clickhouse_client import get_client as get_catalog_client  # noqa: F401  (re-exportado)
from utils.config import get_config

GRANULARIDADES = ("dia", "semana", "mes", "trimestre", "anio")

# Horizonte (cantidad de períodos hacia atrás, incluido el actual) por
# granularidad — más fino, ventana más corta; más grueso, ventana más larga.
HORIZONTE_POR_GRANULARIDAD = {
    "dia": 90,
    "semana": 52,
    "mes": 24,
    "trimestre": 8,
    "anio": 3,
}

# Compat retro: algunos llamadores viejos importaban esta constante asumiendo
# grano semanal fijo (12 semanas). Ya no gobierna el horizonte real (ver
# HORIZONTE_POR_GRANULARIDAD) — se conserva solo para no romper imports.
PERIODOS_VENTANA = HORIZONTE_POR_GRANULARIDAD["semana"]

# Ventana única de lectura del catálogo origen (8123) — reemplaza los
# `INTERVAL 90 DAY` / `today() - 90` (y el `INTERVAL 180 DAY` de
# `pipeline.py`) que estaban dispersos y hardcodeados en cada módulo. Debe
# cubrir el horizonte más largo (`anio`, 3 años = 1095 días) para que la
# granularidad `anio` tenga datos reales que agregar.
VENTANA_ORIGEN_DIAS = 1095

_EXPR_PERIODO = {
    "dia":       lambda col: f"formatDateTime({col}, '%Y-%m-%d')",
    "semana":    lambda col: f"formatDateTime({col}, '%G-W%V')",
    "mes":       lambda col: f"formatDateTime({col}, '%Y-%m')",
    "trimestre": lambda col: f"concat(toString(toYear({col})), '-Q', toString(toQuarter({col})))",
    "anio":      lambda col: f"toString(toYear({col}))",
}

# Nota: `toStartOfDay` (sugerido para 'dia') devuelve DateTime en ClickHouse,
# no Date — se envuelve todo en `toDate(...)` para que el resultado siempre
# calce con el tipo de columna `fecha_inicio Date` del DDL, sin importar si
# `col` en origen es Date o DateTime.
_EXPR_FECHA_INICIO = {
    "dia":       lambda col: f"toDate({col})",
    "semana":    lambda col: f"toDate(toStartOfWeek({col}, 1))",
    "mes":       lambda col: f"toDate(toStartOfMonth({col}))",
    "trimestre": lambda col: f"toDate(toStartOfQuarter({col}))",
    "anio":      lambda col: f"toDate(toStartOfYear({col}))",
}


def periodo_sql(col: str, granularidad: str = "semana") -> str:
    """Expresión SQL que calcula la etiqueta de período de una columna de
    fecha/datetime para la granularidad dada — la MISMA expresión en todos
    los módulos, para que un período calculado en una tabla sea comparable
    byte a byte con el calculado en otra. Default 'semana' por compatibilidad
    con llamadas existentes que no pasan granularidad."""
    return _EXPR_PERIODO[granularidad](col)


def fecha_inicio_sql(col: str, granularidad: str = "semana") -> str:
    """Expresión SQL que calcula la fecha de inicio (Date) del período al que
    pertenece `col`, para la granularidad dada — es la columna que permite
    filtrar por rango de fechas reales en vez de comparar strings de
    `periodo`."""
    return _EXPR_FECHA_INICIO[granularidad](col)


def _add_months(d: date, n: int) -> date:
    total = d.year * 12 + (d.month - 1) + n
    year, month = divmod(total, 12)
    return date(year, month + 1, 1)


def _inicio_periodo(d: date, granularidad: str) -> date:
    if granularidad == "dia":
        return d
    if granularidad == "semana":
        return d - timedelta(days=d.weekday())  # lunes (ISO, igual que toStartOfWeek(col, 1))
    if granularidad == "mes":
        return d.replace(day=1)
    if granularidad == "trimestre":
        mes_trimestre = ((d.month - 1) // 3) * 3 + 1
        return d.replace(month=mes_trimestre, day=1)
    if granularidad == "anio":
        return d.replace(month=1, day=1)
    raise ValueError(f"granularidad desconocida: {granularidad}")


def _etiqueta_periodo(d: date, granularidad: str) -> str:
    if granularidad == "dia":
        return d.strftime("%Y-%m-%d")
    if granularidad == "semana":
        iso_year, iso_week, _ = d.isocalendar()
        return f"{iso_year}-W{iso_week:02d}"
    if granularidad == "mes":
        return d.strftime("%Y-%m")
    if granularidad == "trimestre":
        q = (d.month - 1) // 3 + 1
        return f"{d.year}-Q{q}"
    if granularidad == "anio":
        return str(d.year)
    raise ValueError(f"granularidad desconocida: {granularidad}")


def _retroceder_periodo(d: date, granularidad: str) -> date:
    """Dado el inicio de un período, devuelve el inicio del período anterior."""
    if granularidad == "dia":
        return d - timedelta(days=1)
    if granularidad == "semana":
        return d - timedelta(days=7)
    if granularidad == "mes":
        return _add_months(d, -1)
    if granularidad == "trimestre":
        return _add_months(d, -3)
    if granularidad == "anio":
        return date(d.year - 1, 1, 1)
    raise ValueError(f"granularidad desconocida: {granularidad}")


def periodos_ventana(granularidad: str = "semana") -> list[tuple[str, date]]:
    """Los últimos `HORIZONTE_POR_GRANULARIDAD[granularidad]` períodos de esa
    granularidad, terminando en el período actual (incluido), más antiguo
    primero — reemplaza a `iso_weeks_back()`. Cada elemento es
    `(etiqueta_periodo, fecha_inicio)`."""
    n = HORIZONTE_POR_GRANULARIDAD[granularidad]
    hoy = datetime.now(timezone.utc).date()
    cursor = _inicio_periodo(hoy, granularidad)
    periodos: list[tuple[str, date]] = []
    for _ in range(n):
        periodos.append((_etiqueta_periodo(cursor, granularidad), cursor))
        cursor = _retroceder_periodo(cursor, granularidad)
    return list(reversed(periodos))


def get_gold_client() -> clickhouse_connect.driver.Client:
    cfg = get_config()
    return clickhouse_connect.get_client(
        host=cfg["ch_gold_host"], port=cfg["ch_gold_port"],
        database=cfg["ch_gold_db"], username=cfg["ch_user"], password=cfg["ch_pass"],
    )


def write_gold(client: clickhouse_connect.driver.Client, table: str, columns: list[str],
               rows: list[tuple], periodos: list[str], granularidad: str = "semana") -> int:
    """Reemplaza (DELETE + INSERT) las filas de `table` para los `periodos`
    dados DE ESA granularidad — idempotente: correr el mismo período dos
    veces deja el mismo resultado, nunca filas duplicadas. El filtro incluye
    `granularidad` explícitamente: sin eso, escribir el grano 'mes' borraría
    también las filas del grano 'semana' que compartan etiqueta de período."""
    if periodos:
        lista = ", ".join(f"'{p}'" for p in periodos)
        client.command(
            f"ALTER TABLE {table} DELETE WHERE granularidad = '{granularidad}' AND periodo IN ({lista})"
        )
    if rows:
        client.insert(table, rows, column_names=columns)
    return len(rows)


def log_run(client: clickhouse_connect.driver.Client, tabla: str, periodos: list[str],
            registros: int, duracion_s: float, estado: str = "ok", detalle: str = "",
            granularidad: str = "semana") -> None:
    client.insert(
        "GOLD_ETL_LOG",
        [(tabla, granularidad, ",".join(periodos), registros, duracion_s, estado, detalle)],
        column_names=["tabla", "granularidad", "periodos_procesados", "registros_escritos", "duracion_s", "estado", "detalle"],
    )
