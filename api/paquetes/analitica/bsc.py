"""Balanced Scorecard estratégico (S16, Prompt 05) — `GET /analitica/bsc/resumen`
y `GET /analitica/bsc/analisis-inteligente`.

Reescribe el BSC de S14-FINAL para usar los 13 KPIs canónicos del cuadro
resumen del documento fuente (S14_Documento_Sistema_Tracklytics.docx,
sección 13.3) — la versión anterior usaba 8 KPIs distintos, elegidos por
conveniencia de query en vez de por el documento. Ningún valor es
sintético: cada KPI sale de una agregación real sobre Gold
(tracklytics_gold, ClickHouse 8124, vía `paquetes.reportes.queries.fetch_gold`
/ `query_rows_gold` — se reusa el mismo acceso que los informes compuestos).

De los 13 KPIs, 2 no tienen ninguna tabla Gold que los respalde — no es
"histórico insuficiente", es la ausencia total de la métrica en el modelo
de datos actual. Se documentan explícitamente en vez de inventar una
columna que no existe (ver `_kpi_sin_datos` y su uso abajo):
  - Retención de creadores activos (OE5): no existe GOLD_CREADORES_PERIODO
    ni columna equivalente en ninguna tabla Gold (GOLD_CONTENIDO_PERIODO
    trackea licencias/territorio, no actividad de creadores).
  - Respuesta a decisiones estratégicas <24h (OE4): es una métrica de
    proceso/gobernanza (qué tan rápido reacciona el liderazgo a un
    hallazgo del dashboard) — ningún pipeline de datos puede medirla.

Otros 4 KPIs no tienen una columna 1:1 para el concepto exacto del
documento — se calculan con una fórmula derivada de columnas reales, cada
una documentada en su función con la fórmula y su limitación: % ARR por
API, CAC por región, regalías liquidadas a tiempo, retención B2B, A/B
tests concluidos.

`meta` es el valor objetivo del documento fuente tal cual (no editable por
directores todavía, mismo criterio que S14-FINAL) — el semáforo sí es una
función determinística real del dato vs. esa meta.
"""

import numpy as np

from core.database_gold import query_rows_gold
from paquetes.analitica.proyeccion import proyectar_serie
from paquetes.reportes.queries import fetch_gold
from paquetes.suscripciones.planes import PLANES

GRANULARIDAD_BSC = "mes"
GRANULARIDAD_TRIMESTRE = "trimestre"
PUNTOS_TENDENCIA = 6
MINIMO_HISTORICO = 3  # mismo piso que proyeccion.py (MINIMO_SEMANAS)


# ─────────────────────────────────────────────────────────────────────────────
# Helpers compartidos
# ─────────────────────────────────────────────────────────────────────────────

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
    """Umbral del semáforo (heredado de S14-FINAL, se mantiene igual):
    `pct_meta` = qué % de la meta se alcanzó (100 = meta cumplida exacta,
    puede superar 100 salvo el cap en `_pct_meta`). Verde ≥80% de la meta
    (cumple o está cerca), amarillo 50-79% (desviación leve, todavía
    encaminado), rojo <50% (incumple de forma significativa) — mismo
    criterio semáforo 80/50 usado en el resto de paneles de la capability
    (ver `_kpi` original de S14-FINAL)."""
    if pct_meta >= 80:
        return "verde"
    if pct_meta >= 50:
        return "amarillo"
    return "rojo"


def _pct_meta(valor_actual: float, meta: float, invertido: bool) -> float:
    if meta <= 0:
        return 0.0
    if invertido:
        return min(100.0, (meta / valor_actual) * 100) if valor_actual > 0 else 100.0
    return min(100.0, (valor_actual / meta) * 100)


def _kpi(
    indicador: str, tabla: str, campo: str, meta: float, *,
    modo: str = "promedio", unidad: str = "", categoria: str | None = None,
    invertido: bool = False, meta_label: str | None = None, nota: str | None = None,
) -> dict:
    """KPI directo: un solo campo de una sola tabla Gold, reducido por
    período. `invertido=True` para KPIs donde menor es mejor (CAC, tasa de
    rechazo) — el % de meta se calcula como meta/valor en vez de valor/meta."""
    filas = fetch_gold(tabla, None, None, granularidad=GRANULARIDAD_BSC)
    if categoria is not None:
        filas = [f for f in filas if f.get("categoria") == categoria]
    serie = _por_periodo(filas, campo, modo)
    valores_todos = [v for _, v in serie]
    tendencia = valores_todos[-PUNTOS_TENDENCIA:]
    valor_actual = tendencia[-1] if tendencia else 0.0
    pct_meta = _pct_meta(valor_actual, meta, invertido)

    return {
        "indicador":       indicador,
        "valor_actual":    round(valor_actual, 2),
        "unidad":          unidad,
        "meta":            meta_label or (f"{meta:g}{unidad}"),
        "meta_valor":      meta,
        "invertido":       invertido,
        "porcentaje_meta": round(pct_meta, 1),
        "semaforo":        _semaforo(pct_meta),
        "tendencia":       tendencia,
        "es_estimado":     any(f.get("es_estimado") for f in filas) if filas else False,
        "nota":            nota,
    }


