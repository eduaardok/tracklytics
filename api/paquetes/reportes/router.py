"""Router de los 30 informes compuestos (S13-P3a) — uno por objetivo táctico
con componente compuesto (ver docs/OBJETIVOS_TRACKLYTICS.md, Sección 2).

Convención de rutas: `/app/v1/reportes/compuestos/<departamento>/<informe>`,
agrupadas por los 9 departamentos de negocio — mismo criterio de agrupación
que el resto del documento de objetivos y que `SeguridadShell` (secciones
por área). Todos leen EXCLUSIVAMENTE de ClickHouse Gold (8124) vía
`queries.fetch_gold` — nunca agregan en caliente sobre el catálogo (8123).

Cada handler es deliberadamente delgado: arma el `resumen` con sumas/
promedios simples en Python sobre filas ya agregadas por el DAG — no hay
lógica de negocio nueva acá, toda la agregación real ya ocurrió en
`etl/gold_ch/*.py`.
"""

from fastapi import APIRouter, Depends, Query

from paquetes.reportes.deps import (
    require_analitica, require_comercial, require_comunidad, require_contenido,
    require_datos, require_financiero, require_producto, require_seguridad, require_tecnologia,
)
from paquetes.reportes.queries import fetch_gold
from paquetes.reportes.schemas import armar_respuesta

router = APIRouter(prefix="/app/v1/reportes/compuestos", tags=["Reportes compuestos"])

PeriodoQ = Query(None, description="Período ISO 'YYYY-WNN', ej. 2026-W20")


def _sum(rows: list[dict], key: str) -> float:
    return round(sum(r.get(key) or 0 for r in rows), 2)


def _avg(rows: list[dict], key: str) -> float:
    vals = [r.get(key) or 0 for r in rows]
    return round(sum(vals) / len(vals), 2) if vals else 0.0


def _ultimo(rows: list[dict], key: str):
    return rows[-1].get(key) if rows else None


# ─────────────────────────────────────────────────────────────────────────────
# COMERCIAL (OT-01/02/03) — require_comercial
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/comercial/adquisicion")
def c01_adquisicion(periodo_inicio: str | None = PeriodoQ, periodo_fin: str | None = PeriodoQ,
                     _admin=Depends(require_comercial)):
    filas = fetch_gold("GOLD_ADQUISICION_PERIODO", periodo_inicio, periodo_fin)
    datos = [f for f in filas if f["pais"] != ""]
    cac_filas = [f for f in filas if f["pais"] == "" and f["plan"] == ""]
    return armar_respuesta(
        "C01", "OT-01", "Embudo de conversión por etapa y CAC por mercado", "Comercial y Marketing",
        periodo_inicio, periodo_fin, datos,
        {"registros_nuevos_total": sum(int(f["registros_nuevos"]) for f in datos),
         "cac_promedio": _avg(cac_filas, "cac_estimado"),
         "deserciones_total": sum(int(f["deserciones"]) for f in cac_filas)},
    )


@router.get("/comercial/conversion")
def c02_conversion(periodo_inicio: str | None = PeriodoQ, periodo_fin: str | None = PeriodoQ,
                    _admin=Depends(require_comercial)):
    filas = fetch_gold("GOLD_ADQUISICION_PERIODO", periodo_inicio, periodo_fin)
    datos = [f for f in filas if f["plan"] != ""]
    deserciones = [f for f in filas if f["pais"] == "" and f["plan"] == ""]
    return armar_respuesta(
        "C02", "OT-02", "Tasa de conversión free-to-paid y deserción por región y período", "Comercial y Marketing",
        periodo_inicio, periodo_fin, datos,
        {"conversiones_total": sum(int(f["conversiones_free_to_paid"]) for f in datos),
         "deserciones_total": sum(int(f["deserciones"]) for f in deserciones)},
    )


