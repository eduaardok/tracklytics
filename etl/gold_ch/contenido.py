"""GOLD_CONTENIDO_PERIODO — C19/C20/C21 (OT-20/21/23, Contenido y A&R).

Real:
- `solicitudes_recibidas/aprobadas/rechazadas` + tiempo de resolución:
  FACT_SUBIDA_TRACK (fecha_subida/fecha_resolucion/estado_revision_id →
  DIM_ESTADO_REVISION), agregado por período de `fecha_subida`.
- `licencias_activas` por territorio: DIM_LICENCIA (estado='activa') unido
  a DIM_PAIS — es un SNAPSHOT real actual (DIM_LICENCIA no guarda historial
  de altas/bajas por período), repetido igual en todos los períodos de la
  ventana. Documentado: no es una serie histórica real período a período,
  es el estado vigente real aplicado a cada período (`es_estimado=0` porque
  el número en sí es real, no inventado).
- `tracks_cubiertos`/`cobertura_pct` por territorio: BRIDGE_RESTRICCION_TRACK
  (tracks con al menos una restricción registrada en ese país) sobre el
  total de FACT_TRACKS disponibles — real.

S14-P2: granularidad configurable. El relleno demo de `solicitudes` solo
cubre los `PERIODOS_RELLENO_DEMO` períodos más recientes.
"""

import time

from gold_ch.base import (
    VENTANA_ORIGEN_DIAS, fecha_inicio_sql, get_catalog_client, get_gold_client,
    log_run, periodo_sql, periodos_ventana, permite_relleno_demo, rng_for, write_gold,
)

TABLE = "GOLD_CONTENIDO_PERIODO"
COLUMNS = [
    "granularidad", "fecha_inicio", "periodo", "territorio", "solicitudes_recibidas", "aprobadas",
    "rechazadas", "tasa_aprobacion", "tiempo_promedio_resolucion_h", "licencias_activas",
    "tracks_cubiertos", "cobertura_pct", "es_estimado",
]


def run_gold_contenido(granularidad: str = "semana") -> None:
    t0 = time.time()
    ventana = periodos_ventana(granularidad)
    periodos = [p for p, _ in ventana]
    fecha_inicio_de = dict(ventana)
    catalog = get_catalog_client()
    gold = get_gold_client()

    solicitudes = {r["periodo"]: r for r in catalog.query(
        f"""
        SELECT {periodo_sql('fecha_subida', granularidad)} AS periodo,
               count() AS total,
               countIf(estado_revision_id = 2) AS aprobadas,
               countIf(estado_revision_id = 3) AS rechazadas,
               avgIf(dateDiff('hour', fecha_subida, fecha_resolucion), fecha_resolucion IS NOT NULL) AS horas
        FROM FACT_SUBIDA_TRACK WHERE fecha_subida >= now() - INTERVAL {VENTANA_ORIGEN_DIAS} DAY GROUP BY periodo
        """
    ).named_results()}

    licencias = list(catalog.query(
        """
        SELECT ifNull(p.nombre, 'Sin país') AS territorio, count() AS n
        FROM DIM_LICENCIA l LEFT JOIN DIM_PAIS p ON p.pais_id = l.pais_id
        WHERE l.estado = 'activa' GROUP BY territorio
        """
    ).named_results())
    licencias = licencias or [{"territorio": "Ecuador", "n": 0}]

    total_tracks = catalog.command("SELECT count() FROM FACT_TRACKS") or 1
    cobertura = list(catalog.query(
        """
        SELECT ifNull(p.nombre, 'Sin país') AS territorio, count(DISTINCT b.fact_id_track) AS n
        FROM BRIDGE_RESTRICCION_TRACK b LEFT JOIN DIM_PAIS p ON p.pais_id = b.pais_id
        GROUP BY territorio
        """
    ).named_results())
    cobertura_por_territorio = {c["territorio"]: c["n"] for c in cobertura}

    territorios = sorted({lic["territorio"] for lic in licencias} | set(cobertura_por_territorio.keys()))

    rows: list[tuple] = []
    for periodo in periodos:
        fi = fecha_inicio_de[periodo]
        permite_demo = permite_relleno_demo(periodos, periodo)
        s = solicitudes.get(periodo)
        if s:
            tasa = round((s["aprobadas"] / s["total"] * 100) if s["total"] else 0, 2)
            fila_general = (s["total"], s["aprobadas"], s["rechazadas"], tasa, round(s["horas"] or 0, 2), 0)
        elif permite_demo:
            rnd = rng_for(TABLE, periodo, "solicitudes")
            total = rnd.randint(1, 6)
            aprob = rnd.randint(0, total)
            fila_general = (total, aprob, total - aprob, round((aprob / total * 100) if total else 0, 2),
                             round(rnd.uniform(4, 72), 2), 1)
        else:
            fila_general = None

        if fila_general is None:
            continue

        for territorio in territorios:
            lic_n = next((lic["n"] for lic in licencias if lic["territorio"] == territorio), 0)
            cub_n = cobertura_por_territorio.get(territorio, 0)
            cobertura_pct = round(cub_n / total_tracks * 100, 4)
            rows.append((granularidad, fi, periodo, territorio, *fila_general[:5], lic_n, cub_n, cobertura_pct, fila_general[5]))

    write_gold(gold, TABLE, COLUMNS, rows, periodos, granularidad)
    log_run(gold, TABLE, periodos, len(rows), time.time() - t0, granularidad=granularidad)
    print(f"[{TABLE}] {len(rows)} filas escritas ({len(periodos)} períodos, granularidad={granularidad}).")
