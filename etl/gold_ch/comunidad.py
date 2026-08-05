"""GOLD_COMUNIDAD_PERIODO — C22/C23/C24/C25 (OT-24/25/26/27, Comunidad y Soporte).

Real, una fila por `categoria` y período (cada categoría solo llena las
columnas que le corresponden, el resto queda en 0 — mismo criterio que
"una tabla, varios informes" del resto de esta capa):
- `moderacion`: FACT_COMENTARIO (estado_moderacion != 'visible' = acción de
  moderación real, fecha_moderacion).
- `denuncias`: FACT_DENUNCIA (estado, created_at) + FACT_STRIKE_USUARIO
  (sanciones derivadas, `origen_tipo='denuncia'`).
- `tickets`: FACT_TICKET_SOPORTE (estado, fecha_creacion/fecha_resolucion).
- `social`: FACT_COMENTARIO + FACT_COMPARTICION + BRIDGE_SEGUIMIENTO_ARTISTA
  como "interacciones sociales totales"; `crecimiento_pct_vs_anterior` se
  calcula sobre esa serie real ya armada.

S14-P3 eliminó el relleno demo (`rng_for`): `etl/gold/backfill_negocio.py`
genera comentarios, denuncias, tickets y actividad social real para los 24
meses de historia — un período sin dato real en alguna sub-categoría
simplemente no tiene fila para esa categoría.
"""

import time

from gold_ch.base import VENTANA_ORIGEN_DIAS, fecha_inicio_sql, get_catalog_client, get_gold_client, log_run, periodo_sql, periodos_ventana, write_gold

TABLE = "GOLD_COMUNIDAD_PERIODO"
COLUMNS = [
    "granularidad", "fecha_inicio", "periodo", "categoria", "acciones_moderacion", "comentarios_moderados",
    "denuncias_recibidas", "denuncias_resueltas", "sanciones_derivadas", "tickets_abiertos", "tickets_resueltos",
    "tiempo_resolucion_promedio_h", "interacciones_sociales_total", "crecimiento_pct_vs_anterior", "es_estimado",
]


def run_gold_comunidad(granularidad: str = "semana") -> None:
    t0 = time.time()
    ventana = periodos_ventana(granularidad)
    periodos = [p for p, _ in ventana]
    fecha_inicio_de = dict(ventana)
    catalog = get_catalog_client()
    gold = get_gold_client()

    moderacion = {r["periodo"]: r["n"] for r in catalog.query(
        f"SELECT {periodo_sql('fecha_moderacion', granularidad)} AS periodo, count() AS n FROM FACT_COMENTARIO "
        f"WHERE estado_moderacion != 'visible' AND fecha_moderacion >= now() - INTERVAL {VENTANA_ORIGEN_DIAS} DAY GROUP BY periodo"
    ).named_results()}

    denuncias = {r["periodo"]: r for r in catalog.query(
        f"SELECT {periodo_sql('created_at', granularidad)} AS periodo, count() AS total, "
        f"countIf(estado != 'pendiente') AS resueltas FROM FACT_DENUNCIA "
        f"WHERE created_at >= now() - INTERVAL {VENTANA_ORIGEN_DIAS} DAY GROUP BY periodo"
    ).named_results()}
    sanciones = {r["periodo"]: r["n"] for r in catalog.query(
        f"SELECT {periodo_sql('created_at', granularidad)} AS periodo, count() AS n FROM FACT_STRIKE_USUARIO "
        f"WHERE origen_tipo = 'denuncia' AND created_at >= now() - INTERVAL {VENTANA_ORIGEN_DIAS} DAY GROUP BY periodo"
    ).named_results()}

    tickets = {r["periodo"]: r for r in catalog.query(
        f"SELECT {periodo_sql('fecha_creacion', granularidad)} AS periodo, countIf(estado IN ('abierto','en_proceso')) AS abiertos, "
        f"countIf(estado = 'resuelto') AS resueltos, "
        f"avgIf(dateDiff('hour', fecha_creacion, fecha_resolucion), fecha_resolucion IS NOT NULL) AS horas "
        f"FROM FACT_TICKET_SOPORTE WHERE fecha_creacion >= now() - INTERVAL {VENTANA_ORIGEN_DIAS} DAY GROUP BY periodo"
    ).named_results()}

    comentarios = {r["periodo"]: r["n"] for r in catalog.query(
        f"SELECT {periodo_sql('fecha_creacion', granularidad)} AS periodo, count() AS n FROM FACT_COMENTARIO "
        f"WHERE fecha_creacion >= now() - INTERVAL {VENTANA_ORIGEN_DIAS} DAY GROUP BY periodo"
    ).named_results()}
    comparticiones = {r["periodo"]: r["n"] for r in catalog.query(
        f"SELECT {periodo_sql('fecha', granularidad)} AS periodo, count() AS n FROM FACT_COMPARTICION "
        f"WHERE fecha >= now() - INTERVAL {VENTANA_ORIGEN_DIAS} DAY GROUP BY periodo"
    ).named_results()}
    seguimientos = {r["periodo"]: r["n"] for r in catalog.query(
        f"SELECT {periodo_sql('fecha_inicio', granularidad)} AS periodo, count() AS n FROM BRIDGE_SEGUIMIENTO_ARTISTA "
        f"WHERE fecha_inicio >= now() - INTERVAL {VENTANA_ORIGEN_DIAS} DAY GROUP BY periodo"
    ).named_results()}

    rows: list[tuple] = []
    social_anterior = None
    for periodo in periodos:
        fi = fecha_inicio_de[periodo]

        mod_n = moderacion.get(periodo)
        if mod_n is not None:
            rows.append((granularidad, fi, periodo, "moderacion", mod_n, mod_n, 0, 0, 0, 0, 0, 0.0, 0, 0.0, 0))

        d = denuncias.get(periodo)
        if d is not None:
            san_n = sanciones.get(periodo, 0)
            rows.append((granularidad, fi, periodo, "denuncias", 0, 0, d["total"], d["resueltas"], san_n, 0, 0, 0.0, 0, 0.0, 0))

        tk = tickets.get(periodo)
        if tk:
            tk_h = round(tk["horas"] or 0, 2)
            rows.append((granularidad, fi, periodo, "tickets", 0, 0, 0, 0, 0, tk["abiertos"], tk["resueltos"], tk_h, 0, 0.0, 0))

        tiene_social_real = periodo in comentarios or periodo in comparticiones or periodo in seguimientos
        if not tiene_social_real:
            continue
        social_n = comentarios.get(periodo, 0) + comparticiones.get(periodo, 0) + seguimientos.get(periodo, 0)
        crecimiento = round(((social_n - social_anterior) / social_anterior * 100), 2) if social_anterior else 0.0
        social_anterior = social_n or social_anterior
        rows.append((granularidad, fi, periodo, "social", 0, 0, 0, 0, 0, 0, 0, 0.0, social_n, crecimiento, 0))

    write_gold(gold, TABLE, COLUMNS, rows, periodos, granularidad)
    log_run(gold, TABLE, periodos, len(rows), time.time() - t0, granularidad=granularidad)
    print(f"[{TABLE}] {len(rows)} filas escritas ({len(periodos)} períodos, granularidad={granularidad}).")