@router.get("/comercial/suscripciones")
def c03_suscripciones(periodo_inicio: str | None = PeriodoQ, periodo_fin: str | None = PeriodoQ,
                       _admin=Depends(require_comercial)):
    filas = fetch_gold("GOLD_ADQUISICION_PERIODO", periodo_inicio, periodo_fin)
    datos = [f for f in filas if f["plan"] != ""]
    ultimo_periodo = max((f["periodo"] for f in datos), default=None)
    por_plan_ultimo = {f["plan"]: f["suscripciones_activas"] for f in datos if f["periodo"] == ultimo_periodo}
    return armar_respuesta(
        "C03", "OT-03", "Distribución de suscriptores por plan y tendencia mensual", "Comercial y Marketing",
        periodo_inicio, periodo_fin, datos,
        {"suscripciones_activas_ultimo_periodo": por_plan_ultimo, "periodo_mas_reciente": ultimo_periodo},
    )


# ─────────────────────────────────────────────────────────────────────────────
# TECNOLOGÍA (OT-04/05/06) — require_tecnologia
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/tecnologia/api-consumo")
def c04_api_consumo(periodo_inicio: str | None = PeriodoQ, periodo_fin: str | None = PeriodoQ,
                     _admin=Depends(require_tecnologia)):
    datos = fetch_gold("GOLD_API_CONSUMO_PERIODO", periodo_inicio, periodo_fin)
    return armar_respuesta(
        "C04", "OT-04", "Volumen de llamadas API por partner y tier, tasa de éxito y latencia", "Tecnología",
        periodo_inicio, periodo_fin, datos,
        {"total_llamadas": int(_sum(datos, "total_llamadas")), "tasa_exito_promedio": _avg(datos, "tasa_exito"),
         "latencia_promedio_ms": _avg(datos, "latencia_promedio_ms")},
    )


@router.get("/tecnologia/disponibilidad")
def c05_disponibilidad(periodo_inicio: str | None = PeriodoQ, periodo_fin: str | None = PeriodoQ,
                        _admin=Depends(require_tecnologia)):
    datos = fetch_gold("GOLD_INFRAESTRUCTURA_PERIODO", periodo_inicio, periodo_fin)
    return armar_respuesta(
        "C05", "OT-05", "Tasa de disponibilidad histórica e incidentes por componente y período", "Tecnología",
        periodo_inicio, periodo_fin, datos,
        {"uptime_promedio": _avg(datos, "uptime_porcentaje"), "incidentes_total": int(_sum(datos, "incidentes_total"))},
    )


@router.get("/tecnologia/errores")
def c06_errores(periodo_inicio: str | None = PeriodoQ, periodo_fin: str | None = PeriodoQ,
                 _admin=Depends(require_tecnologia)):
    datos = fetch_gold("GOLD_INFRAESTRUCTURA_PERIODO", periodo_inicio, periodo_fin)
    return armar_respuesta(
        "C06", "OT-06", "Tendencia de errores por servicio y período", "Tecnología",
        periodo_inicio, periodo_fin, datos,
        {"errores_total": int(_sum(datos, "errores_total")), "errores_criticos_total": int(_sum(datos, "errores_criticos"))},
    )


# ─────────────────────────────────────────────────────────────────────────────
# FINANCIERO (OT-07/08/09/10/11) — require_financiero
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/financiero/mrr-arr")
def c07_mrr_arr(periodo_inicio: str | None = PeriodoQ, periodo_fin: str | None = PeriodoQ,
                 _admin=Depends(require_financiero)):
    datos = fetch_gold("GOLD_FINANCIERO_PERIODO", periodo_inicio, periodo_fin)
    return armar_respuesta(
        "C07", "OT-07", "MRR, ARR, margen neto y estado de resultados por período", "Financiero",
        periodo_inicio, periodo_fin, datos,
        {"mrr_actual": _ultimo(datos, "mrr"), "arr_actual": _ultimo(datos, "arr"),
         "margen_neto_acumulado": _sum(datos, "margen_neto")},
    )


