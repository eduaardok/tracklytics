"""GOLD_PIPELINE_PERIODO — C12/C13 (OT-12/13, Ingeniería de Datos).

100% real: `ETL_LOGS` (duración/registros insertados-rechazados por corrida
real del pipeline, agregado por semana de `run_timestamp`) y `FACT_TRACKS`
(desglose por `source_type`, agregado por semana de `inserted_at` — columna
real de auditoría de carga, no fabricada para este reporte).
"""

import time

from gold_ch.base import get_catalog_client, get_gold_client, iso_weeks_back, log_run, periodo_sql, write_gold

TABLE = "GOLD_PIPELINE_PERIODO"
COLUMNS = [
    "periodo", "duracion_promedio_s", "registros_insertados", "registros_rechazados",
    "tasa_rechazo", "registros_real", "registros_synthetic", "registros_uploaded", "es_estimado",
]


def run_gold_pipeline() -> None:
    t0 = time.time()
    periodos = iso_weeks_back()
    catalog = get_catalog_client()
    gold = get_gold_client()

    etl = {r["periodo"]: r for r in catalog.query(
        f"""
        SELECT {periodo_sql('run_timestamp')} AS periodo, avg(duration_seconds) AS dur,
               sum(records_inserted) AS ins, sum(records_rejected) AS rej
        FROM ETL_LOGS WHERE run_timestamp >= now() - INTERVAL 180 DAY GROUP BY periodo
        """
    ).named_results()}

    fuentes = {}
    for r in catalog.query(
        f"""
        SELECT {periodo_sql('inserted_at')} AS periodo, source_type, count() AS n
        FROM FACT_TRACKS WHERE inserted_at >= now() - INTERVAL 180 DAY GROUP BY periodo, source_type
        """
    ).named_results():
        fuentes.setdefault(r["periodo"], {})[r["source_type"]] = r["n"]

    rows: list[tuple] = []
    for periodo in periodos:
        e = etl.get(periodo)
        f = fuentes.get(periodo, {})
        ins = int(e["ins"]) if e else 0
        rej = int(e["rej"]) if e else 0
        tasa = round((rej / (ins + rej) * 100) if (ins + rej) else 0, 2)
        rows.append((
            periodo, round(float(e["dur"]) if e else 0, 2), ins, rej, tasa,
            int(f.get("real", 0)), int(f.get("synthetic", 0)), int(f.get("user_uploaded", 0)), 0,
        ))

    write_gold(gold, TABLE, COLUMNS, rows, periodos)
    log_run(gold, TABLE, periodos, len(rows), time.time() - t0)
    print(f"[{TABLE}] {len(rows)} filas escritas ({len(periodos)} períodos).")
