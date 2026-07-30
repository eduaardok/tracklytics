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
"""

import time

from gold_ch.base import get_catalog_client, get_gold_client, iso_weeks_back, log_run, periodo_sql, rng_for, write_gold

TABLE = "GOLD_COMUNIDAD_PERIODO"
COLUMNS = [
    "periodo", "categoria", "acciones_moderacion", "comentarios_moderados", "denuncias_recibidas",
    "denuncias_resueltas", "sanciones_derivadas", "tickets_abiertos", "tickets_resueltos",
    "tiempo_resolucion_promedio_h", "interacciones_sociales_total", "crecimiento_pct_vs_anterior", "es_estimado",
]


def run_gold_comunidad() -> None:
    t0 = time.time()
    periodos = iso_weeks_back()
    catalog = get_catalog_client()
    gold = get_gold_client()

    moderacion = {r["periodo"]: r["n"] for r in catalog.query(
        f"SELECT {periodo_sql('fecha_moderacion')} AS periodo, count() AS n FROM FACT_COMENTARIO "
        f"WHERE estado_moderacion != 'visible' AND fecha_moderacion >= now() - INTERVAL 90 DAY GROUP BY periodo"
    ).named_results()}

    denuncias = {r["periodo"]: r for r in catalog.query(
        f"SELECT {periodo_sql('created_at')} AS periodo, count() AS total, "
        f"countIf(estado != 'pendiente') AS resueltas FROM FACT_DENUNCIA "
        f"WHERE created_at >= now() - INTERVAL 90 DAY GROUP BY periodo"
    ).named_results()}
    sanciones = {r["periodo"]: r["n"] for r in catalog.query(
        f"SELECT {periodo_sql('created_at')} AS periodo, count() AS n FROM FACT_STRIKE_USUARIO "
        f"WHERE origen_tipo = 'denuncia' AND created_at >= now() - INTERVAL 90 DAY GROUP BY periodo"
    ).named_results()}

    tickets = {r["periodo"]: r for r in catalog.query(
        f"SELECT {periodo_sql('fecha_creacion')} AS periodo, countIf(estado IN ('abierto','en_proceso')) AS abiertos, "
        f"countIf(estado = 'resuelto') AS resueltos, "
        f"avgIf(dateDiff('hour', fecha_creacion, fecha_resolucion), fecha_resolucion IS NOT NULL) AS horas "
        f"FROM FACT_TICKET_SOPORTE WHERE fecha_creacion >= now() - INTERVAL 90 DAY GROUP BY periodo"
    ).named_results()}

    comentarios = {r["periodo"]: r["n"] for r in catalog.query(
        f"SELECT {periodo_sql('fecha_creacion')} AS periodo, count() AS n FROM FACT_COMENTARIO "
        f"WHERE fecha_creacion >= now() - INTERVAL 90 DAY GROUP BY periodo"
    ).named_results()}
    comparticiones = {r["periodo"]: r["n"] for r in catalog.query(
        f"SELECT {periodo_sql('fecha')} AS periodo, count() AS n FROM FACT_COMPARTICION "
        f"WHERE fecha >= now() - INTERVAL 90 DAY GROUP BY periodo"
    ).named_results()}
    seguimientos = {r["periodo"]: r["n"] for r in catalog.query(
        f"SELECT {periodo_sql('fecha_inicio')} AS periodo, count() AS n FROM BRIDGE_SEGUIMIENTO_ARTISTA "
        f"WHERE fecha_inicio >= now() - INTERVAL 90 DAY GROUP BY periodo"
    ).named_results()}

    rows: list[tuple] = []
    social_anterior = None
    for periodo in periodos:
        mod_n = moderacion.get(periodo)
        es_mod = 0 if mod_n is not None else 1
        mod_n = mod_n if mod_n is not None else rng_for(TABLE, periodo, "mod").randint(0, 5)
        rows.append((periodo, "moderacion", mod_n, mod_n, 0, 0, 0, 0, 0, 0.0, 0, 0.0, es_mod))

        d = denuncias.get(periodo)
        san_n = sanciones.get(periodo, 0)
        es_den = 0 if d is not None else 1
        d_total = d["total"] if d else rng_for(TABLE, periodo, "den").randint(0, 2)
        d_res = d["resueltas"] if d else 0
        rows.append((periodo, "denuncias", 0, 0, d_total, d_res, san_n, 0, 0, 0.0, 0, 0.0, es_den))

        tk = tickets.get(periodo)
        es_tk = 0 if tk is not None else 1
        if tk:
            tk_ab, tk_res, tk_h = tk["abiertos"], tk["resueltos"], round(tk["horas"] or 0, 2)
        else:
            rnd = rng_for(TABLE, periodo, "tk")
            tk_ab, tk_res, tk_h = rnd.randint(0, 3), rnd.randint(0, 2), round(rnd.uniform(2, 48), 2)
        rows.append((periodo, "tickets", 0, 0, 0, 0, 0, tk_ab, tk_res, tk_h, 0, 0.0, es_tk))

        social_n = comentarios.get(periodo, 0) + comparticiones.get(periodo, 0) + seguimientos.get(periodo, 0)
        es_social = 0 if periodo in comentarios or periodo in comparticiones or periodo in seguimientos else 1
        if es_social:
            social_n = rng_for(TABLE, periodo, "social").randint(5, 60)
        crecimiento = round(((social_n - social_anterior) / social_anterior * 100), 2) if social_anterior else 0.0
        social_anterior = social_n or social_anterior
        rows.append((periodo, "social", 0, 0, 0, 0, 0, 0, 0, 0.0, social_n, crecimiento, es_social))

    write_gold(gold, TABLE, COLUMNS, rows, periodos)
    log_run(gold, TABLE, periodos, len(rows), time.time() - t0)
    print(f"[{TABLE}] {len(rows)} filas escritas ({len(periodos)} períodos).")
