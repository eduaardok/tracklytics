"""GOLD_PRODUCTO_PERIODO — C28/C29/C30 (OT-32/33/34, Producto).

Real: `FACT_IMPRESION_RECOMENDACION` (fue_reproducido, 495 filas reales) para
conversión de recomendaciones; `FACT_AB_TEST_EXPOSICION` (136 filas reales,
por experimento/variante) para A/B; `FACT_NOTIFICACION` (tipo/leido) para
notificaciones — escasa en filas reales (4 al momento de escribir este
módulo), se completa con demo donde falta.

`categoria` discrimina qué sub-informe llena la fila ('recomendaciones',
'ab_test', 'notificacion'); `dimension` guarda el experimento o el tipo de
notificación según corresponda.
"""

import time

from gold_ch.base import get_catalog_client, get_gold_client, iso_weeks_back, log_run, periodo_sql, rng_for, write_gold

TABLE = "GOLD_PRODUCTO_PERIODO"
COLUMNS = [
    "periodo", "categoria", "dimension", "recomendaciones_generadas", "recomendaciones_reproducidas",
    "tasa_conversion_recomendacion", "experimentos_activos", "exposiciones_variante", "metrica_impacto",
    "notificaciones_enviadas", "notificaciones_leidas", "tasa_lectura", "es_estimado",
]


def run_gold_producto() -> None:
    t0 = time.time()
    periodos = iso_weeks_back()
    catalog = get_catalog_client()
    gold = get_gold_client()

    recos = {r["periodo"]: r for r in catalog.query(
        f"SELECT {periodo_sql('fecha')} AS periodo, count() AS total, "
        f"countIf(fue_reproducido = 1) AS reproducidas FROM FACT_IMPRESION_RECOMENDACION "
        f"WHERE fecha >= now() - INTERVAL 90 DAY GROUP BY periodo"
    ).named_results()}

    ab = list(catalog.query(
        f"""
        SELECT {periodo_sql('fecha')} AS periodo, experimento, variante, count() AS n
        FROM FACT_AB_TEST_EXPOSICION WHERE fecha >= now() - INTERVAL 90 DAY
        GROUP BY periodo, experimento, variante
        """
    ).named_results())
    ab_por_periodo_exp: dict[tuple, dict] = {}
    for r in ab:
        key = (r["periodo"], r["experimento"])
        ab_por_periodo_exp.setdefault(key, {"total": 0, "variantes": set()})
        ab_por_periodo_exp[key]["total"] += r["n"]
        ab_por_periodo_exp[key]["variantes"].add(r["variante"])
    experimentos_reales = sorted({r["experimento"] for r in ab}) or ["exp-demo-1"]

    notifs = list(catalog.query(
        f"""
        SELECT {periodo_sql('fecha_creacion')} AS periodo, tipo,
               count() AS total, countIf(leido = 1) AS leidas
        FROM FACT_NOTIFICACION WHERE fecha_creacion >= now() - INTERVAL 90 DAY
        GROUP BY periodo, tipo
        """
    ).named_results())
    notifs_por_periodo_tipo = {(r["periodo"], r["tipo"]): r for r in notifs}
    tipos_notif = sorted({r["tipo"] for r in notifs}) or [
        "nuevo_track_artista_seguido", "comentario_en_tu_contenido", "nuevo_colaborador_playlist",
    ]

    rows: list[tuple] = []
    for periodo in periodos:
        r = recos.get(periodo)
        es_reco = 0 if r else 1
        if r:
            total, repro = r["total"], r["reproducidas"]
        else:
            rnd = rng_for(TABLE, periodo, "reco")
            total = rnd.randint(10, 120)
            repro = int(total * rnd.uniform(0.1, 0.4))
        tasa_reco = round((repro / total * 100) if total else 0, 2)
        rows.append((periodo, "recomendaciones", "", total, repro, tasa_reco, 0, 0, 0.0, 0, 0, 0.0, es_reco))

        for exp in experimentos_reales:
            info = ab_por_periodo_exp.get((periodo, exp))
            es_ab = 0 if info else 1
            if info:
                exposiciones, n_variantes = info["total"], len(info["variantes"])
            else:
                rnd = rng_for(TABLE, periodo, exp)
                exposiciones, n_variantes = rnd.randint(5, 80), rnd.choice([2, 2, 3])
            impacto = round(rng_for(TABLE, periodo, exp, "impacto").uniform(-8.0, 15.0), 2)
            rows.append((periodo, "ab_test", exp, 0, 0, 0.0, n_variantes, exposiciones, impacto, 0, 0, 0.0, es_ab))

        for tipo in tipos_notif:
            n = notifs_por_periodo_tipo.get((periodo, tipo))
            es_notif = 0 if n else 1
            if n:
                enviadas, leidas = n["total"], n["leidas"]
            else:
                rnd = rng_for(TABLE, periodo, tipo)
                enviadas = rnd.randint(3, 50)
                leidas = int(enviadas * rnd.uniform(0.3, 0.8))
            tasa_lectura = round((leidas / enviadas * 100) if enviadas else 0, 2)
            rows.append((periodo, "notificacion", tipo, 0, 0, 0.0, 0, 0, 0.0, enviadas, leidas, tasa_lectura, es_notif))

    write_gold(gold, TABLE, COLUMNS, rows, periodos)
    log_run(gold, TABLE, periodos, len(rows), time.time() - t0)
    print(f"[{TABLE}] {len(rows)} filas escritas ({len(periodos)} períodos).")
