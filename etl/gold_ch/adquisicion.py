"""GOLD_ADQUISICION_PERIODO — C01/C02/C03 (OT-01/02/03, Comercial).

100% real desde el catálogo (8123), sin relleno demo (S14-P3 — ver
docs/BITACORA_S14.md, P3):
- `registros_nuevos` por país: DIM_USUARIO.fecha_registro.
- `deserciones`: FACT_CANCELACION_SUSCRIPCION.fecha.
- `cac_estimado`: FACT_GASTO_OPERATIVO categoria='marketing' del período /
  registros_nuevos del mismo período.
- `suscripciones_activas`/`conversiones_free_to_paid` por plan: derivadas de
  FACT_TRANSACCION_PAGO (concepto='suscripcion', estado='exitosa'), mapeando
  cada transacción a su plan por el monto (coincide con DIM_PLAN.precio_usd —
  no hay columna `plan_id` en FACT_TRANSACCION_PAGO, así que el monto es la
  única señal real disponible para identificar el plan). Antes de S14-P3 esto
  se rellenaba con `rng_for()` (docstring histórico: "PocketBase es la fuente
  real, no hay forma de derivarlo del catálogo") — el backfill de negocio de
  S14-P3 (`etl/gold/backfill_negocio.py`) generó estas transacciones
  directamente en ClickHouse, así que ahora sí hay evento real que agregar.
  "suscripciones_activas" cuenta usuarios cuyo ciclo de facturación
  (`periodo_inicio`/`periodo_fin` de la transacción) se solapa con el período
  Gold; "conversiones_free_to_paid" cuenta usuarios cuya PRIMERA transacción
  paga cae dentro del período.

Sin período con datos reales, la fila/dimensión simplemente no se escribe —
`es_estimado` se conserva en el esquema (garantía a futuro) pero vale 0 en
todas las filas que este módulo escribe.
"""

import time
from datetime import timedelta

from gold_ch.base import (
    VENTANA_ORIGEN_DIAS, fecha_inicio_sql, get_catalog_client, get_gold_client,
    log_run, periodo_sql, periodos_ventana, write_gold,
)

TABLE = "GOLD_ADQUISICION_PERIODO"
COLUMNS = [
    "granularidad", "fecha_inicio", "periodo", "pais", "plan", "registros_nuevos",
    "conversiones_free_to_paid", "deserciones", "suscripciones_activas", "cac_estimado", "es_estimado",
]