def _kpi_sin_datos(indicador: str, meta_label: str, nota: str) -> dict:
    """KPI de los 13 del cuadro resumen SIN tabla Gold de respaldo — se
    incluye igual en la respuesta (el contrato pide los 13 completos) pero
    marcado explícitamente, sin fabricar un valor ni una tendencia."""
    return {
        "indicador":       indicador,
        "valor_actual":    None,
        "unidad":          "",
        "meta":            meta_label,
        "meta_valor":      None,
        "invertido":       False,
        "porcentaje_meta": None,
        "semaforo":        "sin_datos",
        "tendencia":       [],
        "es_estimado":     False,
        "nota":            nota,
    }


# ─────────────────────────────────────────────────────────────────────────────
# KPIs con fórmula derivada (documentados individualmente)
# ─────────────────────────────────────────────────────────────────────────────

def _kpi_conversion_premium() -> dict:
    """Tasa de conversión premium (meta 5%, S14 §13.3). GOLD_ADQUISICION_PERIODO
    trae dos desgloses distintos apilados en la misma tabla (filas con `pais`
    poblado y `plan=''` para altas por país; filas con `plan` poblado y
    `pais=''` para conversiones por plan) — ninguna fila trae ambas
    dimensiones a la vez, así que la tasa se arma cruzando dos sumas
    filtradas por período, no un solo campo."""
    filas = fetch_gold("GOLD_ADQUISICION_PERIODO", None, None, granularidad=GRANULARIDAD_BSC)
    acc: dict[str, dict[str, float]] = {}
    orden: list[str] = []
    for f in filas:
        p = f["periodo"]
        if p not in acc:
            acc[p] = {"conversiones": 0.0, "nuevos": 0.0}
            orden.append(p)
        if f.get("plan"):
            acc[p]["conversiones"] += float(f.get("conversiones_free_to_paid") or 0)
        if f.get("pais"):
            acc[p]["nuevos"] += float(f.get("registros_nuevos") or 0)

    tendencia = []
    for p in orden:
        nuevos = acc[p]["nuevos"]
        tendencia.append(round((acc[p]["conversiones"] / nuevos * 100) if nuevos > 0 else 0.0, 2))
    tendencia = tendencia[-PUNTOS_TENDENCIA:]
    valor_actual = tendencia[-1] if tendencia else 0.0
    meta = 5.0
    pct_meta = _pct_meta(valor_actual, meta, invertido=False)

    return {
        "indicador": "Tasa de conversión premium", "valor_actual": valor_actual, "unidad": "%",
        "meta": f"{meta:g}%", "meta_valor": meta, "invertido": False,
        "porcentaje_meta": round(pct_meta, 1), "semaforo": _semaforo(pct_meta),
        "tendencia": tendencia,
        "es_estimado": any(f.get("es_estimado") for f in filas) if filas else False,
        "nota": None,
    }