@router.get("/financiero/gastos-vs-ingresos")
def c08_gastos_vs_ingresos(periodo_inicio: str | None = PeriodoQ, periodo_fin: str | None = PeriodoQ,
                            _admin=Depends(require_financiero)):
    datos = fetch_gold("GOLD_FINANCIERO_PERIODO", periodo_inicio, periodo_fin)
    ingresos = _sum(datos, "ingresos_suscripciones") + _sum(datos, "ingresos_publicidad")
    return armar_respuesta(
        "C08", "OT-08", "Comparativa de gastos vs ingresos por período", "Financiero",
        periodo_inicio, periodo_fin, datos,
        {"ingresos_total": round(ingresos, 2), "gastos_total": _sum(datos, "gastos_total"),
         "reembolsos_total": _sum(datos, "reembolsos_total")},
    )


@router.get("/financiero/regalias")
def c09_regalias(periodo_inicio: str | None = PeriodoQ, periodo_fin: str | None = PeriodoQ,
                  _admin=Depends(require_financiero)):
    datos = fetch_gold("GOLD_REGALIAS_PERIODO", periodo_inicio, periodo_fin)
    return armar_respuesta(
        "C09", "OT-09", "Liquidaciones de regalías agregadas por contrato, sello y período", "Financiero",
        periodo_inicio, periodo_fin, datos,
        {"monto_liquidado_total": _sum(datos, "monto_liquidado"),
         "reproducciones_total": int(_sum(datos, "reproducciones_periodo"))},
    )


@router.get("/financiero/publicidad")
def c10_publicidad(periodo_inicio: str | None = PeriodoQ, periodo_fin: str | None = PeriodoQ,
                    _admin=Depends(require_financiero)):
    datos = fetch_gold("GOLD_FINANCIERO_PERIODO", periodo_inicio, periodo_fin)
    return armar_respuesta(
        "C10", "OT-10", "Ingresos publicitarios por formato y anunciante por período", "Financiero",
        periodo_inicio, periodo_fin,
        [{"periodo": f["periodo"], "ingresos_publicidad": f["ingresos_publicidad"]} for f in datos],
        {"ingresos_publicidad_total": _sum(datos, "ingresos_publicidad")},
    )


@router.get("/financiero/facturacion")
def c11_facturacion(periodo_inicio: str | None = PeriodoQ, periodo_fin: str | None = PeriodoQ,
                     _admin=Depends(require_financiero)):
    datos = fetch_gold("GOLD_FINANCIERO_PERIODO", periodo_inicio, periodo_fin)
    return armar_respuesta(
        "C11", "OT-11", "Volumen de facturación y tasa de cobro exitoso por período", "Financiero",
        periodo_inicio, periodo_fin, datos,
        {"facturas_emitidas_total": int(_sum(datos, "facturas_emitidas")),
         "facturas_cobradas_total": int(_sum(datos, "facturas_cobradas")),
         "tasa_cobro_promedio": _avg(datos, "tasa_cobro")},
    )


# ─────────────────────────────────────────────────────────────────────────────
# INGENIERÍA DE DATOS (OT-12/13) — require_datos
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/datos/pipeline")
def c12_pipeline(periodo_inicio: str | None = PeriodoQ, periodo_fin: str | None = PeriodoQ,
                  _admin=Depends(require_datos)):
    datos = fetch_gold("GOLD_PIPELINE_PERIODO", periodo_inicio, periodo_fin)
    return armar_respuesta(
        "C12", "OT-12", "Tendencia de duración y volumen de ingesta por semana", "Ingeniería de Datos",
        periodo_inicio, periodo_fin, datos,
        {"duracion_promedio_s": _avg(datos, "duracion_promedio_s"),
         "registros_insertados_total": int(_sum(datos, "registros_insertados"))},
    )


@router.get("/datos/calidad")
def c13_calidad(periodo_inicio: str | None = PeriodoQ, periodo_fin: str | None = PeriodoQ,
                 _admin=Depends(require_datos)):
    datos = fetch_gold("GOLD_PIPELINE_PERIODO", periodo_inicio, periodo_fin)
    real = _sum(datos, "registros_real")
    synth = _sum(datos, "registros_synthetic")
    upl = _sum(datos, "registros_uploaded")
    total = real + synth + upl
    return armar_respuesta(
        "C13", "OT-13", "Distribución por tipo de fuente y porcentaje de registros válidos por lote", "Ingeniería de Datos",
        periodo_inicio, periodo_fin, datos,
        {"registros_real": int(real), "registros_synthetic": int(synth), "registros_uploaded": int(upl),
         "tasa_rechazo_promedio": _avg(datos, "tasa_rechazo"),
         "pct_valido_promedio": round(100 - _avg(datos, "tasa_rechazo"), 2) if total else 0},
    )


