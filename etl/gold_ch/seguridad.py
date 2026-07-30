"""GOLD_SEGURIDAD_PERIODO — C26/C27 (OT-29/31, Seguridad).

100% real: `FACT_AUDIT_LOG` (374 filas reales al momento de escribir este
módulo) agregado por semana de `timestamp` y por `accion` (tipo de evento
real, no una categoría inventada — ej. "registro_usuario", "pago_suscripcion",
"suspender_cuenta_automatica"). `FACT_STRIKE_USUARIO` para sanciones
emitidas; `suspensiones_automaticas` cuenta específicamente la acción real
`suspender_cuenta_automatica` (lockout por intentos fallidos o 3 strikes),
distinta de una suspensión manual por admin.
"""

import time

from gold_ch.base import get_catalog_client, get_gold_client, iso_weeks_back, log_run, periodo_sql, write_gold

TABLE = "GOLD_SEGURIDAD_PERIODO"
COLUMNS = [
    "periodo", "tipo_evento", "eventos_auditoria_total", "sanciones_emitidas",
    "suspensiones_automaticas", "tasa_suspension", "es_estimado",
]


def run_gold_seguridad() -> None:
    t0 = time.time()
    periodos = iso_weeks_back()
    catalog = get_catalog_client()
    gold = get_gold_client()

    eventos = list(catalog.query(
        f"""
        SELECT {periodo_sql('timestamp')} AS periodo, accion, count() AS n
        FROM FACT_AUDIT_LOG WHERE timestamp >= now() - INTERVAL 90 DAY
        GROUP BY periodo, accion
        """
    ).named_results())

    sanciones = {r["periodo"]: r["n"] for r in catalog.query(
        f"SELECT {periodo_sql('created_at')} AS periodo, count() AS n FROM FACT_STRIKE_USUARIO "
        f"WHERE created_at >= now() - INTERVAL 90 DAY GROUP BY periodo"
    ).named_results()}
    total_usuarios = catalog.command("SELECT count() FROM DIM_USUARIO") or 1

    rows: list[tuple] = []
    tipos_por_periodo: dict[str, int] = {}
    for r in eventos:
        rows.append((r["periodo"], r["accion"], r["n"], 0, 1 if r["accion"] == "suspender_cuenta_automatica" else 0, 0.0, 0))
        tipos_por_periodo[r["periodo"]] = tipos_por_periodo.get(r["periodo"], 0) + r["n"]

    for periodo in periodos:
        san = sanciones.get(periodo, 0)
        susp_auto = sum(1 for r in eventos if r["periodo"] == periodo and r["accion"] == "suspender_cuenta_automatica")
        tasa = round(susp_auto / total_usuarios * 100, 4)
        rows.append((periodo, "__resumen__", tipos_por_periodo.get(periodo, 0), san, susp_auto, tasa, 0))

    write_gold(gold, TABLE, COLUMNS, rows, periodos)
    log_run(gold, TABLE, periodos, len(rows), time.time() - t0)
    print(f"[{TABLE}] {len(rows)} filas escritas ({len(periodos)} períodos).")