def _kpi_ingreso_publicidad_mensual() -> dict:
    """Ingreso publicitario mensual (S14 §13.3: "crecimiento trimestral", sin
    cifra objetivo fija) — se reporta el ingreso mensual real
    (GOLD_FINANCIERO_PERIODO.ingresos_publicidad) y, como el documento pide
    crecimiento y no un monto, el % de meta se basa en la variación real
    trimestre-sobre-trimestre vs. una meta ilustrativa de +5% (mismo
    criterio que S14-FINAL usa para metas no fijadas en el documento
    fuente: "valor de referencia ilustrativo")."""
    filas = fetch_gold("GOLD_FINANCIERO_PERIODO", None, None, granularidad=GRANULARIDAD_BSC)
    serie = _por_periodo(filas, "ingresos_publicidad", "suma")
    tendencia = [v for _, v in serie][-PUNTOS_TENDENCIA:]
    valor_actual = tendencia[-1] if tendencia else 0.0

    filas_trim = fetch_gold("GOLD_FINANCIERO_PERIODO", None, None, granularidad=GRANULARIDAD_TRIMESTRE)
    serie_trim = _por_periodo(filas_trim, "ingresos_publicidad", "suma")
    valores_trim = [v for _, v in serie_trim]
    crecimiento_qoq = 0.0
    if len(valores_trim) >= 2 and valores_trim[-2] > 0:
        crecimiento_qoq = round((valores_trim[-1] - valores_trim[-2]) / valores_trim[-2] * 100, 1)

    meta = 5.0  # ilustrativo: +5% QoQ
    pct_meta = _pct_meta(crecimiento_qoq, meta, invertido=False) if crecimiento_qoq > 0 else 0.0

    return {
        "indicador": "Ingreso publicitario mensual", "valor_actual": valor_actual, "unidad": " USD",
        "meta": f"crecimiento trimestral (ilustrativo +{meta:g}% QoQ)", "meta_valor": meta,
        "invertido": False, "porcentaje_meta": round(pct_meta, 1), "semaforo": _semaforo(pct_meta),
        "tendencia": tendencia,
        "es_estimado": any(f.get("es_estimado") for f in filas) if filas else False,
        "nota": f"crecimiento trimestre-sobre-trimestre real: {crecimiento_qoq:+.1f}%",
    }


def _kpi_arr_por_api() -> dict:
    """% ARR por integraciones de API (meta 30% en 12 meses, S14 §13.3).
    Gold no tiene una columna de ingreso ($) atribuible a API — se aproxima
    con partners realmente activos por tier en el período
    (`count(DISTINCT partner_id)` con `total_llamadas > 0` en
    GOLD_API_CONSUMO_PERIODO, dato real) × precio publicado de ese tier
    (`paquetes.suscripciones.planes.PLANES`, la misma fuente que expone
    `GET /suscripciones/planes` — no un número inventado) ÷ ARR del mismo
    período (GOLD_FINANCIERO_PERIODO.arr). Es una estimación de ingreso
    recurrente atribuible a API, no un monto contable real — documentado
    en `nota`."""
    filas_api = query_rows_gold(
        "SELECT periodo, tier, count(DISTINCT partner_id) AS partners "
        "FROM GOLD_API_CONSUMO_PERIODO "
        "WHERE granularidad = {g:String} AND total_llamadas > 0 "
        "GROUP BY periodo, tier ORDER BY periodo",
        {"g": GRANULARIDAD_BSC},
    )
    ingreso_por_periodo: dict[str, float] = {}
    for f in filas_api:
        precio = PLANES.get(f["tier"], {}).get("precio", 0.0)
        ingreso_por_periodo[f["periodo"]] = ingreso_por_periodo.get(f["periodo"], 0.0) + f["partners"] * precio

    filas_arr = fetch_gold("GOLD_FINANCIERO_PERIODO", None, None, granularidad=GRANULARIDAD_BSC)
    arr_por_periodo = dict(_por_periodo(filas_arr, "arr", "suma"))

    periodos = sorted(set(ingreso_por_periodo) & set(arr_por_periodo))[-PUNTOS_TENDENCIA:]
    tendencia = [
        round(ingreso_por_periodo[p] / arr_por_periodo[p] * 100, 2) if arr_por_periodo.get(p, 0) > 0 else 0.0
        for p in periodos
    ]
    valor_actual = tendencia[-1] if tendencia else 0.0
    meta = 30.0
    pct_meta = _pct_meta(valor_actual, meta, invertido=False)

    return {
        "indicador": "% ARR por integraciones de API", "valor_actual": valor_actual, "unidad": "%",
        "meta": f"{meta:g}% en 12 meses", "meta_valor": meta, "invertido": False,
        "porcentaje_meta": round(pct_meta, 1), "semaforo": _semaforo(pct_meta),
        "tendencia": tendencia, "es_estimado": True,
        "nota": "estimado: partners activos por tier × precio publicado del plan ÷ ARR "
                "(Gold no registra ingreso $ por integración de API directamente)",
    }


