"""GOLD_SEGURIDAD_PERIODO — C26/C27 (OT-29/31, Seguridad).

100% real: `FACT_AUDIT_LOG` (374 filas reales al momento de escribir este
módulo) agregado por período de `timestamp` y por `accion` (tipo de evento
real, no una categoría inventada — ej. "registro_usuario", "pago_suscripcion",
"suspender_cuenta_automatica"). `FACT_STRIKE_USUARIO` para sanciones
emitidas; `suspensiones_automaticas` cuenta específicamente la acción real
`suspender_cuenta_automatica` (lockout por intentos fallidos o 3 strikes),
distinta de una suspensión manual por admin.

S14-P2: granularidad configurable. Sin demo-fill (100% real) — no se acota
por `PERIODOS_RELLENO_DEMO`, esa regla es solo para relleno con `rng_for`.
"""

import time

from gold_ch.base import VENTANA_ORIGEN_DIAS, get_catalog_client, get_gold_client, log_run, periodo_sql, periodos_ventana, write_gold

TABLE = "GOLD_SEGURIDAD_PERIODO"
COLUMNS = [
    "granularidad", "fecha_inicio", "periodo", "tipo_evento", "eventos_auditoria_total",
    "sanciones_emitidas", "suspensiones_automaticas", "tasa_suspension", "es_estimado",
]


def run_gold_seguridad(granularidad: str = "semana") -> None:
    t0 = time.time()
    ventana = periodos_ventana(granularidad)
    periodos = [p for p, _ in ventana]
    fecha_inicio_de = dict(ventana)
    catalog = get_catalog_client()
    gold = get_gold_client()

    eventos = list(catalog.query(
        f"""
        SELECT {periodo_sql('timestamp', granularidad)} AS periodo, accion, count() AS n
        FROM FACT_AUDIT_LOG WHERE timestamp >= now() - INTERVAL {VENTANA_ORIGEN_DIAS} DAY
        GROUP BY periodo, accion
        """
    ).named_results())

    sanciones = {r["periodo"]: r["n"] for r in catalog.query(
        f"SELECT {periodo_sql('created_at', granularidad)} AS periodo, count() AS n FROM FACT_STRIKE_USUARIO "
        f"WHERE created_at >= now() - INTERVAL {VENTANA_ORIGEN_DIAS} DAY GROUP BY periodo"
    ).named_results()}
    total_usuarios = catalog.command("SELECT count() FROM DIM_USUARIO") or 1

    rows: list[tuple] = []
    tipos_por_periodo: dict[str, int] = {}
    for r in eventos:
        if r["periodo"] not in fecha_inicio_de:
            continue
        rows.append((
            granularidad, fecha_inicio_de[r["periodo"]], r["periodo"], r["accion"], r["n"], 0,
            1 if r["accion"] == "suspender_cuenta_automatica" else 0, 0.0, 0,
        ))
        tipos_por_periodo[r["periodo"]] = tipos_por_periodo.get(r["periodo"], 0) + r["n"]

    for periodo in periodos:
        san = sanciones.get(periodo, 0)
        susp_auto = sum(1 for r in eventos if r["periodo"] == periodo and r["accion"] == "suspender_cuenta_automatica")
        tasa = round(susp_auto / total_usuarios * 100, 4)
        rows.append((granularidad, fecha_inicio_de[periodo], periodo, "__resumen__", tipos_por_periodo.get(periodo, 0), san, susp_auto, tasa, 0))

    write_gold(gold, TABLE, COLUMNS, rows, periodos, granularidad)
    log_run(gold, TABLE, periodos, len(rows), time.time() - t0, granularidad=granularidad)
    print(f"[{TABLE}] {len(rows)} filas escritas ({len(periodos)} períodos, granularidad={granularidad}).")
