"""GOLD_ADQUISICION_PERIODO — C01/C02/C03 (OT-01/02/03, Comercial).

Real desde el catálogo (8123):
- `registros_nuevos` por país: DIM_USUARIO.fecha_registro (real, 101 filas al
  momento de escribir este módulo).
- `deserciones`: FACT_CANCELACION_SUSCRIPCION.fecha (real, aunque escasa).
- `cac_estimado`: FACT_GASTO_OPERATIVO categoria='marketing' del período /
  registros_nuevos del mismo período — real cuando ambos existen.

Demo (marcado `es_estimado=1`, documentado en BITACORA_S13.md): las
suscripciones activas no viven en ClickHouse (PocketBase es la fuente real,
ver `paquetes.suscripciones.pb_client`) y las "conversiones free→paid" no
tienen un evento propio registrado — no hay forma de derivarlas del
catálogo sin inventar un dato que el pipeline no produce.
"""

import time

from gold_ch.base import get_catalog_client, get_gold_client, iso_weeks_back, log_run, periodo_sql, rng_for, write_gold

TABLE = "GOLD_ADQUISICION_PERIODO"
COLUMNS = [
    "periodo", "pais", "plan", "registros_nuevos", "conversiones_free_to_paid",
    "deserciones", "suscripciones_activas", "cac_estimado", "es_estimado",
]
PLANES = ["free", "premium", "familiar", "estudiante"]


def run_gold_adquisicion() -> None:
    t0 = time.time()
    periodos = iso_weeks_back()
    catalog = get_catalog_client()
    gold = get_gold_client()

    # Normaliza códigos ISO-2 sueltos a nombre completo (mismos países reales
    # de DIM_PAIS) — DIM_USUARIO.pais es texto libre sin FK, y varias cuentas
    # de prueba de sesiones anteriores lo dejaron en código de 2 letras en
    # vez de nombre. Se descartan '' y valores obviamente no-reales ("Narnia",
    # cuenta de prueba QA) — no se toca la fila fuente, solo se excluye de
    # este agregado.
    NORMALIZAR_PAIS = """
        multiIf(
            pais = 'EC', 'Ecuador', pais = 'MX', 'México', pais = 'CO', 'Colombia',
            pais = 'AR', 'Argentina', pais = 'ES', 'España', pais = 'PE', 'Perú',
            pais
        )
    """
    registros = {
        (r["periodo"], r["pais"]): r["n"]
        for r in catalog.query(
            f"SELECT {periodo_sql('fecha_registro')} AS periodo, {NORMALIZAR_PAIS} AS pais, count() AS n "
            f"FROM DIM_USUARIO WHERE fecha_registro >= now() - INTERVAL 90 DAY "
            f"AND pais NOT IN ('', 'Narnia') "
            f"GROUP BY periodo, pais"
        ).named_results()
    }
    deserciones = {
        r["periodo"]: r["n"]
        for r in catalog.query(
            f"SELECT {periodo_sql('fecha')} AS periodo, count() AS n "
            f"FROM FACT_CANCELACION_SUSCRIPCION WHERE fecha >= now() - INTERVAL 90 DAY GROUP BY periodo"
        ).named_results()
    }
    gasto_marketing = {
        r["periodo"]: r["monto"]
        for r in catalog.query(
            f"SELECT {periodo_sql('fecha')} AS periodo, sum(monto) AS monto FROM FACT_GASTO_OPERATIVO "
            f"WHERE categoria = 'marketing' AND estado = 'activo' AND fecha >= today() - 90 GROUP BY periodo"
        ).named_results()
    }

    paises_reales = sorted({p for (_, p) in registros.keys()}) or ["Ecuador", "México", "Colombia"]

    rows: list[tuple] = []
    for periodo in periodos:
        total_registros_periodo = 0
        for pais in paises_reales:
            n = registros.get((periodo, pais))
            es_est = 0 if n is not None else 1
            if n is None:
                n = rng_for(TABLE, periodo, pais).randint(2, 40)
            total_registros_periodo += n
            rows.append((periodo, pais, "", n, 0, 0, 0, 0.0, es_est))

        desercion_n = deserciones.get(periodo)
        es_est_deser = 0 if desercion_n is not None else 1
        if desercion_n is None:
            desercion_n = rng_for(TABLE, periodo, "deserciones").randint(0, 4)

        gasto = gasto_marketing.get(periodo)
        if gasto is not None and total_registros_periodo > 0:
            cac = round(gasto / total_registros_periodo, 2)
            es_est_cac = 0
        else:
            cac = round(rng_for(TABLE, periodo, "cac").uniform(8.0, 45.0), 2)
            es_est_cac = 1
        rows.append((periodo, "", "", 0, 0, desercion_n, 0, cac, max(es_est_deser, es_est_cac)))

        # Conversiones y suscripciones activas por plan: sin evento propio en
        # el catálogo (ver docstring) — siempre demo, coherente entre planes
        # (suman ~lo mismo semana a semana con una tendencia suave).
        base = 40 + periodos.index(periodo) * 3
        for plan in PLANES:
            rnd = rng_for(TABLE, periodo, plan)
            activos = max(0, int(base * rnd.uniform(0.7, 1.3)) if plan != "free" else int(base * rnd.uniform(2.5, 3.5)))
            conversiones = rnd.randint(0, 6) if plan != "free" else 0
            rows.append((periodo, "", plan, 0, conversiones, 0, activos, 0.0, 1))

    write_gold(gold, TABLE, COLUMNS, rows, periodos)
    log_run(gold, TABLE, periodos, len(rows), time.time() - t0)
    print(f"[{TABLE}] {len(rows)} filas escritas ({len(periodos)} períodos).")