def _kpi_cac_por_region() -> dict:
    """CAC por región (meta: -25% vs. no segmentadas, S14 §13.3).
    GOLD_ADQUISICION_PERIODO confirmado (240 filas con `pais` poblado, 0 con
    `cac_estimado > 0`): el CAC solo se calcula a nivel agregado en Gold,
    nunca desglosado por país — la dimensión país solo trae volumen de
    altas (`registros_nuevos`), no costo. Se reporta el CAC agregado real
    (fila con `pais='' AND plan=''`) con esa limitación documentada, más un
    desglose real de altas por país del último período (única dimensión
    regional que sí existe hoy) para no perder el ángulo "por región" por
    completo. El % de meta compara el CAC actual contra el primer período
    disponible de la serie (baseline real, no inventada) — reducción
    lograda vs. el -25% objetivo."""
    filas = fetch_gold(
        "GOLD_ADQUISICION_PERIODO", None, None, granularidad=GRANULARIDAD_BSC,
        extra_where="pais = '' AND plan = ''",
    )
    serie = _por_periodo(filas, "cac_estimado", "promedio")
    valores = [v for _, v in serie]
    tendencia = valores[-PUNTOS_TENDENCIA:]
    valor_actual = tendencia[-1] if tendencia else 0.0

    reduccion_pct = 0.0
    if len(valores) >= 2 and valores[0] > 0:
        reduccion_pct = round((valores[0] - valor_actual) / valores[0] * 100, 1)
    meta = 25.0  # % de reducción buscada
    pct_meta = _pct_meta(reduccion_pct, meta, invertido=False) if reduccion_pct > 0 else 0.0

    filas_pais = fetch_gold(
        "GOLD_ADQUISICION_PERIODO", None, None, granularidad=GRANULARIDAD_BSC,
        extra_where="pais != ''",
    )
    ultimo_periodo = filas_pais[-1]["periodo"] if filas_pais else None
    desglose_regional = sorted(
        (
            {"region": f["pais"], "registros_nuevos": int(f["registros_nuevos"])}
            for f in filas_pais if f["periodo"] == ultimo_periodo
        ),
        key=lambda r: -r["registros_nuevos"],
    ) if ultimo_periodo else []

    return {
        "indicador": "CAC por región", "valor_actual": valor_actual, "unidad": " USD",
        "meta": f"-{meta:g}% vs. adquisición no segmentada", "meta_valor": meta, "invertido": False,
        "porcentaje_meta": round(pct_meta, 1), "semaforo": _semaforo(pct_meta),
        "tendencia": tendencia,
        "es_estimado": any(f.get("es_estimado") for f in filas) if filas else False,
        "nota": f"Gold no desglosa CAC por país todavía (solo volumen de altas por país); "
                f"reducción real vs. primer período de la serie: {reduccion_pct:+.1f}%",
        "desglose_regional": desglose_regional,
    }


def _kpi_crecimiento_usuarios() -> dict:
    """Crecimiento de usuarios registrados (meta +40% trimestral, S14 §13.3)."""
    filas = fetch_gold(
        "GOLD_ADQUISICION_PERIODO", None, None, granularidad=GRANULARIDAD_TRIMESTRE,
        extra_where="pais != ''",
    )
    serie = _por_periodo(filas, "registros_nuevos", "suma")
    valores = [v for _, v in serie]
    tendencia = valores[-PUNTOS_TENDENCIA:]

    crecimiento_qoq = 0.0
    if len(valores) >= 2 and valores[-2] > 0:
        crecimiento_qoq = round((valores[-1] - valores[-2]) / valores[-2] * 100, 1)
    meta = 40.0
    pct_meta = _pct_meta(crecimiento_qoq, meta, invertido=False) if crecimiento_qoq > 0 else 0.0

    return {
        "indicador": "Crecimiento de usuarios registrados", "valor_actual": crecimiento_qoq, "unidad": "%",
        "meta": f"+{meta:g}% trimestral", "meta_valor": meta, "invertido": False,
        "porcentaje_meta": round(pct_meta, 1), "semaforo": _semaforo(pct_meta),
        "tendencia": tendencia,
        "es_estimado": any(f.get("es_estimado") for f in filas) if filas else False,
        "nota": "valor_actual es el % de crecimiento trimestre-sobre-trimestre real "
                "(no un conteo absoluto); tendencia = registros nuevos por trimestre",
    }


