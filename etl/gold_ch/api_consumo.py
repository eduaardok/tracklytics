"""GOLD_API_CONSUMO_PERIODO — C04 (OT-04, Tecnología).

100% real: `LOG_LLAMADAS_PARTNER` (catálogo) ya tiene partner_id/tier_usado/
resultado/duracion_ms/timestamp por llamada real a la API de partners — el
mismo origen que ya usa `partners.router.metricas_por_partner`. S14-P3
eliminó el relleno demo (`rng_for`): `etl/gold/backfill_negocio.py` genera
llamadas reales para los partners existentes a lo largo de los 24 meses de
historia, así que un período sin llamadas reales simplemente no tiene fila.
"""

import time

from gold_ch.base import VENTANA_ORIGEN_DIAS, fecha_inicio_sql, get_catalog_client, get_gold_client, log_run, periodo_sql, periodos_ventana, write_gold

TABLE = "GOLD_API_CONSUMO_PERIODO"
COLUMNS = [
    "granularidad", "fecha_inicio", "periodo", "partner_id", "tier", "total_llamadas",
    "llamadas_exitosas", "llamadas_fallidas", "tasa_exito", "latencia_promedio_ms", "es_estimado",
]


def run_gold_api_consumo(granularidad: str = "semana") -> None:
    t0 = time.time()
    ventana = periodos_ventana(granularidad)
    periodos = [p for p, _ in ventana]
    catalog = get_catalog_client()
    gold = get_gold_client()

    reales = list(catalog.query(
        f"""
        SELECT {periodo_sql('timestamp', granularidad)} AS periodo,
               {fecha_inicio_sql('timestamp', granularidad)} AS fecha_inicio,
               partner_id, tier_usado AS tier,
               count() AS total, countIf(resultado = 'success') AS exitosas,
               countIf(resultado != 'success') AS fallidas,
               avgIf(duracion_ms, resultado = 'success') AS latencia
        FROM LOG_LLAMADAS_PARTNER
        WHERE timestamp >= now() - INTERVAL {VENTANA_ORIGEN_DIAS} DAY AND partner_id != ''
        GROUP BY periodo, fecha_inicio, partner_id, tier
        """
    ).named_results())

    rows: list[tuple] = []
    for r in reales:
        exito_pct = round((r["exitosas"] / r["total"] * 100) if r["total"] else 0, 2)
        rows.append((
            granularidad, r["fecha_inicio"], r["periodo"], r["partner_id"], r["tier"] or "",
            r["total"], r["exitosas"], r["fallidas"], exito_pct, round(r["latencia"] or 0, 2), 0,
        ))

    write_gold(gold, TABLE, COLUMNS, rows, periodos, granularidad)
    log_run(gold, TABLE, periodos, len(rows), time.time() - t0, granularidad=granularidad)
    print(f"[{TABLE}] {len(rows)} filas escritas ({len(periodos)} períodos, granularidad={granularidad}).")
