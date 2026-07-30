"""GOLD_API_CONSUMO_PERIODO — C04 (OT-04, Tecnología).

100% real: `LOG_LLAMADAS_PARTNER` (catálogo) ya tiene partner_id/tier_usado/
resultado/duracion_ms/timestamp por llamada real a la API de partners — el
mismo origen que ya usa `partners.router.metricas_por_partner`. Demo-fill
solo para semanas de la ventana sin ninguna llamada registrada.
"""

import time

from gold_ch.base import get_catalog_client, get_gold_client, iso_weeks_back, log_run, periodo_sql, rng_for, write_gold

TABLE = "GOLD_API_CONSUMO_PERIODO"
COLUMNS = [
    "periodo", "partner_id", "tier", "total_llamadas", "llamadas_exitosas",
    "llamadas_fallidas", "tasa_exito", "latencia_promedio_ms", "es_estimado",
]


def run_gold_api_consumo() -> None:
    t0 = time.time()
    periodos = iso_weeks_back()
    catalog = get_catalog_client()
    gold = get_gold_client()

    reales = list(catalog.query(
        f"""
        SELECT {periodo_sql('timestamp')} AS periodo, partner_id, tier_usado AS tier,
               count() AS total, countIf(resultado = 'success') AS exitosas,
               countIf(resultado != 'success') AS fallidas,
               avgIf(duracion_ms, resultado = 'success') AS latencia
        FROM LOG_LLAMADAS_PARTNER
        WHERE timestamp >= now() - INTERVAL 90 DAY AND partner_id != ''
        GROUP BY periodo, partner_id, tier
        """
    ).named_results())

    partners_reales = sorted({r["partner_id"] for r in reales}) or ["demo-partner-1", "demo-partner-2"]
    tiers = ["basico", "pro", "enterprise"]
    cubiertos = {(r["periodo"], r["partner_id"]) for r in reales}

    rows: list[tuple] = []
    for r in reales:
        exito_pct = round((r["exitosas"] / r["total"] * 100) if r["total"] else 0, 2)
        rows.append((
            r["periodo"], r["partner_id"], r["tier"] or "", r["total"], r["exitosas"],
            r["fallidas"], exito_pct, round(r["latencia"] or 0, 2), 0,
        ))

    for periodo in periodos:
        for partner_id in partners_reales:
            if (periodo, partner_id) in cubiertos:
                continue
            rnd = rng_for(TABLE, periodo, partner_id)
            total = rnd.randint(20, 400)
            exitosas = int(total * rnd.uniform(0.85, 0.99))
            rows.append((
                periodo, partner_id, rnd.choice(tiers), total, exitosas, total - exitosas,
                round(exitosas / total * 100, 2), round(rnd.uniform(80, 350), 2), 1,
            ))

    write_gold(gold, TABLE, COLUMNS, rows, periodos)
    log_run(gold, TABLE, periodos, len(rows), time.time() - t0)
    print(f"[{TABLE}] {len(rows)} filas escritas ({len(periodos)} períodos).")