def _kpi_regalias_a_tiempo() -> dict:
    """Regalías liquidadas a tiempo (meta >95% del ciclo, S14 §13.3). Gold no
    tiene una columna de "liquidado a tiempo vs. tarde" — se aproxima como
    % de contratos con reproducciones en el período que efectivamente
    tienen `monto_liquidado > 0` en ese mismo período (liquidación dentro
    del ciclo en que se generó, vs. quedar pendiente). Cada `(periodo,
    contrato_id)` viene repetido varias veces en Gold (confirmado: mismas
    filas duplicadas) — se agrupa con `max()` antes de contar, ya que las
    filas duplicadas son idénticas."""
    filas = query_rows_gold(
        "SELECT periodo, contrato_id, "
        "max(reproducciones_periodo) AS repros, max(monto_liquidado) AS liquidado "
        "FROM GOLD_REGALIAS_PERIODO WHERE granularidad = {g:String} "
        "GROUP BY periodo, contrato_id ORDER BY periodo",
        {"g": GRANULARIDAD_BSC},
    )
    acc: dict[str, dict[str, int]] = {}
    orden: list[str] = []
    for f in filas:
        if f["repros"] <= 0:
            continue  # sin actividad en el período, no aplica "a tiempo"
        p = f["periodo"]
        if p not in acc:
            acc[p] = {"con_actividad": 0, "liquidados": 0}
            orden.append(p)
        acc[p]["con_actividad"] += 1
        if f["liquidado"] > 0:
            acc[p]["liquidados"] += 1

    tendencia = [
        round(acc[p]["liquidados"] / acc[p]["con_actividad"] * 100, 1) if acc[p]["con_actividad"] > 0 else 0.0
        for p in orden
    ][-PUNTOS_TENDENCIA:]
    valor_actual = tendencia[-1] if tendencia else 0.0
    meta = 95.0
    pct_meta = _pct_meta(valor_actual, meta, invertido=False)

    return {
        "indicador": "Regalías liquidadas a tiempo", "valor_actual": valor_actual, "unidad": "%",
        "meta": f">{meta:g}% del ciclo", "meta_valor": meta, "invertido": False,
        "porcentaje_meta": round(pct_meta, 1), "semaforo": _semaforo(pct_meta),
        "tendencia": tendencia, "es_estimado": True,
        "nota": "proxy: % de contratos con reproducciones en el período que ya tienen "
                "monto liquidado en ese mismo período (Gold no marca 'a tiempo' explícitamente)",
    }


def _kpi_retencion_b2b() -> dict:
    """Retención B2B (meta 85% anual, S14 §13.3). Solo hay 3 años reales en
    Gold (2024-2026, insuficiente para una serie anual con sentido
    estadístico) — se aproxima con retención MES-A-MES de partners
    (overlap de `partner_id` activos entre período consecutivo y anterior
    en GOLD_API_CONSUMO_PERIODO), documentado como aproximación, no como
    el ciclo anual literal del documento fuente."""
    filas = query_rows_gold(
        "SELECT periodo, groupUniqArray(partner_id) AS partners "
        "FROM GOLD_API_CONSUMO_PERIODO WHERE granularidad = {g:String} AND total_llamadas > 0 "
        "GROUP BY periodo ORDER BY periodo",
        {"g": GRANULARIDAD_BSC},
    )
    tendencia = []
    for i in range(1, len(filas)):
        anteriores = set(filas[i - 1]["partners"])
        actuales = set(filas[i]["partners"])
        if not anteriores:
            continue
        retenidos = len(anteriores & actuales)
        tendencia.append(round(retenidos / len(anteriores) * 100, 1))
    tendencia = tendencia[-PUNTOS_TENDENCIA:]
    valor_actual = tendencia[-1] if tendencia else 0.0
    meta = 85.0
    pct_meta = _pct_meta(valor_actual, meta, invertido=False)

    return {
        "indicador": "Retención B2B", "valor_actual": valor_actual, "unidad": "%",
        "meta": f"{meta:g}% anual", "meta_valor": meta, "invertido": False,
        "porcentaje_meta": round(pct_meta, 1), "semaforo": _semaforo(pct_meta),
        "tendencia": tendencia, "es_estimado": True,
        "nota": "aproximación mes-sobre-mes (overlap de partners activos); el documento "
                "fuente pide ciclo anual pero Gold solo tiene 3 años, insuficiente para eso",
    }


