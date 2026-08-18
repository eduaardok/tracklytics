"""GOLD_CREADORES_PERIODO — OE5 (S16, BSC "Retención de creadores activos").

100% real: FACT_SUBIDA_TRACK (catálogo) ya tiene cuenta_artista_id/fecha_subida
por cada subida real de un creador — mismo origen que ya usa
`paquetes.creadores.router`. "Creador activo" en un período = al menos una
subida en la ventana, sin exigir que haya sido aprobada (el KPI mide
actividad de subida, no throughput de moderación — eso ya lo cubre
GOLD_CONTENIDO_PERIODO). Grano por creador (no un COUNT ya reducido) porque
`bsc._kpi_retencion_creadores` necesita el conjunto de creadores activos de
cada período para calcular el overlap contra el período anterior.
"""

import time

from gold_ch.base import VENTANA_ORIGEN_DIAS, fecha_inicio_sql, get_catalog_client, get_gold_client, log_run, periodo_sql, periodos_ventana, write_gold

TABLE = "GOLD_CREADORES_PERIODO"
COLUMNS = ["granularidad", "fecha_inicio", "periodo", "cuenta_artista_id", "subidas_total", "es_estimado"]


def run_gold_creadores(granularidad: str = "semana") -> None:
    t0 = time.time()
    ventana = periodos_ventana(granularidad)
    periodos = [p for p, _ in ventana]
    catalog = get_catalog_client()
    gold = get_gold_client()

    reales = list(catalog.query(
        f"""
        SELECT {periodo_sql('fecha_subida', granularidad)} AS periodo,
               {fecha_inicio_sql('fecha_subida', granularidad)} AS fecha_inicio,
               cuenta_artista_id,
               count() AS subidas_total
        FROM FACT_SUBIDA_TRACK
        WHERE fecha_subida >= now() - INTERVAL {VENTANA_ORIGEN_DIAS} DAY
        GROUP BY periodo, fecha_inicio, cuenta_artista_id
        """
    ).named_results())

    rows: list[tuple] = [
        (granularidad, r["fecha_inicio"], r["periodo"], r["cuenta_artista_id"], r["subidas_total"], 0)
        for r in reales
    ]

    write_gold(gold, TABLE, COLUMNS, rows, periodos, granularidad)
    log_run(gold, TABLE, periodos, len(rows), time.time() - t0, granularidad=granularidad)
    print(f"[{TABLE}] {len(rows)} filas escritas ({len(periodos)} períodos, granularidad={granularidad}).")