# ─────────────────────────────────────────────────────────────────────────────
# ANALÍTICA Y BI (OT-15/16/17/18/19) — require_analitica
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/analitica/panel-ejecutivo")
def c14_panel_ejecutivo(periodo_inicio: str | None = PeriodoQ, periodo_fin: str | None = PeriodoQ,
                         _admin=Depends(require_analitica)):
    filas = fetch_gold("GOLD_ENGAGEMENT_PERIODO", periodo_inicio, periodo_fin)
    datos = [f for f in filas if f["genero"] == ""]
    return armar_respuesta(
        "C14", "OT-15", "Panel ejecutivo: métricas consolidadas de engagement, adquisición y retención", "Analítica y BI",
        periodo_inicio, periodo_fin, datos,
        {"reproducciones_total": int(_sum(datos, "reproducciones_total")),
         "usuarios_activos_promedio": _avg(datos, "usuarios_activos"),
         "nuevos_usuarios_total": int(_sum(datos, "nuevos_usuarios")),
         "usuarios_retenidos_total": int(_sum(datos, "usuarios_retenidos"))},
    )


@router.get("/analitica/ranking-generos")
def c15_ranking_generos(periodo_inicio: str | None = PeriodoQ, periodo_fin: str | None = PeriodoQ,
                         _admin=Depends(require_analitica)):
    filas = fetch_gold("GOLD_CONSUMO_GENERO_PERIODO", periodo_inicio, periodo_fin)
    datos = [f for f in filas if f["genre_id"] != 0]
    ranking: dict[str, int] = {}
    for f in datos:
        ranking[f["genero"]] = ranking.get(f["genero"], 0) + int(f["reproducciones"])
    top = sorted(ranking.items(), key=lambda kv: kv[1], reverse=True)[:10]
    return armar_respuesta(
        "C15", "OT-16", "Ranking de géneros y artistas por volumen de reproducción con variación %", "Analítica y BI",
        periodo_inicio, periodo_fin, datos,
        {"top_generos": [{"genero": g, "reproducciones": n} for g, n in top]},
    )


@router.get("/analitica/series-temporales")
def c16_series_temporales(periodo_inicio: str | None = PeriodoQ, periodo_fin: str | None = PeriodoQ,
                           _admin=Depends(require_analitica)):
    filas = fetch_gold("GOLD_ENGAGEMENT_PERIODO", periodo_inicio, periodo_fin)
    datos = sorted((f for f in filas if f["genero"] == ""), key=lambda f: f["periodo"])
    ventana = 3
    for i, f in enumerate(datos):
        vecinos = datos[max(0, i - ventana + 1):i + 1]
        f["promedio_movil_reproducciones"] = round(sum(v["reproducciones_total"] for v in vecinos) / len(vecinos), 2)
    return armar_respuesta(
        "C16", "OT-17", "Series temporales de reproducciones, engagement y popularidad con promedios móviles", "Analítica y BI",
        periodo_inicio, periodo_fin, datos, {"ventana_promedio_movil": ventana},
    )


@router.get("/analitica/proyeccion")
def c17_proyeccion(periodo_inicio: str | None = PeriodoQ, periodo_fin: str | None = PeriodoQ,
                    _admin=Depends(require_analitica)):
    filas = fetch_gold("GOLD_CONSUMO_GENERO_PERIODO", periodo_inicio, periodo_fin)
    datos = [f for f in filas if f["genre_id"] != 0 and f["prediccion_4sem"]]
    return armar_respuesta(
        "C17", "OT-18", "Proyecciones de regresión lineal a 4 semanas por género y artista", "Analítica y BI",
        periodo_inicio, periodo_fin, datos,
        {"generos_proyectados": len(datos)},
    )