def _kpi_ab_tests_concluidos() -> dict:
    """A/B tests concluidos por trimestre (meta >4, S14 §13.3).
    GOLD_PRODUCTO_PERIODO (categoria='ab_test') trae `experimentos_activos`
    fijo en 2 por fila (variantes por test, no cantidad de tests) — el
    conteo real de tests distintos por trimestre es
    `count(DISTINCT dimension)`, no una suma de `experimentos_activos`."""
    filas = query_rows_gold(
        "SELECT periodo, count(DISTINCT dimension) AS n_tests "
        "FROM GOLD_PRODUCTO_PERIODO WHERE granularidad = {g:String} AND categoria = 'ab_test' "
        "GROUP BY periodo ORDER BY periodo",
        {"g": GRANULARIDAD_TRIMESTRE},
    )
    tendencia = [f["n_tests"] for f in filas][-PUNTOS_TENDENCIA:]
    valor_actual = tendencia[-1] if tendencia else 0.0
    meta = 4.0
    pct_meta = _pct_meta(valor_actual, meta, invertido=False)

    return {
        "indicador": "A/B tests concluidos", "valor_actual": valor_actual, "unidad": " tests/trimestre",
        "meta": f">{meta:g} por trimestre", "meta_valor": meta, "invertido": False,
        "porcentaje_meta": round(pct_meta, 1), "semaforo": _semaforo(pct_meta),
        "tendencia": tendencia, "es_estimado": False,
        "nota": "conteo de tests distintos (dimension) por trimestre, no de variantes activas",
    }


# ─────────────────────────────────────────────────────────────────────────────
# `GET /analitica/bsc/resumen`
# ─────────────────────────────────────────────────────────────────────────────

def bsc_resumen() -> dict:
    perspectivas = [
        {
            "nombre": "Financiera",
            "kpis": [
                _kpi_arr_por_api(),
                _kpi_conversion_premium(),
                _kpi_ingreso_publicidad_mensual(),
            ],
        },
        {
            "nombre": "Cliente",
            "kpis": [
                _kpi_cac_por_region(),
                _kpi_crecimiento_usuarios(),
                _kpi_sin_datos(
                    "Retención de creadores activos", ">80% trimestral",
                    "sin tabla Gold de respaldo: no existe GOLD_CREADORES_PERIODO ni "
                    "columna equivalente en ninguna tabla Gold actual",
                ),
            ],
        },
        {
            "nombre": "Procesos Internos",
            "kpis": [
                _kpi("Uptime del sistema", "GOLD_INFRAESTRUCTURA_PERIODO", "uptime_porcentaje",
                     99.9, unidad="%"),
                _kpi("Tasa de rechazo de ingesta", "GOLD_PIPELINE_PERIODO", "tasa_rechazo",
                     1.0, unidad="%", invertido=True),
                _kpi_regalias_a_tiempo(),
            ],
        },
        {
            "nombre": "Aprendizaje y Crecimiento",
            "kpis": [
                _kpi_sin_datos(
                    "Respuesta a decisiones estratégicas", "<24 horas",
                    "métrica de proceso/gobernanza (velocidad de reacción del liderazgo), "
                    "ningún pipeline de datos puede medirla — no hay tabla Gold posible para esto",
                ),
                _kpi_retencion_b2b(),
                _kpi("Conversión de recomendaciones", "GOLD_PRODUCTO_PERIODO", "tasa_conversion_recomendacion",
                     15.0, unidad="%", categoria="recomendaciones"),
                _kpi_ab_tests_concluidos(),
            ],
        },
    ]
    return {"perspectivas": perspectivas}


# ─────────────────────────────────────────────────────────────────────────────
# `GET /analitica/bsc/analisis-inteligente` — motor 100% algorítmico
# ─────────────────────────────────────────────────────────────────────────────

UMBRAL_ZSCORE = 2.0  # |z| > 2 ⇒ atípico (regla estándar, ~95% de una normal)


def _zscore_anomalias(tendencia: list[float]) -> list[dict]:
    """Detección de anomalías por Z-score sobre la propia serie histórica
    del KPI (no contra la meta) — marca puntos que se apartan más de
    `UMBRAL_ZSCORE` desviaciones estándar del promedio de su propia serie.
    Requiere al menos 3 puntos con varianza > 0 (una serie constante no
    tiene anomalías por definición)."""
    if len(tendencia) < MINIMO_HISTORICO:
        return []
    arr = np.array(tendencia, dtype=float)
    std = arr.std()
    if std == 0:
        return []
    z = (arr - arr.mean()) / std
    return [
        {"indice": i, "valor": round(float(arr[i]), 2), "z_score": round(float(z[i]), 2)}
        for i in range(len(arr)) if abs(z[i]) > UMBRAL_ZSCORE
    ]


