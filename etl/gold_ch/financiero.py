"""GOLD_FINANCIERO_PERIODO — C07/C08/C10/C11 (OT-07/08/10/11, Financiero).

100% real, agregado por semana desde el catálogo:
- `ingresos_suscripciones`: FACT_TRANSACCION_PAGO (estado='exitosa',
  concepto='suscripcion').
- `ingresos_publicidad`: FACT_INGRESO_PUBLICITARIO.
- `gastos_total`: FACT_GASTO_OPERATIVO (estado='activo').
- `reembolsos_total`: FACT_REEMBOLSO (estado='procesado').
- `facturas_emitidas`: FACT_INVOICE. `facturas_cobradas`: invoices cuya
  transacción asociada quedó 'exitosa' en FACT_TRANSACCION_PAGO — no existe
  un estado "cobrada" propio en FACT_INVOICE (todas nacen 'emitido'), así que
  se deriva del pago real, no se inventa una columna.

`mrr` es el ingreso de suscripciones de la SEMANA proyectado a mes
(× 4.348, semanas/mes promedio) — aproximación explícita, documentada,
porque el grano de todas las tablas Gold es semanal (`periodo` ISO-week) y
"MRR" es un concepto mensual por definición. `arr = mrr × 12`.

Sin demo-fill: los 4 hechos fuente (transacciones, ingreso publicitario,
gastos, reembolsos) tienen datos reales en todas las semanas recientes —
semanas sin actividad real quedan en 0, que es el valor real, no estimado.
"""

import time

from gold_ch.base import get_catalog_client, get_gold_client, iso_weeks_back, log_run, periodo_sql, write_gold

TABLE = "GOLD_FINANCIERO_PERIODO"
COLUMNS = [
    "periodo", "mrr", "arr", "ingresos_suscripciones", "ingresos_publicidad",
    "gastos_total", "reembolsos_total", "margen_neto", "facturas_emitidas",
    "facturas_cobradas", "tasa_cobro", "es_estimado",
]
SEMANAS_POR_MES = 4.348


def run_gold_financiero() -> None:
    t0 = time.time()
    periodos = iso_weeks_back()
    catalog = get_catalog_client()
    gold = get_gold_client()

    ingresos_susc = {r["periodo"]: r["monto"] for r in catalog.query(
        f"SELECT {periodo_sql('fecha')} AS periodo, sum(monto) AS monto FROM FACT_TRANSACCION_PAGO "
        f"WHERE estado = 'exitosa' AND concepto = 'suscripcion' AND fecha >= now() - INTERVAL 90 DAY GROUP BY periodo"
    ).named_results()}
    ingresos_ads = {r["periodo"]: r["monto"] for r in catalog.query(
        f"SELECT {periodo_sql('fecha')} AS periodo, sum(monto) AS monto FROM FACT_INGRESO_PUBLICITARIO "
        f"WHERE fecha >= now() - INTERVAL 90 DAY GROUP BY periodo"
    ).named_results()}
    gastos = {r["periodo"]: r["monto"] for r in catalog.query(
        f"SELECT {periodo_sql('fecha')} AS periodo, sum(monto) AS monto FROM FACT_GASTO_OPERATIVO "
        f"WHERE estado = 'activo' AND fecha >= today() - 90 GROUP BY periodo"
    ).named_results()}
    reembolsos = {r["periodo"]: r["monto"] for r in catalog.query(
        f"SELECT {periodo_sql('fecha')} AS periodo, sum(monto) AS monto FROM FACT_REEMBOLSO "
        f"WHERE estado = 'procesado' AND fecha >= now() - INTERVAL 90 DAY GROUP BY periodo"
    ).named_results()}
    facturas = {r["periodo"]: (r["emitidas"], r["cobradas"]) for r in catalog.query(
        f"""
        SELECT {periodo_sql('i.fecha_emision')} AS periodo, count() AS emitidas,
               countIf(t.estado = 'exitosa') AS cobradas
        FROM FACT_INVOICE i
        LEFT JOIN (SELECT transaccion_id, estado FROM FACT_TRANSACCION_PAGO) t ON t.transaccion_id = i.transaccion_id
        WHERE i.fecha_emision >= now() - INTERVAL 90 DAY
        GROUP BY periodo
        """
    ).named_results()}

    rows: list[tuple] = []
    for periodo in periodos:
        susc = ingresos_susc.get(periodo, 0.0) or 0.0
        ads = ingresos_ads.get(periodo, 0.0) or 0.0
        gasto = gastos.get(periodo, 0.0) or 0.0
        reemb = reembolsos.get(periodo, 0.0) or 0.0
        emitidas, cobradas = facturas.get(periodo, (0, 0))
        mrr = round(susc * SEMANAS_POR_MES, 2)
        arr = round(mrr * 12, 2)
        margen = round((susc + ads) - gasto - reemb, 2)
        tasa_cobro = round((cobradas / emitidas * 100) if emitidas else 0, 2)
        rows.append((
            periodo, mrr, arr, round(susc, 2), round(ads, 2), round(gasto, 2),
            round(reemb, 2), margen, emitidas, cobradas, tasa_cobro, 0,
        ))

    write_gold(gold, TABLE, COLUMNS, rows, periodos)
    log_run(gold, TABLE, periodos, len(rows), time.time() - t0)
    print(f"[{TABLE}] {len(rows)} filas escritas ({len(periodos)} períodos).")
