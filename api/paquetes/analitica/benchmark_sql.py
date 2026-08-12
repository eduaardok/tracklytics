"""Benchmark real: SQL directo (agregando en caliente sobre el catálogo,
ClickHouse 8123) vs. leer la tabla Gold ya pre-agregada (ClickHouse 8124),
para el MISMO informe compuesto exacto — evidencia medida de por qué existe
la capa Gold (`docs/BENCHMARK_SQL_VS_GOLD.md`).

3 informes, cada uno ya expuesto como endpoint Gold en
`paquetes.reportes.router` (C14/C15/C18) — acá se reproduce la MISMA lógica
de negocio "desde cero" sobre `FACT_ENGAGEMENT_USUARIO`/`FACT_TRACKS`/
`DIM_GENRES` (1M/1.3M/114 filas reales), sin tocar Gold para la versión
"directa".

La ventana de tiempo y (para `ranking-generos`) el conjunto de géneros no
se fijan a mano: se leen del propio contenido de la tabla Gold en el
momento de la medición (`_ventana_desde_gold`) para que ambas versiones
agreguen exactamente los mismos datos — la única forma de que "coinciden"
sea una comparación real, no una coincidencia forzada por parámetros
iguales a ciegas.

Nunca se ejecuta automáticamente: `ejecutar_benchmark()` la dispara un
POST explícito (botón "Medir ahora" en el frontend) — la versión directa
escanea millones de filas y se repite `REPETICIONES` veces, no es algo
para disparar en cada carga de página."""

import time
from datetime import timedelta
from typing import Callable

from core.database import get_client as get_catalog_client
from core.database_gold import get_gold_client

REPETICIONES = 3


def _ejecutar(client, sql: str, params: dict | None = None) -> tuple[float, int, list[tuple]]:
    """Una corrida: (segundos, filas leídas por ClickHouse, filas de resultado)."""
    t0 = time.perf_counter()
    result = client.query(sql, parameters=params or {})
    elapsed = time.perf_counter() - t0
    leidas = int(result.summary.get("read_rows", 0)) if result.summary else 0
    return elapsed, leidas, result.result_rows


def _promediar(client, sql: str, params: dict | None = None, repeticiones: int = REPETICIONES) -> dict:
    tiempos: list[float] = []
    filas_leidas = 0
    resultado: list[tuple] = []
    for _ in range(repeticiones):
        t, leidas, filas = _ejecutar(client, sql, params)
        tiempos.append(t)
        filas_leidas = leidas
        resultado = filas
    return {
        "tiempos_s": [round(t, 4) for t in tiempos],
        "tiempo_promedio_s": round(sum(tiempos) / len(tiempos), 4),
        "filas_leidas": filas_leidas,
        "resultado": resultado,
    }


def _ventana_desde_gold(gold_client, tabla: str, extra_where: str = "") -> tuple:
    """Rango [desde, hasta) real cubierto por `tabla` para granularidad
    'semana' — `hasta` es exclusivo, un día después del fin de la última
    semana almacenada (`fecha_inicio` es el lunes de cada semana ISO,
    `toStartOfWeek(col, 1)`, igual que `etl/gold_ch/base.py`)."""
    where = "granularidad = 'semana'" + (f" AND {extra_where}" if extra_where else "")
    row = gold_client.query(f"SELECT min(fecha_inicio) AS desde, max(fecha_inicio) AS hasta_ini FROM {tabla} WHERE {where}").result_rows[0]
    desde, hasta_ini = row
    return desde, hasta_ini + timedelta(days=7)


def _num_iguales(a, b, tolerancia: float = 0.5) -> bool:
    if a is None or b is None:
        return a == b
    return abs(float(a) - float(b)) <= tolerancia


# ─────────────────────────────────────────────────────────────────────────────
# Informe A — Reproducciones totales + usuarios activos promedio (C14, panel
# ejecutivo). Fila rollup de GOLD_ENGAGEMENT_PERIODO (genero=''): sum() es
# directamente aditivo sobre las semanas, pero usuarios_activos_promedio es
# un AVG de conteos únicos por semana — no el total de únicos de la ventana
# completa — así que el SQL directo agrupa por semana antes de promediar,
# reproduciendo esa misma semántica.
# ─────────────────────────────────────────────────────────────────────────────