def _proyeccion_kpi(tendencia: list[float]) -> dict:
    """Regresión lineal (numpy.polyfit, grado 1) sobre la serie del KPI,
    reutilizando `proyeccion.proyectar_serie` (mismo mecanismo ya validado
    para los paneles predictivos Enterprise) — los índices de posición
    hacen de eje X, ya que los períodos son igualmente espaciados."""
    if len(tendencia) < MINIMO_HISTORICO:
        return {"proyeccion": None, "nota": "datos insuficientes para proyección"}
    resultado = proyectar_serie(list(range(len(tendencia))), tendencia)
    if not resultado["suficiente"]:
        return {"proyeccion": None, "nota": "datos insuficientes para proyección"}
    return {
        "proyeccion": resultado["valores_proyectados"][0],  # próximo período
        "proyeccion_horizonte": resultado["valores_proyectados"],
        "pendiente": resultado["pendiente_semanal"],
        "nota": None,
    }


def _diagnostico_kpi(kpi: dict) -> dict:
    """Ensambla el diagnóstico de un KPI: desviación % vs meta, proyección
    (regresión) y anomalías (Z-score) — cada pieza es un cálculo
    determinístico independiente, ninguna depende de las demás."""
    if kpi["semaforo"] == "sin_datos":
        return {
            "indicador": kpi["indicador"], "semaforo": "sin_datos",
            "desviacion_pct": None, "proyeccion": None, "proyeccion_horizonte": None,
            "anomalias": [], "nota": kpi["nota"],
        }

    valor = kpi["valor_actual"]
    meta = kpi["meta_valor"]
    if meta and meta > 0:
        desviacion_pct = round(((meta - valor) / meta * 100) if kpi["invertido"]
                                else ((valor - meta) / meta * 100), 1)
    else:
        desviacion_pct = None

    proy = _proyeccion_kpi(kpi["tendencia"])
    anomalias = _zscore_anomalias(kpi["tendencia"])

    return {
        "indicador": kpi["indicador"], "semaforo": kpi["semaforo"],
        "valor_actual": valor, "meta": kpi["meta"], "desviacion_pct": desviacion_pct,
        "proyeccion": proy["proyeccion"], "proyeccion_horizonte": proy.get("proyeccion_horizonte"),
        "anomalias": anomalias, "nota": kpi["nota"],
    }


# ── Reglas de correlación cruzada (hardcoded, cada una documenta qué regla
# de negocio representa) ─────────────────────────────────────────────────────

def _regla_retencion_engagement(diags: dict[str, dict]) -> dict | None:
    """R1 — caída simultánea de Retención B2B y Conversión de
    recomendaciones: ambas dependen de que el producto retenga atención;
    si las dos caen a la vez, sugiere una causa común de fricción de
    producto (no dos problemas independientes)."""
    r = diags.get("Retención B2B")
    c = diags.get("Conversión de recomendaciones")
    if not r or not c or r["desviacion_pct"] is None or c["desviacion_pct"] is None:
        return None
    if r["desviacion_pct"] < -10 and c["desviacion_pct"] < -10:
        return {
            "regla": "retencion_b2b_y_conversion_recomendacion",
            "mensaje": "Retención B2B y conversión de recomendaciones caen a la vez — "
                       "posible causa raíz común de fricción de producto, no dos problemas aislados.",
            "kpis_involucrados": ["Retención B2B", "Conversión de recomendaciones"],
        }
    return None


def _regla_infraestructura_pipeline(diags: dict[str, dict]) -> dict | None:
    """R2 — Uptime bajo meta + tasa de rechazo de ingesta alta: ambos
    dependen de la misma infraestructura subyacente; su coincidencia
    sugiere un incidente de infraestructura transversal, no dos fallas
    aisladas de subsistemas distintos."""
    u = diags.get("Uptime del sistema")
    p = diags.get("Tasa de rechazo de ingesta")
    if not u or not p:
        return None
    if u["semaforo"] in ("amarillo", "rojo") and p["semaforo"] in ("amarillo", "rojo"):
        return {
            "regla": "uptime_y_rechazo_ingesta",
            "mensaje": "Uptime por debajo de meta junto con tasa de rechazo de ingesta elevada — "
                       "posible incidente de infraestructura afectando disponibilidad y pipeline a la vez.",
            "kpis_involucrados": ["Uptime del sistema", "Tasa de rechazo de ingesta"],
        }
    return None


def _regla_adquisicion_ineficiente(diags: dict[str, dict]) -> dict | None:
    """R3 — CAC subiendo mientras el crecimiento de usuarios cae: mismo
    gasto de adquisición rindiendo menos, señal de canal perdiendo
    eficiencia (no solo un problema de producto/retención)."""
    cac = diags.get("CAC por región")
    cre = diags.get("Crecimiento de usuarios registrados")
    if not cac or not cre or cac["desviacion_pct"] is None or cre["desviacion_pct"] is None:
        return None
    if cac["desviacion_pct"] > 15 and cre["desviacion_pct"] < -10:
        return {
            "regla": "cac_alto_y_crecimiento_bajo",
            "mensaje": "CAC por encima de la meta mientras el crecimiento de usuarios cae — "
                       "el canal de adquisición pierde eficiencia (mismo costo, menos resultado).",
            "kpis_involucrados": ["CAC por región", "Crecimiento de usuarios registrados"],
        }
    return None