@router.get("/analitica/benchmark")
def c18_benchmark(periodo_inicio: str | None = PeriodoQ, periodo_fin: str | None = PeriodoQ,
                   _admin=Depends(require_analitica)):
    filas = fetch_gold("GOLD_CONSUMO_GENERO_PERIODO", periodo_inicio, periodo_fin)
    por_genero: dict[str, dict] = {}
    for f in filas:
        if f["genre_id"] == 0:
            continue
        por_genero[f["genero"]] = {
            "genero": f["genero"],
            "popularidad_interna_promedio": f["popularidad_interna_promedio"],
            "popularidad_catalogo_base": f["popularidad_catalogo_base"],
            "diferencia_pct_benchmark": f["diferencia_pct_benchmark"],
        }
    datos = list(por_genero.values())
    return armar_respuesta(
        "C18", "OT-19", "Benchmark de popularidad interna vs índice externo por género", "Analítica y BI",
        periodo_inicio, periodo_fin, datos,
        {"popularidad_catalogo_base": datos[0]["popularidad_catalogo_base"] if datos else None},
    )


# ─────────────────────────────────────────────────────────────────────────────
# CONTENIDO Y A&R (OT-20/21/23) — require_contenido
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/contenido/revision")
def c19_revision(periodo_inicio: str | None = PeriodoQ, periodo_fin: str | None = PeriodoQ,
                  _admin=Depends(require_contenido)):
    filas = fetch_gold("GOLD_CONTENIDO_PERIODO", periodo_inicio, periodo_fin)
    vistos: dict[str, dict] = {}
    for f in filas:
        vistos.setdefault(f["periodo"], {
            "periodo": f["periodo"], "solicitudes_recibidas": f["solicitudes_recibidas"],
            "aprobadas": f["aprobadas"], "rechazadas": f["rechazadas"], "tasa_aprobacion": f["tasa_aprobacion"],
            "tiempo_promedio_resolucion_h": f["tiempo_promedio_resolucion_h"],
        })
    datos = sorted(vistos.values(), key=lambda f: f["periodo"])
    return armar_respuesta(
        "C19", "OT-20", "Tasa de aprobación/rechazo por período y tiempo promedio de resolución", "Contenido y A&R",
        periodo_inicio, periodo_fin, datos,
        {"solicitudes_total": int(_sum(datos, "solicitudes_recibidas")), "tasa_aprobacion_promedio": _avg(datos, "tasa_aprobacion")},
    )


@router.get("/contenido/licencias")
def c20_licencias(periodo_inicio: str | None = PeriodoQ, periodo_fin: str | None = PeriodoQ,
                   _admin=Depends(require_contenido)):
    filas = fetch_gold("GOLD_CONTENIDO_PERIODO", periodo_inicio, periodo_fin)
    ultimo_periodo = max((f["periodo"] for f in filas), default=None)
    datos = [f for f in filas if f["periodo"] == ultimo_periodo]
    return armar_respuesta(
        "C20", "OT-21", "Cobertura del catálogo por territorio y canal de distribución", "Contenido y A&R",
        periodo_inicio, periodo_fin,
        [{"territorio": f["territorio"], "licencias_activas": f["licencias_activas"]} for f in datos],
        {"licencias_activas_total": int(_sum(datos, "licencias_activas")), "periodo": ultimo_periodo},
    )


@router.get("/contenido/cobertura")
def c21_cobertura(periodo_inicio: str | None = PeriodoQ, periodo_fin: str | None = PeriodoQ,
                   _admin=Depends(require_contenido)):
    filas = fetch_gold("GOLD_CONTENIDO_PERIODO", periodo_inicio, periodo_fin)
    ultimo_periodo = max((f["periodo"] for f in filas), default=None)
    datos = [f for f in filas if f["periodo"] == ultimo_periodo]
    return armar_respuesta(
        "C21", "OT-23", "Análisis de cobertura del catálogo por país y canal", "Contenido y A&R",
        periodo_inicio, periodo_fin,
        [{"territorio": f["territorio"], "tracks_cubiertos": f["tracks_cubiertos"], "cobertura_pct": f["cobertura_pct"]} for f in datos],
        {"cobertura_pct_promedio": _avg(datos, "cobertura_pct"), "periodo": ultimo_periodo},
    )