def run_gold_adquisicion(granularidad: str = "semana") -> None:
    t0 = time.time()
    ventana = periodos_ventana(granularidad)
    periodos = [p for p, _ in ventana]
    fecha_inicio_de = dict(ventana)
    fechas_ordenadas = [fi for _, fi in ventana]
    fecha_fin_de = {
        p: (fechas_ordenadas[i + 1] if i + 1 < len(fechas_ordenadas) else fechas_ordenadas[i] + timedelta(days=3650))
        for i, (p, _) in enumerate(ventana)
    }
    catalog = get_catalog_client()
    gold = get_gold_client()

    p_sql = periodo_sql("fecha_registro", granularidad)
    f_sql = fecha_inicio_sql("fecha_registro", granularidad)

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
            f"SELECT {p_sql} AS periodo, {f_sql} AS fecha_inicio, {NORMALIZAR_PAIS} AS pais, count() AS n "
            f"FROM DIM_USUARIO WHERE fecha_registro >= now() - INTERVAL {VENTANA_ORIGEN_DIAS} DAY "
            f"AND pais NOT IN ('', 'Narnia') "
            f"GROUP BY periodo, fecha_inicio, pais"
        ).named_results()
    }
    deserciones = {
        r["periodo"]: r["n"]
        for r in catalog.query(
            f"SELECT {periodo_sql('fecha', granularidad)} AS periodo, count() AS n "
            f"FROM FACT_CANCELACION_SUSCRIPCION WHERE fecha >= now() - INTERVAL {VENTANA_ORIGEN_DIAS} DAY GROUP BY periodo"
        ).named_results()
    }
    gasto_marketing = {
        r["periodo"]: r["monto"]
        for r in catalog.query(
            f"SELECT {periodo_sql('fecha', granularidad)} AS periodo, sum(monto) AS monto FROM FACT_GASTO_OPERATIVO "
            f"WHERE categoria = 'marketing' AND estado = 'activo' AND fecha >= today() - {VENTANA_ORIGEN_DIAS} GROUP BY periodo"
        ).named_results()
    }

    paises_reales = sorted({p for (_, p) in registros.keys()}) or ["Ecuador", "México", "Colombia"]

    # Mapeo monto -> plan_id: FACT_TRANSACCION_PAGO no guarda plan_id, el
    # monto de la transacción es la única señal real que lo identifica.
    precio_a_plan = {
        round(float(r["precio_usd"]), 2): r["plan_id"]
        for r in catalog.query("SELECT plan_id, precio_usd FROM DIM_PLAN WHERE activo = 1").named_results()
    }
    transacciones_susc = list(catalog.query(
        f"SELECT usuario_id, monto, periodo_inicio, periodo_fin, fecha FROM FACT_TRANSACCION_PAGO "
        f"WHERE concepto = 'suscripcion' AND estado = 'exitosa' AND monto > 0 "
        f"AND fecha >= now() - INTERVAL {VENTANA_ORIGEN_DIAS} DAY"
    ).named_results())
    primera_transaccion_por_usuario: dict[str, dict] = {}
    for t in sorted(transacciones_susc, key=lambda r: r["fecha"]):
        primera_transaccion_por_usuario.setdefault(t["usuario_id"], t)

    rows: list[tuple] = []
    for periodo in periodos:
        fi = fecha_inicio_de[periodo]
        ff = fecha_fin_de[periodo]
        total_registros_periodo = 0
        for pais in paises_reales:
            n = registros.get((periodo, pais))
            if n is None:
                continue
            total_registros_periodo += n
            rows.append((granularidad, fi, periodo, pais, "", n, 0, 0, 0, 0.0, 0))

        desercion_n = deserciones.get(periodo)
        gasto = gasto_marketing.get(periodo)
        cac = round(gasto / total_registros_periodo, 2) if (gasto is not None and total_registros_periodo > 0) else None
        if desercion_n is not None or cac is not None:
            rows.append((granularidad, fi, periodo, "", "", 0, 0, desercion_n or 0, 0, cac or 0.0, 0))

        # Activos por plan: transacciones cuyo ciclo de facturación
        # (periodo_inicio..periodo_fin) se solapa con [fi, ff).
        activos_por_plan: dict[str, set] = {}
        for t in transacciones_susc:
            if t["periodo_inicio"] < ff and t["periodo_fin"] >= fi:
                plan_id = precio_a_plan.get(round(float(t["monto"]), 2))
                if plan_id:
                    activos_por_plan.setdefault(plan_id, set()).add(t["usuario_id"])

        # Conversiones: primera transacción paga de cada usuario, si cae en [fi, ff).
        conversiones_por_plan: dict[str, int] = {}
        for usuario_id, t in primera_transaccion_por_usuario.items():
            if fi <= t["fecha"].date() < ff:
                plan_id = precio_a_plan.get(round(float(t["monto"]), 2))
                if plan_id:
                    conversiones_por_plan[plan_id] = conversiones_por_plan.get(plan_id, 0) + 1

        for plan_id in sorted(set(activos_por_plan) | set(conversiones_por_plan)):
            activos = len(activos_por_plan.get(plan_id, ()))
            conversiones = conversiones_por_plan.get(plan_id, 0)
            rows.append((granularidad, fi, periodo, "", plan_id, 0, conversiones, 0, activos, 0.0, 0))

    write_gold(gold, TABLE, COLUMNS, rows, periodos, granularidad)
    log_run(gold, TABLE, periodos, len(rows), time.time() - t0, granularidad=granularidad)
    print(f"[{TABLE}] {len(rows)} filas escritas ({len(periodos)} períodos, granularidad={granularidad}).")
