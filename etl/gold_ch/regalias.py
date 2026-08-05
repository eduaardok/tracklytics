"""GOLD_REGALIAS_PERIODO — C09 (OT-09, Financiero).

Real: FACT_LIQUIDACION_REGALIA (streams_periodo, monto ya neto de retención)
unido a DIM_CONTRATO_REGALIA/DIM_SELLO_DISCOGRAFICO. Se usa `fecha_calculo`
(cuándo se registró la liquidación) para bucketing por período.

S14-P3 eliminó el relleno demo (`rng_for`): `etl/gold/backfill_negocio.py`
llama a `POST /admin/liquidar` (misma fórmula real de
`api/paquetes/regalias/router.py::liquidar_periodo_interno`, no una
reimplementación) una vez por mes calendario de los 24 meses de historia,
sobre transacciones/ingresos publicitarios/reproducciones ya backfilleados
— así que `FACT_LIQUIDACION_REGALIA` tiene liquidaciones reales para todo
el rango. Un contrato/período sin liquidación real (streams_periodo=0 ese
mes) simplemente no tiene fila.
"""

import time

from gold_ch.base import VENTANA_ORIGEN_DIAS, fecha_inicio_sql, get_catalog_client, get_gold_client, log_run, periodo_sql, periodos_ventana, write_gold

TABLE = "GOLD_REGALIAS_PERIODO"
COLUMNS = [
    "granularidad", "fecha_inicio", "periodo", "contrato_id", "sello", "tipo_split", "monto_liquidado",
    "reproducciones_periodo", "porcentaje_aplicado", "es_estimado",
]


def run_gold_regalias(granularidad: str = "semana") -> None:
    t0 = time.time()
    ventana = periodos_ventana(granularidad)
    periodos = [p for p, _ in ventana]
    catalog = get_catalog_client()
    gold = get_gold_client()

    contratos = list(catalog.query(
        """
        SELECT c.contrato_id, ifNull(s.nombre, 'Independiente') AS sello
        FROM DIM_CONTRATO_REGALIA c
        LEFT JOIN DIM_SELLO_DISCOGRAFICO s ON s.sello_id = c.sello_id
        """
    ).named_results())
    sello_por_contrato = {c["contrato_id"]: c["sello"] for c in contratos}

    reales = list(catalog.query(
        f"""
        SELECT {periodo_sql('fecha_calculo', granularidad)} AS periodo,
               {fecha_inicio_sql('fecha_calculo', granularidad)} AS fecha_inicio,
               contrato_id, tipo_rightsholder,
               sum(monto) AS monto, sum(streams_periodo) AS streams
        FROM FACT_LIQUIDACION_REGALIA
        WHERE fecha_calculo >= now() - INTERVAL {VENTANA_ORIGEN_DIAS} DAY
        GROUP BY periodo, fecha_inicio, contrato_id, tipo_rightsholder
        """
    ).named_results())

    rows: list[tuple] = [
        (
            granularidad, r["fecha_inicio"], r["periodo"], r["contrato_id"], sello_por_contrato.get(r["contrato_id"], ""),
            r["tipo_rightsholder"], round(r["monto"], 2), int(r["streams"] or 0), 0.0, 0,
        )
        for r in reales
    ]

    write_gold(gold, TABLE, COLUMNS, rows, periodos, granularidad)
    log_run(gold, TABLE, periodos, len(rows), time.time() - t0, granularidad=granularidad)
    print(f"[{TABLE}] {len(rows)} filas escritas ({len(periodos)} períodos, granularidad={granularidad}).")