# ─────────────────────────────────────────────────────────────────────────────
# COMUNIDAD Y SOPORTE (OT-24/25/26/27) — require_comunidad
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/comunidad/moderacion")
def c22_moderacion(periodo_inicio: str | None = PeriodoQ, periodo_fin: str | None = PeriodoQ,
                    _admin=Depends(require_comunidad)):
    filas = fetch_gold("GOLD_COMUNIDAD_PERIODO", periodo_inicio, periodo_fin)
    datos = [f for f in filas if f["categoria"] == "moderacion"]
    return armar_respuesta(
        "C22", "OT-24", "Volumen de moderación por tipo de acción y período", "Comunidad y Soporte",
        periodo_inicio, periodo_fin, datos,
        {"acciones_moderacion_total": int(_sum(datos, "acciones_moderacion"))},
    )


@router.get("/comunidad/denuncias")
def c23_denuncias(periodo_inicio: str | None = PeriodoQ, periodo_fin: str | None = PeriodoQ,
                   _admin=Depends(require_comunidad)):
    filas = fetch_gold("GOLD_COMUNIDAD_PERIODO", periodo_inicio, periodo_fin)
    datos = [f for f in filas if f["categoria"] == "denuncias"]
    return armar_respuesta(
        "C23", "OT-25", "Tendencia de denuncias por tipo y relación con sanciones aplicadas", "Comunidad y Soporte",
        periodo_inicio, periodo_fin, datos,
        {"denuncias_recibidas_total": int(_sum(datos, "denuncias_recibidas")),
         "denuncias_resueltas_total": int(_sum(datos, "denuncias_resueltas")),
         "sanciones_derivadas_total": int(_sum(datos, "sanciones_derivadas"))},
    )


@router.get("/comunidad/soporte")
def c24_soporte(periodo_inicio: str | None = PeriodoQ, periodo_fin: str | None = PeriodoQ,
                 _admin=Depends(require_comunidad)):
    filas = fetch_gold("GOLD_COMUNIDAD_PERIODO", periodo_inicio, periodo_fin)
    datos = [f for f in filas if f["categoria"] == "tickets"]
    return armar_respuesta(
        "C24", "OT-26", "Tiempo promedio de resolución y distribución por categoría y período", "Comunidad y Soporte",
        periodo_inicio, periodo_fin, datos,
        {"tickets_abiertos_total": int(_sum(datos, "tickets_abiertos")),
         "tickets_resueltos_total": int(_sum(datos, "tickets_resueltos")),
         "tiempo_resolucion_promedio_h": _avg(datos, "tiempo_resolucion_promedio_h")},
    )


@router.get("/comunidad/interacciones")
def c25_interacciones(periodo_inicio: str | None = PeriodoQ, periodo_fin: str | None = PeriodoQ,
                       _admin=Depends(require_comunidad)):
    filas = fetch_gold("GOLD_COMUNIDAD_PERIODO", periodo_inicio, periodo_fin)
    datos = [f for f in filas if f["categoria"] == "social"]
    return armar_respuesta(
        "C25", "OT-27", "Interacciones sociales totales por tipo y período con indicadores de crecimiento", "Comunidad y Soporte",
        periodo_inicio, periodo_fin, datos,
        {"interacciones_total": int(_sum(datos, "interacciones_sociales_total")),
         "crecimiento_pct_promedio": _avg(datos, "crecimiento_pct_vs_anterior")},
    )


