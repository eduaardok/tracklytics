"""GOLD_PRODUCTO_PERIODO — C28/C29/C30 (OT-32/33/34, Producto).

100% real desde el catálogo (8123), sin relleno demo (S14-P3): `FACT_
IMPRESION_RECOMENDACION` (fue_reproducido) para conversión de recomendaciones;
`FACT_AB_TEST_EXPOSICION` (por experimento/variante) para A/B; `FACT_
NOTIFICACION` (tipo/leido) para notificaciones.

`categoria` discrimina qué sub-informe llena la fila ('recomendaciones',
'ab_test', 'notificacion'); `dimension` guarda el experimento o el tipo de
notificación según corresponda.

`metrica_impacto` (OT-33, impacto de un experimento A/B): `FACT_
AB_TEST_EXPOSICION` no tiene una columna de resultado/conversión propia —
antes de S14-P3 este valor se fabricaba con `rng_for()` incluso en filas con
`es_estimado=0` (bug: el flag decía "real" sobre una columna inventada). Se
deriva ahora de una señal real correlacionada: reproducciones por usuario
expuesto en el mismo período (`FACT_ENGAGEMENT_USUARIO`), agrupadas por
variante — `metrica_impacto` es la diferencia % entre la variante con más
reproducciones promedio por usuario y la que tiene menos, dentro del mismo
experimento y período. Con una sola variante (o sin reproducciones
posteriores todavía), no hay base de comparación real: queda en 0.0, no se
inventa (mismo criterio que la excepción de proyecciones de
`consumo_genero.py` en S14-P2).
"""

import time
from statistics import mean

from gold_ch.base import VENTANA_ORIGEN_DIAS, get_catalog_client, get_gold_client, log_run, periodo_sql, periodos_ventana, write_gold

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

    ab_detalle = list(catalog.query(
        f"""
        SELECT {periodo_sql('fecha', granularidad)} AS periodo, experimento, variante, usuario_id
        FROM FACT_AB_TEST_EXPOSICION WHERE fecha >= now() - INTERVAL {VENTANA_ORIGEN_DIAS} DAY
        """
    ).named_results())
    ab_por_periodo_exp: dict[tuple, dict] = {}
    for r in ab_detalle:
        key = (r["periodo"], r["experimento"])
        grupo = ab_por_periodo_exp.setdefault(key, {"total": 0, "variantes": set(), "usuarios_por_variante": {}})
        grupo["total"] += 1
        grupo["variantes"].add(r["variante"])
        grupo["usuarios_por_variante"].setdefault(r["variante"], set()).add(r["usuario_id"])
    experimentos_reales = sorted({r["experimento"] for r in ab_detalle})

    # Reproducciones por usuario y período — para derivar metrica_impacto por
    # correlación real (ver docstring), no un número al azar.
    repros_por_usuario_periodo = {
        (r["usuario_id"], r["periodo"]): r["n"]
        for r in catalog.query(
            f"SELECT user_id AS usuario_id, {periodo_sql('event_timestamp', granularidad)} AS periodo, count() AS n "
            f"FROM FACT_ENGAGEMENT_USUARIO WHERE event_type = 'reproduccion' "
            f"AND event_timestamp >= now() - INTERVAL {VENTANA_ORIGEN_DIAS} DAY GROUP BY usuario_id, periodo"
        ).named_results()
    } if ab_detalle else {}

    notifs = list(catalog.query(
        f"""
        SELECT {periodo_sql('fecha_creacion', granularidad)} AS periodo, tipo,
               count() AS total, countIf(leido = 1) AS leidas
        FROM FACT_NOTIFICACION WHERE fecha_creacion >= now() - INTERVAL {VENTANA_ORIGEN_DIAS} DAY
        GROUP BY periodo, tipo
        """
    ).named_results())
    notifs_por_periodo_tipo = {(r["periodo"], r["tipo"]): r for r in notifs}
    tipos_notif = sorted({r["tipo"] for r in notifs})

    def _metrica_impacto(periodo: str, usuarios_por_variante: dict[str, set]) -> float:
        promedios = []
        for _variante, usuarios in usuarios_por_variante.items():
            repros = [repros_por_usuario_periodo.get((u, periodo), 0) for u in usuarios]
            if repros:
                promedios.append(mean(repros))
        if len(promedios) < 2:
            return 0.0
        mayor, menor = max(promedios), min(promedios)
        if menor <= 0:
            return 0.0
        return round((mayor - menor) / menor * 100, 2)

    rows: list[tuple] = []
    for periodo in periodos:
        fi = fecha_inicio_de[periodo]

        r = recos.get(periodo)
        if r:
            total, repro = r["total"], r["reproducidas"]
            tasa_reco = round((repro / total * 100) if total else 0, 2)
            rows.append((granularidad, fi, periodo, "recomendaciones", "", total, repro, tasa_reco, 0, 0, 0.0, 0, 0, 0.0, 0))

        for exp in experimentos_reales:
            info = ab_por_periodo_exp.get((periodo, exp))
            if not info:
                continue
            exposiciones, n_variantes = info["total"], len(info["variantes"])
            impacto = _metrica_impacto(periodo, info["usuarios_por_variante"])
            rows.append((granularidad, fi, periodo, "ab_test", exp, 0, 0, 0.0, n_variantes, exposiciones, impacto, 0, 0, 0.0, 0))

        for tipo in tipos_notif:
            n = notifs_por_periodo_tipo.get((periodo, tipo))
            if not n:
                continue
            enviadas, leidas = n["total"], n["leidas"]
            tasa_lectura = round((leidas / enviadas * 100) if enviadas else 0, 2)
            rows.append((granularidad, fi, periodo, "notificacion", tipo, 0, 0, 0.0, 0, 0, 0.0, enviadas, leidas, tasa_lectura, 0))

    write_gold(gold, TABLE, COLUMNS, rows, periodos, granularidad)
    log_run(gold, TABLE, periodos, len(rows), time.time() - t0, granularidad=granularidad)
    print(f"[{TABLE}] {len(rows)} filas escritas ({len(periodos)} períodos, granularidad={granularidad}).")
