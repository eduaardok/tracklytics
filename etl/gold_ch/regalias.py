"""GOLD_REGALIAS_PERIODO — C09 (OT-09, Financiero).

Real: FACT_LIQUIDACION_REGALIA (streams_periodo, monto ya neto de retención)
unido a DIM_CONTRATO_REGALIA/DIM_SELLO_DISCOGRAFICO. La tabla real tiene
solo 3 contratos y sus liquidaciones caen mayormente fuera de la ventana
reciente (fechas de prueba entre 2022-2028) — se usa `fecha_calculo`
(cuándo se registró la liquidación) para bucketing por período; los
períodos de la ventana sin liquidación real se rellenan con demo usando los
MISMOS 3 contratos/sellos reales (no se inventan contratos nuevos), marcadas
`es_estimado=1`.

S14-P2: granularidad configurable. El relleno demo solo cubre los
`PERIODOS_RELLENO_DEMO` períodos más recientes.
"""

import time

from gold_ch.base import (
    VENTANA_ORIGEN_DIAS, fecha_inicio_sql, get_catalog_client, get_gold_client,
    log_run, periodo_sql, periodos_ventana, permite_relleno_demo, rng_for, write_gold,
)

TABLE = "GOLD_REGALIAS_PERIODO"
COLUMNS = [
    "granularidad", "fecha_inicio", "periodo", "contrato_id", "sello", "tipo_split", "monto_liquidado",
    "reproducciones_periodo", "porcentaje_aplicado", "es_estimado",
]


def run_gold_regalias(granularidad: str = "semana") -> None:
    t0 = time.time()
    ventana = periodos_ventana(granularidad)
    periodos = [p for p, _ in ventana]
    fecha_inicio_de = dict(ventana)
    catalog = get_catalog_client()
    gold = get_gold_client()

    contratos = list(catalog.query(
        """
        SELECT c.contrato_id, ifNull(s.nombre, 'Independiente') AS sello,
               c.pct_master_sello, c.pct_master_artista, c.pct_master_productor
        FROM DIM_CONTRATO_REGALIA c
        LEFT JOIN DIM_SELLO_DISCOGRAFICO s ON s.sello_id = c.sello_id
        """
    ).named_results())
    contratos = contratos or [{"contrato_id": "demo-contrato-1", "sello": "Independiente",
                                "pct_master_sello": 40, "pct_master_artista": 40, "pct_master_productor": 20}]

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
    sello_por_contrato = {c["contrato_id"]: c["sello"] for c in contratos}
    cubiertos = {(r["periodo"], r["contrato_id"]) for r in reales}

    rows: list[tuple] = []
    for r in reales:
        rows.append((
            granularidad, r["fecha_inicio"], r["periodo"], r["contrato_id"], sello_por_contrato.get(r["contrato_id"], ""),
            r["tipo_rightsholder"], round(r["monto"], 2), int(r["streams"] or 0), 0.0, 0,
        ))

    for periodo in periodos:
        if not permite_relleno_demo(periodos, periodo):
            continue
        fi = fecha_inicio_de[periodo]
        for c in contratos:
            if (periodo, c["contrato_id"]) in cubiertos:
                continue
            rnd = rng_for(TABLE, periodo, c["contrato_id"])
            streams = rnd.randint(500, 15000)
            monto = round(streams * rnd.uniform(0.002, 0.006), 2)
            rows.append((
                granularidad, fi, periodo, c["contrato_id"], c["sello"], "sello",
                monto, streams, float(c["pct_master_sello"] or 0), 1,
            ))

    write_gold(gold, TABLE, COLUMNS, rows, periodos, granularidad)
    log_run(gold, TABLE, periodos, len(rows), time.time() - t0, granularidad=granularidad)
    print(f"[{TABLE}] {len(rows)} filas escritas ({len(periodos)} períodos, granularidad={granularidad}).")
