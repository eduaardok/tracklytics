"""GOLD_FINANCIERO_PERIODO — C07/C08/C10/C11 (OT-07/08/10/11, Financiero).

100% real, agregado por período desde el catálogo:
- `ingresos_suscripciones`: FACT_TRANSACCION_PAGO (estado='exitosa',
  concepto='suscripcion').
- `ingresos_publicidad`: FACT_INGRESO_PUBLICITARIO.
- `gastos_total`: FACT_GASTO_OPERATIVO (estado='activo').
- `reembolsos_total`: FACT_REEMBOLSO (estado='procesado').
- `facturas_emitidas`: FACT_INVOICE. `facturas_cobradas`: invoices cuya
  transacción asociada quedó 'exitosa' en FACT_TRANSACCION_PAGO — no existe
  un estado "cobrada" propio en FACT_INVOICE (todas nacen 'emitido'), así que
  se deriva del pago real, no se inventa una columna.

`mrr` es el ingreso de suscripciones del período proyectado a mes —
aproximación explícita y documentada, porque "MRR" es un concepto mensual
por definición pero esta tabla ahora soporta 5 granularidades (S14-P2). El
multiplicador usa el promedio real de sub-unidades por mes de cada
granularidad (`MULTIPLICADOR_MRR`): para 'semana' se conserva el ×4.348
original; para 'mes' el multiplicador es 1 (ya es el ingreso mensual); para
'dia'/'trimestre'/'anio' se escala proporcionalmente. Sin este ajuste, MRR
calculado sobre grano 'mes' habría salido 4.3x inflado — no es parte del
prompt original de S14-P2 (que solo menciona la excepción de proyecciones en
`consumo_genero.py`), pero se adaptó para que el número tenga sentido en las
granularidades nuevas (ver BITACORA_S14.md, P2, "premisas falsas").
`arr = mrr × 12`.

Sin demo-fill: los 4 hechos fuente (transacciones, ingreso publicitario,
gastos, reembolsos) tienen datos reales en todas las semanas recientes —
períodos sin actividad real quedan en 0, que es el valor real, no estimado
(por eso este módulo no usa `rng_for` ni se acota por `PERIODOS_RELLENO_DEMO`
— esa regla es solo para relleno demo).
"""

import time

from gold_ch.base import VENTANA_ORIGEN_DIAS, fecha_inicio_sql, get_catalog_client, get_gold_client, log_run, periodo_sql, periodos_ventana, write_gold

TABLE = "GOLD_FINANCIERO_PERIODO"
COLUMNS = [
    "granularidad", "fecha_inicio", "periodo", "mrr", "arr", "ingresos_suscripciones", "ingresos_publicidad",
    "gastos_total", "reembolsos_total", "margen_neto", "facturas_emitidas",
    "facturas_cobradas", "tasa_cobro", "es_estimado",
]
MULTIPLICADOR_MRR = {
    "dia": 365.25 / 12,   # días/mes promedio
    "semana": 4.348,      # semanas/mes promedio (original, S13-P3a)
    "mes": 1.0,           # ya es el ingreso mensual
    "trimestre": 1 / 3,
    "anio": 1 / 12,
}


def run_gold_financiero(granularidad: str = "semana") -> None:
    t0 = time.time()
    ventana = periodos_ventana(granularidad)
    periodos = [p for p, _ in ventana]
    fecha_inicio_de = dict(ventana)
    catalog = get_catalog_client()
    gold = get_gold_client()
    multiplicador = MULTIPLICADOR_MRR[granularidad]

    ingresos_susc = {r["periodo"]: r["monto"] for r in catalog.query(
        f"SELECT {periodo_sql('fecha', granularidad)} AS periodo, sum(monto) AS monto FROM FACT_TRANSACCION_PAGO "
        f"WHERE estado = 'exitosa' AND concepto = 'suscripcion' AND fecha >= now() - INTERVAL {VENTANA_ORIGEN_DIAS} DAY GROUP BY periodo"
    ).named_results()}
    ingresos_ads = {r["periodo"]: r["monto"] for r in catalog.query(
        f"SELECT {periodo_sql('fecha', granularidad)} AS periodo, sum(monto) AS monto FROM FACT_INGRESO_PUBLICITARIO "
        f"WHERE fecha >= now() - INTERVAL {VENTANA_ORIGEN_DIAS} DAY GROUP BY periodo"
    ).named_results()}
    gastos = {r["periodo"]: r["monto"] for r in catalog.query(
        f"SELECT {periodo_sql('fecha', granularidad)} AS periodo, sum(monto) AS monto FROM FACT_GASTO_OPERATIVO "
        f"WHERE estado = 'activo' AND fecha >= today() - {VENTANA_ORIGEN_DIAS} GROUP BY periodo"
    ).named_results()}
    reembolsos = {r["periodo"]: r["monto"] for r in catalog.query(
        f"SELECT {periodo_sql('fecha', granularidad)} AS periodo, sum(monto) AS monto FROM FACT_REEMBOLSO "
        f"WHERE estado = 'procesado' AND fecha >= now() - INTERVAL {VENTANA_ORIGEN_DIAS} DAY GROUP BY periodo"
    ).named_results()}
    facturas = {r["periodo"]: (r["emitidas"], r["cobradas"]) for r in catalog.query(
        f"""
        SELECT {periodo_sql('i.fecha_emision', granularidad)} AS periodo, count() AS emitidas,
               countIf(t.estado = 'exitosa') AS cobradas
        FROM FACT_INVOICE i
        LEFT JOIN (SELECT transaccion_id, estado FROM FACT_TRANSACCION_PAGO) t ON t.transaccion_id = i.transaccion_id
        WHERE i.fecha_emision >= now() - INTERVAL {VENTANA_ORIGEN_DIAS} DAY
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
        mrr = round(susc * multiplicador, 2)
        arr = round(mrr * 12, 2)
        margen = round((susc + ads) - gasto - reemb, 2)
        tasa_cobro = round((cobradas / emitidas * 100) if emitidas else 0, 2)
        rows.append((
            granularidad, fecha_inicio_de[periodo], periodo, mrr, arr, round(susc, 2), round(ads, 2), round(gasto, 2),
            round(reemb, 2), margen, emitidas, cobradas, tasa_cobro, 0,
        ))

    write_gold(gold, TABLE, COLUMNS, rows, periodos, granularidad)
    log_run(gold, TABLE, periodos, len(rows), time.time() - t0, granularidad=granularidad)
    print(f"[{TABLE}] {len(rows)} filas escritas ({len(periodos)} períodos, granularidad={granularidad}).")
