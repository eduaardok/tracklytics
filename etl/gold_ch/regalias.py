"""GOLD_REGALIAS_PERIODO — C09 (OT-09, Financiero).

Real: FACT_LIQUIDACION_REGALIA (streams_periodo, monto ya neto de retención)
unido a DIM_CONTRATO_REGALIA/DIM_SELLO_DISCOGRAFICO.

S14-P3 eliminó el relleno demo (`rng_for`): `etl/gold/backfill_negocio.py`
llama a `POST /admin/liquidar` (misma fórmula real de
`api/paquetes/regalias/router.py::liquidar_periodo_interno`, no una
reimplementación) una vez por mes calendario de los 24 meses de historia,
sobre transacciones/ingresos publicitarios/reproducciones ya backfilleados
— así que `FACT_LIQUIDACION_REGALIA` tiene liquidaciones reales para todo
el rango. Un contrato/período sin liquidación real (streams_periodo=0 ese
mes) simplemente no tiene fila.

S14-P4 (Fase 4): el bucketing por período pasó de `fecha_calculo` a
`periodo_inicio`. `fecha_calculo` es CUÁNDO se corrió el cálculo (siempre
"ahora" al momento del backfill/regeneración, `DEFAULT now()`), no el
período que la liquidación cubre — bucketear por ahí hacía que TODAS las
liquidaciones de una corrida (aunque cubrieran 24 meses distintos de
`periodo_inicio`/`periodo_fin`) cayeran en el mismo período Gold reciente,
dejando el resto de la ventana vacía pese a haber datos reales. `periodo_
inicio` es el inicio real del período liquidado — bucketear por ahí es lo
que hace que un informe "por período" tenga sentido como serie histórica.
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
        SELECT {periodo_sql('periodo_inicio', granularidad)} AS periodo,
               {fecha_inicio_sql('periodo_inicio', granularidad)} AS fecha_inicio,
               contrato_id, tipo_rightsholder,
               sum(monto) AS monto, sum(streams_periodo) AS streams
        FROM FACT_LIQUIDACION_REGALIA
        WHERE periodo_inicio >= today() - {VENTANA_ORIGEN_DIAS}
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
