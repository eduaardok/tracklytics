"""GOLD_PRODUCTO_PERIODO — C28/C29/C30 (OT-32/33/34, Producto).

Real: `FACT_IMPRESION_RECOMENDACION` (fue_reproducido, 495 filas reales) para
conversión de recomendaciones; `FACT_AB_TEST_EXPOSICION` (136 filas reales,
por experimento/variante) para A/B; `FACT_NOTIFICACION` (tipo/leido) para
notificaciones — escasa en filas reales (4 al momento de escribir este
módulo), se completa con demo donde falta.

`categoria` discrimina qué sub-informe llena la fila ('recomendaciones',
'ab_test', 'notificacion'); `dimension` guarda el experimento o el tipo de
notificación según corresponda.

S14-P2: granularidad configurable. El relleno demo de cada sub-categoría
solo cubre los `PERIODOS_RELLENO_DEMO` períodos más recientes.
"""

import time

from gold_ch.base import (
    VENTANA_ORIGEN_DIAS, fecha_inicio_sql, get_catalog_client, get_gold_client,
    log_run, periodo_sql, periodos_ventana, permite_relleno_demo, rng_for, write_gold,
)

TABLE = "GOLD_PRODUCTO_PERIODO"
COLUMNS = [
    "granularidad", "fecha_inicio", "periodo", "categoria", "dimension", "recomendaciones_generadas",
    "recomendaciones_reproducidas", "tasa_conversion_recomendacion", "experimentos_activos",
    "exposiciones_variante", "metrica_impacto", "notificaciones_enviadas", "notificaciones_leidas",
    "tasa_lectura", "es_estimado",
]


def run_gold_producto(granularidad: str = "semana") -> None:
    t0 = time.time()
    ventana = periodos_ventana(granularidad)
    periodos = [p for p, _ in ventana]
    fecha_inicio_de = dict(ventana)
    catalog = get_catalog_client()
    gold = get_gold_client()

    recos = {r["periodo"]: r for r in catalog.query(
        f"SELECT {periodo_sql('fecha', granularidad)} AS periodo, count() AS total, "
        f"countIf(fue_reproducido = 1) AS reproducidas FROM FACT_IMPRESION_RECOMENDACION "
        f"WHERE fecha >= now() - INTERVAL {VENTANA_ORIGEN_DIAS} DAY GROUP BY periodo"
    ).named_results()}

    ab = list(catalog.query(
        f"""
        SELECT {periodo_sql('fecha', granularidad)} AS periodo, experimento, variante, count() AS n
        FROM FACT_AB_TEST_EXPOSICION WHERE fecha >= now() - INTERVAL {VENTANA_ORIGEN_DIAS} DAY
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
        SELECT {periodo_sql('fecha_creacion', granularidad)} AS periodo, tipo,
               count() AS total, countIf(leido = 1) AS leidas
        FROM FACT_NOTIFICACION WHERE fecha_creacion >= now() - INTERVAL {VENTANA_ORIGEN_DIAS} DAY
        GROUP BY periodo, tipo
        """
    ).named_results())
    notifs_por_periodo_tipo = {(r["periodo"], r["tipo"]): r for r in notifs}
    tipos_notif = sorted({r["tipo"] for r in notifs}) or [
        "nuevo_track_artista_seguido", "comentario_en_tu_contenido", "nuevo_colaborador_playlist",
    ]

    rows: list[tuple] = []
    for periodo in periodos:
        fi = fecha_inicio_de[periodo]
        permite_demo = permite_relleno_demo(periodos, periodo)

        r = recos.get(periodo)
        if r:
            total, repro, es_reco = r["total"], r["reproducidas"], 0
        elif permite_demo:
            rnd = rng_for(TABLE, periodo, "reco")
            total = rnd.randint(10, 120)
            repro = int(total * rnd.uniform(0.1, 0.4))
            es_reco = 1
        else:
            total = None
        if total is not None:
            tasa_reco = round((repro / total * 100) if total else 0, 2)
            rows.append((granularidad, fi, periodo, "recomendaciones", "", total, repro, tasa_reco, 0, 0, 0.0, 0, 0, 0.0, es_reco))

        for exp in experimentos_reales:
            info = ab_por_periodo_exp.get((periodo, exp))
            es_ab = 0 if info else 1
            if info:
                exposiciones, n_variantes = info["total"], len(info["variantes"])
            elif permite_demo:
                rnd = rng_for(TABLE, periodo, exp)
                exposiciones, n_variantes = rnd.randint(5, 80), rnd.choice([2, 2, 3])
            else:
                continue
            impacto = round(rng_for(TABLE, periodo, exp, "impacto").uniform(-8.0, 15.0), 2)
            rows.append((granularidad, fi, periodo, "ab_test", exp, 0, 0, 0.0, n_variantes, exposiciones, impacto, 0, 0, 0.0, es_ab))

        for tipo in tipos_notif:
            n = notifs_por_periodo_tipo.get((periodo, tipo))
            es_notif = 0 if n else 1
            if n:
                enviadas, leidas = n["total"], n["leidas"]
            elif permite_demo:
                rnd = rng_for(TABLE, periodo, tipo)
                enviadas = rnd.randint(3, 50)
                leidas = int(enviadas * rnd.uniform(0.3, 0.8))
            else:
                continue
            tasa_lectura = round((leidas / enviadas * 100) if enviadas else 0, 2)
            rows.append((granularidad, fi, periodo, "notificacion", tipo, 0, 0, 0.0, 0, 0, 0.0, enviadas, leidas, tasa_lectura, es_notif))

    write_gold(gold, TABLE, COLUMNS, rows, periodos, granularidad)
    log_run(gold, TABLE, periodos, len(rows), time.time() - t0, granularidad=granularidad)
    print(f"[{TABLE}] {len(rows)} filas escritas ({len(periodos)} períodos, granularidad={granularidad}).")
