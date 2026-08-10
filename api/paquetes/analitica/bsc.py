"""Balanced Scorecard estratégico (S14-FINAL, Fase 6) — `GET /analitica/bsc/resumen`.

Las 4 perspectivas clásicas del BSC (Kaplan & Norton), cada una con 2 KPIs
calculados desde tablas Gold reales (ClickHouse 8124, vía
`paquetes.reportes.queries.fetch_gold` — se reusa el mismo acceso que los 30
informes compuestos, no se duplica la conexión ni el parseo de rango de
período). Ningún valor es sintético: cada KPI es una agregación directa
sobre columnas de Gold ya pobladas por los DAGs de negocio (S14-P3,
backfill de 24 meses reales).

`meta` es un valor de referencia ilustrativo por KPI (no hay tabla de metas
editable por directores todavía — fuera de alcance de esta sesión, ver
BITACORA_S14.md bloque S14-FINAL) — mismo criterio que usa el propio ejemplo
del pedido ("30% del ARR total" no sale de ningún dato tampoco). El
semáforo (verde/amarillo/rojo) sí es una función determinística real del
dato vs. esa meta, no un valor fijo.
"""

from paquetes.reportes.queries import fetch_gold

GRANULARIDAD_BSC = "mes"
PUNTOS_TENDENCIA = 6


def _por_periodo(datos: list[dict], campo: str, modo: str) -> list[tuple[str, float]]:
    """Agrupa filas (potencialmente multi-dimensión: país/plan/componente/
    contrato/categoría) por `periodo`, reduciendo `campo` con suma o
    promedio — necesario porque varias tablas Gold traen más de una fila por
    período (ej. GOLD_INFRAESTRUCTURA_PERIODO trae una fila por componente)."""
    acc: dict[str, list[float]] = {}
    orden: list[str] = []
    for fila in datos:
        p = fila["periodo"]
        if p not in acc:
            acc[p] = []
            orden.append(p)
        acc[p].append(float(fila.get(campo) or 0))
    reduce = (lambda vals: sum(vals)) if modo == "suma" else (lambda vals: sum(vals) / len(vals))
    return [(p, round(reduce(acc[p]), 4)) for p in orden]


def _semaforo(pct_meta: float) -> str:
    if pct_meta >= 80:
        return "verde"
    if pct_meta >= 50:
        return "amarillo"
    return "rojo"


def _kpi(
    indicador: str, tabla: str, campo: str, meta: float, *,
    modo: str = "promedio", unidad: str = "", categoria: str | None = None,
    invertido: bool = False, meta_label: str | None = None,
) -> dict:
    """`invertido=True` para KPIs donde menor es mejor (CAC, tasa de
    rechazo) — el % de meta se calcula como meta/valor en vez de
    valor/meta."""
    filas = fetch_gold(tabla, None, None, granularidad=GRANULARIDAD_BSC)
    if categoria is not None:
        filas = [f for f in filas if f.get("categoria") == categoria]
    serie = _por_periodo(filas, campo, modo)[-PUNTOS_TENDENCIA:]
    valores = [v for _, v in serie]
    valor_actual = valores[-1] if valores else 0.0

    if not valores or meta <= 0:
        pct_meta = 0.0
    elif invertido:
        pct_meta = min(100.0, (meta / valor_actual) * 100) if valor_actual > 0 else 100.0
    else:
        pct_meta = min(100.0, (valor_actual / meta) * 100)

    return {
        "indicador":       indicador,
        "valor_actual":    round(valor_actual, 2),
        "unidad":          unidad,
        "meta":            meta_label or (f"{meta:g}{unidad}"),
        "porcentaje_meta":  round(pct_meta, 1),
        "semaforo":        _semaforo(pct_meta),
        "tendencia":       valores,
        "es_estimado":     any(f.get("es_estimado") for f in filas) if filas else False,
    }


def bsc_resumen() -> dict:
    perspectivas = [
        {
            "nombre": "Financiera",
            "kpis": [
                _kpi("MRR (ingreso recurrente mensual)", "GOLD_FINANCIERO_PERIODO", "mrr",
                     50000, modo="suma", unidad=" USD"),
                _kpi("Margen neto", "GOLD_FINANCIERO_PERIODO", "margen_neto",
                     15000, modo="suma", unidad=" USD"),
            ],
        },
        {
            "nombre": "Cliente",
            "kpis": [
                _kpi("CAC estimado", "GOLD_ADQUISICION_PERIODO", "cac_estimado",
                     15, unidad=" USD", invertido=True),
                _kpi("Altas netas (nuevas − bajas)", "GOLD_ADQUISICION_PERIODO", "registros_nuevos",
                     200, modo="suma", unidad=" cuentas/mes"),
            ],
        },
        {
            "nombre": "Procesos Internos",
            "kpis": [
                _kpi("Uptime de infraestructura", "GOLD_INFRAESTRUCTURA_PERIODO", "uptime_porcentaje",
                     99.9, unidad="%"),
                _kpi("Tasa de rechazo del pipeline ETL", "GOLD_PIPELINE_PERIODO", "tasa_rechazo",
                     1.0, unidad="%", invertido=True),
            ],
        },
        {
            "nombre": "Aprendizaje y Crecimiento",
            "kpis": [
                _kpi("Conversión de recomendaciones", "GOLD_PRODUCTO_PERIODO", "tasa_conversion_recomendacion",
                     12.0, unidad="%", categoria="recomendaciones"),
                _kpi("Cobertura de licencias por territorio", "GOLD_CONTENIDO_PERIODO", "cobertura_pct",
                     90.0, unidad="%"),
            ],
        },
    ]
    return {"perspectivas": perspectivas}