def _regla_monetizacion_desplazada(diags: dict[str, dict]) -> dict | None:
    """R4 — conversión premium cae mientras el ingreso publicitario sube
    fuerte: la base gratuita crece más rápido que la de pago, señal de que
    la monetización se está desplazando hacia ads en vez del paywall
    (puede ser deliberado, pero vale marcarlo para revisión estratégica)."""
    prem = diags.get("Tasa de conversión premium")
    ads = diags.get("Ingreso publicitario mensual")
    if not prem or not ads or prem["desviacion_pct"] is None:
        return None
    if prem["desviacion_pct"] < -10 and (ads.get("nota") or "").find("+") != -1:
        return {
            "regla": "conversion_premium_baja_y_ads_sube",
            "mensaje": "Conversión premium por debajo de meta mientras el ingreso publicitario "
                       "crece — la monetización se está desplazando hacia ads en vez del paywall.",
            "kpis_involucrados": ["Tasa de conversión premium", "Ingreso publicitario mensual"],
        }
    return None


REGLAS_CORRELACION = [
    _regla_retencion_engagement,
    _regla_infraestructura_pipeline,
    _regla_adquisicion_ineficiente,
    _regla_monetizacion_desplazada,
]


def _indice_desempeno_relativo() -> dict | None:
    """Índice de desempeño relativo (engagement_score / popularity), ya
    definido en el sistema a nivel por-artista/track (operacional) — acá se
    reutiliza el mismo cociente a nivel agregado de período, con las
    columnas Gold equivalentes (GOLD_ENGAGEMENT_PERIODO.engagement_score_promedio
    / popularidad_promedio), para aportar al diagnóstico de OE4 (BI
    centralizado) y OE5 (ecosistema de creadores) sin recalcular desde la
    capa operacional."""
    filas = fetch_gold("GOLD_ENGAGEMENT_PERIODO", None, None, granularidad=GRANULARIDAD_BSC)
    if not filas:
        return None
    eng = dict(_por_periodo(filas, "engagement_score_promedio", "promedio"))
    pop = dict(_por_periodo(filas, "popularidad_promedio", "promedio"))
    periodos = sorted(set(eng) & set(pop))[-PUNTOS_TENDENCIA:]
    tendencia = [round(eng[p] / pop[p], 3) if pop.get(p, 0) > 0 else 0.0 for p in periodos]
    if not tendencia:
        return None
    return {
        "indicador": "Índice de desempeño relativo (engagement/popularidad)",
        "valor_actual": tendencia[-1],
        "tendencia": tendencia,
        "nota": "agregado de período (GOLD_ENGAGEMENT_PERIODO); mismo cociente que el índice "
                "por artista/track, aplicado a OE4/OE5",
    }


def bsc_analisis_inteligente() -> dict:
    resumen = bsc_resumen()
    kpis_planos: dict[str, dict] = {
        kpi["indicador"]: kpi for persp in resumen["perspectivas"] for kpi in persp["kpis"]
    }

    diagnosticos = {ind: _diagnostico_kpi(kpi) for ind, kpi in kpis_planos.items()}

    diagnosticos_ordenados = sorted(
        diagnosticos.values(),
        key=lambda d: abs(d["desviacion_pct"]) if d["desviacion_pct"] is not None else -1,
        reverse=True,
    )

    correlaciones = [r for regla in REGLAS_CORRELACION if (r := regla(diagnosticos)) is not None]

    return {
        "diagnosticos": diagnosticos_ordenados,
        "correlaciones": correlaciones,
        "indice_desempeno_relativo": _indice_desempeno_relativo(),
        "metodologia": (
            "Diagnóstico generado mediante regresión lineal (numpy.polyfit), detección de "
            "anomalías (Z-score sobre la serie histórica de cada KPI) y reglas de correlación "
            "predefinidas entre KPIs del Balanced Scorecard. No involucra modelos de lenguaje "
            "ni servicios de IA externos — es estadística y reglas de negocio determinísticas "
            "sobre datos reales de Gold."
        ),
    }