# ─────────────────────────────────────────────────────────────────────────────
# SEGURIDAD (OT-29/31) — require_seguridad (superadmin, sin rol departamental propio)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/seguridad/auditoria")
def c26_auditoria(periodo_inicio: str | None = PeriodoQ, periodo_fin: str | None = PeriodoQ,
                   _admin=Depends(require_seguridad)):
    filas = fetch_gold("GOLD_SEGURIDAD_PERIODO", periodo_inicio, periodo_fin)
    datos = [f for f in filas if f["tipo_evento"] != "__resumen__"]
    return armar_respuesta(
        "C26", "OT-29", "Tendencia de eventos de auditoría por tipo de acción y período", "Seguridad",
        periodo_inicio, periodo_fin, datos,
        {"eventos_total": int(_sum(datos, "eventos_auditoria_total"))},
    )


@router.get("/seguridad/sanciones")
def c27_sanciones(periodo_inicio: str | None = PeriodoQ, periodo_fin: str | None = PeriodoQ,
                   _admin=Depends(require_seguridad)):
    filas = fetch_gold("GOLD_SEGURIDAD_PERIODO", periodo_inicio, periodo_fin)
    datos = [f for f in filas if f["tipo_evento"] == "__resumen__"]
    return armar_respuesta(
        "C27", "OT-31", "Tendencia de sanciones emitidas y tasa de suspensión automática por período", "Seguridad",
        periodo_inicio, periodo_fin, datos,
        {"sanciones_emitidas_total": int(_sum(datos, "sanciones_emitidas")),
         "suspensiones_automaticas_total": int(_sum(datos, "suspensiones_automaticas")),
         "tasa_suspension_promedio": _avg(datos, "tasa_suspension")},
    )


# ─────────────────────────────────────────────────────────────────────────────
# PRODUCTO (OT-32/33/34) — require_producto
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/producto/recomendaciones")
def c28_recomendaciones(periodo_inicio: str | None = PeriodoQ, periodo_fin: str | None = PeriodoQ,
                         _admin=Depends(require_producto)):
    filas = fetch_gold("GOLD_PRODUCTO_PERIODO", periodo_inicio, periodo_fin)
    datos = [f for f in filas if f["categoria"] == "recomendaciones"]
    return armar_respuesta(
        "C28", "OT-32", "Tasa de conversión de recomendación a reproducción por período", "Producto",
        periodo_inicio, periodo_fin, datos,
        {"recomendaciones_generadas_total": int(_sum(datos, "recomendaciones_generadas")),
         "recomendaciones_reproducidas_total": int(_sum(datos, "recomendaciones_reproducidas")),
         "tasa_conversion_promedio": _avg(datos, "tasa_conversion_recomendacion")},
    )


@router.get("/producto/ab-tests")
def c29_ab_tests(periodo_inicio: str | None = PeriodoQ, periodo_fin: str | None = PeriodoQ,
                  _admin=Depends(require_producto)):
    filas = fetch_gold("GOLD_PRODUCTO_PERIODO", periodo_inicio, periodo_fin)
    datos = [f for f in filas if f["categoria"] == "ab_test"]
    experimentos = sorted({f["dimension"] for f in datos})
    return armar_respuesta(
        "C29", "OT-33", "Resultados de experimentos por variante con métricas de impacto", "Producto",
        periodo_inicio, periodo_fin, datos,
        {"experimentos": experimentos, "exposiciones_total": int(_sum(datos, "exposiciones_variante"))},
    )


@router.get("/producto/notificaciones")
def c30_notificaciones(periodo_inicio: str | None = PeriodoQ, periodo_fin: str | None = PeriodoQ,
                        _admin=Depends(require_producto)):
    filas = fetch_gold("GOLD_PRODUCTO_PERIODO", periodo_inicio, periodo_fin)
    datos = [f for f in filas if f["categoria"] == "notificacion"]
    return armar_respuesta(
        "C30", "OT-34", "Volumen de notificaciones y tasa de interacción por tipo y período", "Producto",
        periodo_inicio, periodo_fin, datos,
        {"notificaciones_enviadas_total": int(_sum(datos, "notificaciones_enviadas")),
         "notificaciones_leidas_total": int(_sum(datos, "notificaciones_leidas")),
         "tasa_lectura_promedio": _avg(datos, "tasa_lectura")},
    )