def _preparar_engagement_total(gold_client) -> tuple[str, dict, str, dict, Callable]:
    desde, hasta = _ventana_desde_gold(gold_client, "GOLD_ENGAGEMENT_PERIODO", "genero = ''")

    sql_gold = (
        "SELECT sum(reproducciones_total) AS reproducciones, "
        "round(avg(usuarios_activos), 2) AS usuarios_activos_promedio "
        "FROM GOLD_ENGAGEMENT_PERIODO WHERE granularidad = 'semana' AND genero = ''"
    )

    sql_directo = """
        SELECT
            (SELECT count() FROM FACT_ENGAGEMENT_USUARIO
             WHERE event_type = 'reproduccion'
               AND event_timestamp >= {desde:DateTime} AND event_timestamp < {hasta:DateTime}) AS reproducciones,
            (SELECT round(avg(activos), 2) FROM (
                SELECT toStartOfWeek(event_timestamp, 1) AS semana, uniqExact(user_id) AS activos
                FROM FACT_ENGAGEMENT_USUARIO
                WHERE event_timestamp >= {desde:DateTime} AND event_timestamp < {hasta:DateTime}
                GROUP BY semana
            )) AS usuarios_activos_promedio
    """
    params = {"desde": desde, "hasta": hasta}

    def comparar(directo, gold):
        if not directo or not gold:
            return False
        d, g = directo[0], gold[0]
        return _num_iguales(d[0], g[0], tolerancia=1) and _num_iguales(d[1], g[1], tolerancia=0.5)

    return sql_directo, params, sql_gold, params, comparar


# ─────────────────────────────────────────────────────────────────────────────
# Informe B — Top 10 géneros por reproducciones (C15, ranking de géneros).
# GOLD_CONSUMO_GENERO_PERIODO ya restringe a los 15 géneros históricamente
# más reproducidos (`etl/gold_ch/consumo_genero.py`) — el SQL directo agrega
# sobre EXACTAMENTE ese mismo conjunto de géneros y ventana (leídos de la
# propia tabla Gold), no un top-15 recalculado aparte, para comparar la
# misma pregunta de negocio con los mismos datos de entrada.
# ─────────────────────────────────────────────────────────────────────────────

def _preparar_ranking_generos(gold_client) -> tuple[str, dict, str, dict, Callable]:
    desde, hasta = _ventana_desde_gold(gold_client, "GOLD_CONSUMO_GENERO_PERIODO", "genre_id != 0")
    fila = gold_client.query(
        "SELECT groupUniqArray(genre_id) FROM GOLD_CONSUMO_GENERO_PERIODO "
        "WHERE granularidad = 'semana' AND genre_id != 0"
    ).result_rows[0]
    genre_ids = fila[0]
    ids_sql = ",".join(str(int(g)) for g in genre_ids) or "0"

    sql_gold = (
        "SELECT genero, sum(reproducciones) AS reproducciones "
        "FROM GOLD_CONSUMO_GENERO_PERIODO WHERE granularidad = 'semana' AND genre_id != 0 "
        "GROUP BY genero ORDER BY reproducciones DESC LIMIT 10"
    )

    sql_directo = f"""
        SELECT g.name AS genero, count() AS reproducciones
        FROM FACT_ENGAGEMENT_USUARIO e
        JOIN FACT_TRACKS t ON t.fact_id = e.fact_id
        JOIN DIM_GENRES g ON g.genre_id = t.genre_id
        WHERE e.event_type = 'reproduccion'
          AND t.genre_id IN ({ids_sql})
          AND e.event_timestamp >= {{desde:DateTime}} AND e.event_timestamp < {{hasta:DateTime}}
        GROUP BY genero
        ORDER BY reproducciones DESC
        LIMIT 10
    """
    params = {"desde": desde, "hasta": hasta}

    def comparar(directo, gold):
        d = {r[0]: int(r[1]) for r in directo}
        g = {r[0]: int(r[1]) for r in gold}
        return d == g

    return sql_directo, params, sql_gold, {}, comparar


