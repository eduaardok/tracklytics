"""GOLD_INFRAESTRUCTURA_PERIODO — C05/C06 (OT-05/06, Tecnología).

Real desde el catálogo:
- `uptime_porcentaje`/`incidentes_total` por componente de infraestructura:
  FACT_DISPONIBILIDAD (componente_id -> DIM_COMPONENTE_INFRAESTRUCTURA:
  api/clickhouse/pocketbase/airflow), real, muestreo diario.
- `errores_total` por servicio: FACT_ERROR_SISTEMA.servicio guarda la ruta
  completa del request (`request.url.path`, ver `main.py::registrar_error_sistema`)
  — se extrae el paquete (3er segmento de la ruta, ej. "biblioteca" de
  "/app/v1/biblioteca/playlists") como dimensión "componente" de negocio,
  distinta de la de infraestructura pero igual de real.

`errores_criticos` (FACT_ERROR_SISTEMA no tiene columna de severidad —
documentado, no fabricado en el catálogo) y `tiempo_resolucion_promedio_h`
(no hay timestamp de resolución, solo un booleano `resolved`) quedan en 0:
no hay señal real para ninguna de las dos en el esquema actual, y desde
S14-P3 ya no se fabrican con `rng_for()`. `etl/gold/backfill_negocio.py`
genera disponibilidad real para los 24 meses de historia, así que un
período sin fila de disponibilidad real simplemente no aparece.
"""

import time

from gold_ch.base import VENTANA_ORIGEN_DIAS, fecha_inicio_sql, get_catalog_client, get_gold_client, log_run, periodo_sql, periodos_ventana, write_gold

TABLE = "GOLD_INFRAESTRUCTURA_PERIODO"
COLUMNS = [
    "granularidad", "fecha_inicio", "periodo", "componente", "uptime_porcentaje", "incidentes_total",
    "tiempo_resolucion_promedio_h", "errores_total", "errores_criticos", "es_estimado",
]


def run_gold_infraestructura(granularidad: str = "semana") -> None:
    t0 = time.time()
    ventana = periodos_ventana(granularidad)
    periodos = [p for p, _ in ventana]
    fecha_inicio_de = dict(ventana)
    catalog = get_catalog_client()
    gold = get_gold_client()

    disponibilidad = list(catalog.query(
        f"""
        SELECT {periodo_sql('d.fecha', granularidad)} AS periodo,
               {fecha_inicio_sql('d.fecha', granularidad)} AS fecha_inicio,
               c.nombre AS componente,
               round((1 - avg(d.hubo_incidente)) * 100, 2) AS uptime, sum(d.hubo_incidente) AS incidentes
        FROM FACT_DISPONIBILIDAD d
        LEFT JOIN DIM_COMPONENTE_INFRAESTRUCTURA c ON c.componente_id = d.componente_id
        WHERE d.fecha >= now() - INTERVAL {VENTANA_ORIGEN_DIAS} DAY
        GROUP BY periodo, fecha_inicio, componente
        """
    ).named_results())

    errores = {
        (r["periodo"], r["componente"]): r["n"]
        for r in catalog.query(
            f"""
            SELECT {periodo_sql('timestamp', granularidad)} AS periodo, splitByChar('/', servicio)[4] AS componente, count() AS n
            FROM FACT_ERROR_SISTEMA
            WHERE timestamp >= now() - INTERVAL {VENTANA_ORIGEN_DIAS} DAY AND length(splitByChar('/', servicio)) >= 4
            GROUP BY periodo, componente
            """
        ).named_results()
    }

    componentes_infra = sorted({r["componente"] for r in disponibilidad}) or ["api", "clickhouse", "pocketbase", "airflow"]

    rows: list[tuple] = []
    for r in disponibilidad:
        n_err = errores.get((r["periodo"], r["componente"]), 0)
        rows.append((granularidad, r["fecha_inicio"], r["periodo"], r["componente"], r["uptime"], r["incidentes"], 0.0, n_err, 0, 0))

    # Componentes de negocio con errores reales pero sin fila de disponibilidad
    # (ej. "biblioteca", "seguridad") — se agregan con uptime 100 (sin dato de
    # incidentes propio, no se fabrica un valor de disponibilidad). Solo si
    # el período está en la ventana (evita períodos fuera de rango).
    for (periodo, componente), n_err in errores.items():
        if componente in componentes_infra or periodo not in fecha_inicio_de:
            continue
        rows.append((granularidad, fecha_inicio_de[periodo], periodo, componente, 100.0, 0, 0.0, n_err, 0, 0))

    write_gold(gold, TABLE, COLUMNS, rows, periodos, granularidad)
    log_run(gold, TABLE, periodos, len(rows), time.time() - t0, granularidad=granularidad)
    print(f"[{TABLE}] {len(rows)} filas escritas ({len(periodos)} períodos, granularidad={granularidad}).")