# ─────────────────────────────────────────────────────────────────────────────
# Informe C — Popularidad promedio del catálogo (C18, benchmark de
# popularidad). Sin joins ni ventana: un solo `avg()` sobre las 1.3M filas
# de FACT_TRACKS completo (mismo valor guardado en cada fila de
# GOLD_CONSUMO_GENERO_PERIODO como `popularidad_catalogo_base`) — contraste
# deliberado con A/B: acá el costo es un full scan de agregación, no un join.
# ─────────────────────────────────────────────────────────────────────────────

def _preparar_popularidad_catalogo(gold_client) -> tuple[str, dict, str, dict, Callable]:
    sql_gold = (
        "SELECT popularidad_catalogo_base FROM GOLD_CONSUMO_GENERO_PERIODO "
        "WHERE granularidad = 'semana' LIMIT 1"
    )
    sql_directo = "SELECT round(avg(popularity), 2) AS popularidad_catalogo_base FROM FACT_TRACKS"

    def comparar(directo, gold):
        if not directo or not gold:
            return False
        # Tolerancia algo más ancha: si el catálogo recibió filas nuevas
        # después de la última corrida de dag_gold_aggregations, el
        # promedio real diverge levemente del guardado — no es un bug de
        # la query, es la capa Gold quedando desactualizada por diseño
        # hasta el próximo refresco (ver docs/BITACORA_S16.md, guarda
        # hay_batch_nuevo).
        return _num_iguales(directo[0][0], gold[0][0], tolerancia=1.0)

    return sql_directo, {}, sql_gold, {}, comparar


INFORMES: dict[str, dict] = {
    "engagement-total": {
        "nombre": "Reproducciones totales + usuarios activos promedio (52 semanas)",
        "informe_gold": "C14 — Panel ejecutivo",
        "tabla_gold": "GOLD_ENGAGEMENT_PERIODO",
        "preparar": _preparar_engagement_total,
    },
    "ranking-generos": {
        "nombre": "Top 10 géneros por reproducciones (52 semanas)",
        "informe_gold": "C15 — Ranking de géneros",
        "tabla_gold": "GOLD_CONSUMO_GENERO_PERIODO",
        "preparar": _preparar_ranking_generos,
    },
    "popularidad-catalogo": {
        "nombre": "Popularidad promedio del catálogo completo",
        "informe_gold": "C18 — Benchmark de popularidad",
        "tabla_gold": "GOLD_CONSUMO_GENERO_PERIODO",
        "preparar": _preparar_popularidad_catalogo,
    },
}


def listar_informes() -> list[dict]:
    return [
        {"informe_id": k, "nombre": v["nombre"], "informe_gold": v["informe_gold"], "tabla_gold": v["tabla_gold"]}
        for k, v in INFORMES.items()
    ]


def ejecutar_benchmark(informe_id: str, repeticiones: int = REPETICIONES) -> dict:
    if informe_id not in INFORMES:
        raise KeyError(informe_id)
    cfg = INFORMES[informe_id]
    catalog = get_catalog_client()
    gold = get_gold_client()

    sql_directo, params_directo, sql_gold, params_gold, comparar = cfg["preparar"](gold)

    medicion_directo = _promediar(catalog, sql_directo, params_directo, repeticiones)
    medicion_gold = _promediar(gold, sql_gold, params_gold, repeticiones)

    coinciden = comparar(medicion_directo["resultado"], medicion_gold["resultado"])
    factor = (
        round(medicion_directo["tiempo_promedio_s"] / medicion_gold["tiempo_promedio_s"], 1)
        if medicion_gold["tiempo_promedio_s"] else None
    )

    return {
        "informe_id": informe_id,
        "nombre": cfg["nombre"],
        "informe_gold": cfg["informe_gold"],
        "tabla_gold": cfg["tabla_gold"],
        "repeticiones": repeticiones,
        "sql_directo": {"query": sql_directo.strip(), **medicion_directo},
        "sql_gold": {"query": sql_gold.strip(), **medicion_gold},
        "factor_mejora": factor,
        "coinciden": coinciden,
    }
