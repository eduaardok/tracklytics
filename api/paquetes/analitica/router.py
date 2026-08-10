import asyncio
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Path, Query

from core.cache import cached
from core.database import query_one, query_rows
from paquetes.analitica.bsc import bsc_resumen
from paquetes.analitica.deps import require_b2b_panel_access, require_staff, require_tier
from paquetes.analitica.proyeccion import clasificar_trayectoria, proyectar_serie
from paquetes.analitica.queries import (
    ADQUISICION_POR_CANAL,
    ARTIST_AUDIO_STATS_V1, ARTIST_PREDOMINANT_GENRE, ARTIST_STATS,
    ARTIST_WEEKLY_POPULARITY,
    ARTISTAS_SEARCH_V1, ARTISTS_SEARCH, ARTISTS_SEARCH_TOTAL,
    BAJAS_ANTES_DE,
    CANCELACIONES_POR_MES, CANCELACIONES_POR_MES_Y_MOTIVO,
    DASHBOARD_AUDIO_AVG, DASHBOARD_ENGAGEMENT_POR_GENERO, DASHBOARD_EXPLICIT_DIST,
    DASHBOARD_INGRESOS_PUBLICITARIOS_DIARIO, DASHBOARD_INGRESOS_SUSCRIPCION_DIARIO,
    DASHBOARD_KPIS, DASHBOARD_LAST_ETL, DASHBOARD_REGALIAS_PAGADAS_DIARIO,
    DASHBOARD_TOP_ARTISTS, DASHBOARD_TOP_GENRES,
    DASHBOARD_TOTAL_ARTISTS, DASHBOARD_TOTAL_GENRES, DASHBOARD_TOTAL_TRACKS,
    DISPONIBILIDAD_POR_COMPONENTE,
    ENGAGEMENT_BY_ARTIST, ENGAGEMENT_BY_FACT,
    GENRE_AUDIO_PROFILE, GENRE_AUDIO_PROFILE_V1, GENRE_WEEKLY_POPULARITY,
    GENRES_TOTAL, GENRES_TRENDS,
    INGRESO_MENSUAL_RECURRENTE_HISTORICO, INGRESO_PUBLICITARIO_EN_RANGO, INGRESO_SUSCRIPCIONES_EN_RANGO,
    REGALIAS_PAGADAS_EN_RANGO,
    REPORTE_DIARIO_ENGAGEMENT, REPORTE_DIARIO_INGESTAS,
    TENDENCIAS_LOAD_WEEK, TRACK_POPULARITY, TRENDS_WEEKLY,
    USUARIOS_CON_IMPRESION_EN_RANGO,
)
# Cross-package import de la query ya usada por `distribucion` — se reusa
# verbatim en vez de duplicarla; router.py ya importa cruzado de
# `paquetes.suscripciones` (pb_client) más abajo, mismo patrón ya establecido.
from paquetes.distribucion.queries import RESTRICCIONES_POR_PAIS
from paquetes.suscripciones import pb_client

# Planes de pago, B2C y B2B (monetizacion-retencion-mejoras) — mismos ids que
# `paquetes.suscripciones.planes.PLANES` con precio > 0; "free" queda fuera
# porque no es un plan pago que pueda hacer churn.
PLANES_DE_PAGO = ("premium", "estudiante", "basico", "pro", "enterprise")
# Subconjunto B2C de conversión (funnel free → premium) — los tiers B2B no
# participan del funnel de conversión free→premium.
PLANES_PAGO_B2C = ("premium", "estudiante")


def _meses_entre(desde: date, hasta: date) -> list[date]:
    """Lista de meses (día 1) entre `desde` y `hasta`, ambos inclusive por mes."""
    meses = []
    cursor = date(desde.year, desde.month, 1)
    fin = date(hasta.year, hasta.month, 1)
    while cursor <= fin:
        meses.append(cursor)
        year, month = (cursor.year + 1, 1) if cursor.month == 12 else (cursor.year, cursor.month + 1)
        cursor = date(year, month, 1)
    return meses

router = APIRouter(tags=["Analytics"], dependencies=[Depends(require_b2b_panel_access)])


# Grupos de plan para la serie de altas por semana del dashboard — 6 planes
# individuales (free/premium/estudiante/basico/pro/enterprise) sobre ~66
# suscripciones totales dan 1-2 altas por semana por plan (demasiado ruido
# para una serie apilada legible); se agrupan en 3 series de negocio
# (free / b2c de pago / b2b) que comparten la paleta categórica de 3 tonos ya
# validada y usada en el resto del proyecto (shared/components/charts/colors.ts).
GRUPOS_PLAN: dict[str, tuple[str, ...]] = {
    "free":      ("free",),
    "b2c_pago":  ("premium", "estudiante"),
    "b2b":       ("basico", "pro", "enterprise"),
}


def _lunes(d: date) -> date:
    return d - timedelta(days=d.weekday())


async def _altas_por_semana_y_grupo(semanas: int = 6) -> list[dict]:
    """Altas de suscripción (cualquier estado, cualquier momento) por semana
    (lunes a lunes) y grupo de plan, para las últimas `semanas` semanas
    completas — ventana fija en vez de resolver la fecha de la primera alta
    contra PocketBase, porque cubre con margen el rango real de datos
    (~3.5 semanas verificado con clickhouse-client) sin un round-trip extra."""
    hoy = date.today()
    lunes_actual = _lunes(hoy)
    lunes_semanas = [lunes_actual - timedelta(weeks=i) for i in range(semanas - 1, -1, -1)]

    async def _celda(lunes: date, tipos_plan: tuple[str, ...]) -> int:
        desde = datetime.combine(lunes, datetime.min.time())
        hasta = desde + timedelta(days=7)
        return await pb_client.contar_altas_en_rango(desde, hasta, tipos_plan)

    tareas = [
        _celda(lunes, tipos_plan)
        for lunes in lunes_semanas
        for tipos_plan in GRUPOS_PLAN.values()
    ]
    resultados = await asyncio.gather(*tareas)

    filas = []
    it = iter(resultados)
    for lunes in lunes_semanas:
        fila = {"semana": lunes.isoformat()}
        for grupo in GRUPOS_PLAN:
            fila[grupo] = next(it)
        filas.append(fila)
    return filas


def _serie_ingresos_vs_regalias() -> list[dict]:
    """Merge por día de las 3 FACT tables de ingresos/regalías (rangos de
    fecha distintos entre sí) en una sola serie con las 3 claves siempre
    presentes (0 si ese día no tuvo movimiento en esa fuente) — así el
    stacked area del frontend no tiene que manejar `undefined`."""
    suscripciones = {r["dia"].isoformat(): float(r["monto"]) for r in query_rows(DASHBOARD_INGRESOS_SUSCRIPCION_DIARIO)}
    publicidad    = {r["dia"].isoformat(): float(r["monto"]) for r in query_rows(DASHBOARD_INGRESOS_PUBLICITARIOS_DIARIO)}
    regalias      = {r["dia"].isoformat(): float(r["monto"]) for r in query_rows(DASHBOARD_REGALIAS_PAGADAS_DIARIO)}

    dias = sorted(set(suscripciones) | set(publicidad) | set(regalias))
    return [
        {
            "dia": d,
            "ingresos_suscripciones": round(suscripciones.get(d, 0.0), 2),
            "ingresos_publicidad":    round(publicidad.get(d, 0.0), 2),
            "regalias_pagadas":       round(regalias.get(d, 0.0), 2),
        }
        for d in dias
    ]


@router.get("/dashboard/executive", tags=["Dashboard"])
@cached(ttl=60)
async def dashboard_executive():
    return {
        "totals": {
            "tracks":  query_one(DASHBOARD_TOTAL_TRACKS)["n"],
            "artists": query_one(DASHBOARD_TOTAL_ARTISTS)["n"],
            "genres":  query_one(DASHBOARD_TOTAL_GENRES)["n"],
        },
        "audio_averages":        query_one(DASHBOARD_AUDIO_AVG),
        "top_genres":            query_rows(DASHBOARD_TOP_GENRES),
        "top_artists":           query_rows(DASHBOARD_TOP_ARTISTS),
        "last_etl":              query_one(DASHBOARD_LAST_ETL),
        "explicit_distribution": query_rows(DASHBOARD_EXPLICIT_DIST),
        "ingresos_vs_regalias":  _serie_ingresos_vs_regalias(),
        "altas_por_plan_semana": await _altas_por_semana_y_grupo(),
        "engagement_por_genero": query_rows(DASHBOARD_ENGAGEMENT_POR_GENERO),
        "reproducciones_bloqueadas_por_pais": query_rows(RESTRICCIONES_POR_PAIS),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Endpoints legacy consumidos por app/analytics/*.html (genres.html,
# trends.html, dashboard.html, compare-artists.html) — las queries ya
# existían en queries.py pero nunca se habían montado en el router,
# dejando esas pantallas rotas (CU-O07/08/09/10, auditoría 2026-07-09).
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/genres/trends", tags=["Dashboard"])
def genres_trends(limit: int = Query(20, ge=1, le=200), page: int = Query(1, ge=1)):
    offset = (page - 1) * limit
    rows   = query_rows(GENRES_TRENDS, {"limit": limit, "offset": offset})
    total  = query_one(GENRES_TOTAL)["n"]
    return {"data": rows, "total": total, "page": page, "limit": limit}


@router.get("/genres/{genre_id}/audio-profile", tags=["Dashboard"])
def genre_audio_profile_legacy(genre_id: int = Path(..., ge=1)):
    row = query_one(GENRE_AUDIO_PROFILE, {"genre_id": genre_id})
    if not row:
        raise HTTPException(status_code=404, detail="Género no encontrado")
    return row


@router.get("/trends/weekly", tags=["Dashboard"])
def trends_weekly():
    return {"data": query_rows(TRENDS_WEEKLY)}


@router.get("/artists/search", tags=["Dashboard"])
def artists_search_legacy(
    name:  str = Query(..., min_length=1),
    limit: int = Query(8, ge=1, le=50),
    page:  int = Query(1, ge=1),
):
    offset  = (page - 1) * limit
    pattern = f"%{name.strip()}%"
    rows    = query_rows(ARTISTS_SEARCH, {"pattern": pattern, "limit": limit, "offset": offset})
    total   = query_one(ARTISTS_SEARCH_TOTAL, {"pattern": pattern})["n"]
    return {"data": rows, "total": total, "page": page, "limit": limit}


@router.get("/artists/{artist_id}/stats", tags=["Dashboard"])
def artist_stats_legacy(artist_id: int = Path(..., ge=1)):
    row = query_one(ARTIST_STATS, {"artist_id": artist_id})
    if not row:
        raise HTTPException(status_code=404, detail="Artista no encontrado")
    return row


# ─────────────────────────────────────────────────────────────────────────────
# OpenSpec `analitica` v1 — endpoints bajo /app/v1/analitica/* (tasks.md)
# ─────────────────────────────────────────────────────────────────────────────

v1_router = APIRouter(
    prefix="/app/v1/analitica",
    tags=["Analitica v1"],
    dependencies=[Depends(require_b2b_panel_access)],
)


@v1_router.get("/dashboard")
@cached(ttl=60)
def v1_dashboard():
    """RF-ANA-001: KPIs agregados del catálogo en una sola pantalla."""
    return query_one(DASHBOARD_KPIS)


@v1_router.get("/generos/{genero_id}/perfil")
def v1_genero_perfil(genero_id: int = Path(..., ge=1)):
    """RF-ANA-002: perfil de audio (7 atributos) de un género."""
    row = query_one(GENRE_AUDIO_PROFILE_V1, {"genre_id": genero_id})
    if not row:
        raise HTTPException(status_code=404, detail="Género no encontrado")
    return row


def _artist_or_404(artist_id: int) -> dict:
    row = query_one(ARTIST_AUDIO_STATS_V1, {"artist_id": artist_id})
    if not row:
        raise HTTPException(status_code=404, detail=f"Artista {artist_id} no encontrado")
    return row


@v1_router.get("/artistas/search")
def v1_artistas_search(
    nombre: str = Query(..., min_length=1),
    limit:  int = Query(8,  ge=1, le=100),
):
    """Búsqueda de artistas por nombre parcial, case-insensitive. Cero coincidencias → 200 + [].

    Tier Básico (b2b-tier-access-analitica): su único consumidor real es
    `EngagementPage.tsx` (buscar un artista para ver su engagement, feature
    Básico) — las páginas de comparación/benchmark usan el `ArtistPicker`
    compartido, que golpea un endpoint legacy distinto sin este dependency.
    Gatearlo a Pro habría bloqueado la búsqueda de un feature Básico sin
    ganar nada (design.md, decisión 2, corregida tras verificar el consumidor
    real en el frontend)."""
    rows = query_rows(ARTISTAS_SEARCH_V1, {"pattern": f"%{nombre}%", "limit": limit})
    return {"data": rows, "total": len(rows), "limit": limit}


@v1_router.get("/artistas/comparar", dependencies=[Depends(require_tier("pro"))])
def v1_artistas_comparar(
    artista_a: int = Query(..., ge=1),
    artista_b: int = Query(..., ge=1),
):
    """RF-ANA-003: comparación lado a lado de dos artistas. Tier Pro (b2b-tier-access-analitica)."""
    return {"artista_a": _artist_or_404(artista_a), "artista_b": _artist_or_404(artista_b)}


@v1_router.get("/artistas/{artist_id}/benchmark", dependencies=[Depends(require_tier("pro"))])
def v1_artista_benchmark(artist_id: int = Path(..., ge=1)):
    """RF-ANA-004 / RN-ANA-002: artista vs. promedio simple de su género
    predominante (sin excluir outliers)."""
    artist = _artist_or_404(artist_id)

    predominant = query_one(ARTIST_PREDOMINANT_GENRE, {"artist_id": artist_id})
    if not predominant:
        raise HTTPException(status_code=404, detail="El artista no tiene tracks registrados")

    genre = query_one(GENRE_AUDIO_PROFILE_V1, {"genre_id": predominant["genre_id"]})
    return {"artista": artist, "genero_benchmark": genre}


@v1_router.get("/tendencias")
def v1_tendencias(
    semana_desde: int | None = Query(None, ge=1),
    semana_hasta: int | None = Query(None, ge=1),
):
    """RF-ANA-005: serie temporal de popularidad/energy por `load_week`."""
    if semana_desde is not None and semana_hasta is not None and semana_desde > semana_hasta:
        raise HTTPException(
            status_code=422,
            detail="semana_desde no puede ser mayor que semana_hasta",
        )

    params: dict = {}
    where = ""
    if semana_desde is not None and semana_hasta is not None:
        where = "WHERE load_week BETWEEN {semana_desde:UInt8} AND {semana_hasta:UInt8}"
        params = {"semana_desde": semana_desde, "semana_hasta": semana_hasta}

    rows = query_rows(TENDENCIAS_LOAD_WEEK.format(where=where), params)
    return {"data": rows}


@v1_router.get("/adquisicion", dependencies=[Depends(require_tier("pro"))])
def v1_adquisicion():
    """CU-O54: usuarios nuevos por canal de marketing y semana. Tier Pro (b2b-tier-access-analitica)."""
    return {"data": query_rows(ADQUISICION_POR_CANAL)}


@v1_router.get("/disponibilidad")
def v1_disponibilidad():
    """CU-O55: % de disponibilidad por componente de infraestructura y semana.
    No confundir con la restricción geográfica de reproducción de `distribucion`."""
    return {"data": query_rows(DISPONIBILIDAD_POR_COMPONENTE)}


@v1_router.get("/engagement")
def v1_engagement(
    fact_id:   int | None = Query(None, ge=1),
    artist_id: int | None = Query(None, ge=1),
):
    """RF-ANA-006: engagement_score normalizado (0-100) por track o artista."""
    if (fact_id is None) == (artist_id is None):
        raise HTTPException(
            status_code=422,
            detail="Debe especificarse exactamente uno de: fact_id, artist_id",
        )

    if fact_id is not None:
        row = query_one(ENGAGEMENT_BY_FACT, {"fact_id": fact_id})
        return {"fact_id": fact_id, **row}

    row = query_one(ENGAGEMENT_BY_ARTIST, {"artist_id": artist_id})
    return {"artist_id": artist_id, **row}


@v1_router.get("/desempeno-relativo", dependencies=[Depends(require_tier("pro"))])
def v1_desempeno_relativo(fact_id: int = Query(..., ge=1)):
    """RF-ANA-007 / RN-ANA-001: engagement_score / popularity para un track
    con al menos una interacción registrada ("Mercado vs. Tracklytics").
    Tier Pro (b2b-tier-access-analitica)."""
    track = query_one(TRACK_POPULARITY, {"fact_id": fact_id})
    if not track:
        raise HTTPException(status_code=404, detail=f"fact_id {fact_id} no encontrado")

    engagement = query_one(ENGAGEMENT_BY_FACT, {"fact_id": fact_id})
    if not engagement or engagement["raw_score"] == 0:
        return {
            "fact_id": fact_id,
            "suficiente": False,
            "mensaje": "Datos de engagement insuficientes para calcular el índice de desempeño relativo",
        }

    popularity = track["popularity"]
    indice = round(engagement["engagement_score"] / popularity, 4) if popularity else None

    return {
        "fact_id":           fact_id,
        "track_name":        track["track_name"],
        "artist_name":       track["artist_name"],
        "suficiente":        True,
        "popularity":        popularity,
        "engagement_score":  engagement["engagement_score"],
        "indice_desempeno":  indice,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Paneles predictivos/estratégicos — exclusivos Enterprise (b2b-tier-access-
# analitica, CU-O92/CU-O93). Proyección estadística simple (regresión lineal,
# ver proyeccion.py), nunca un modelo de ML — se presenta como "proyección"/
# "tendencia estimada" al cliente B2B, jamás como predicción de IA.
# ─────────────────────────────────────────────────────────────────────────────

@v1_router.get("/generos/{genero_id}/proyeccion", dependencies=[Depends(require_tier("enterprise"))])
def v1_genero_proyeccion(genero_id: int = Path(..., ge=1)):
    """CU-O92: proyección de tendencia de popularidad de un género, extrapolada
    sobre su serie semanal histórica."""
    rows = query_rows(GENRE_WEEKLY_POPULARITY, {"genre_id": genero_id})
    if not rows:
        raise HTTPException(status_code=404, detail="Género sin tracks registrados")

    semanas = [r["load_week"] for r in rows]
    valores = [r["avg_popularity"] for r in rows]
    resultado = proyectar_serie(semanas, valores)
    return {"genero_id": genero_id, "serie_historica": rows, **resultado}


@v1_router.get("/artistas/{artist_id}/proyeccion", dependencies=[Depends(require_tier("enterprise"))])
def v1_artista_proyeccion(artist_id: int = Path(..., ge=1)):
    """CU-O93: proyección de trayectoria de un artista vs. su género
    predominante — ¿gana o pierde tracción relativa al género?"""
    rows = query_rows(ARTIST_WEEKLY_POPULARITY, {"artist_id": artist_id})
    if not rows:
        raise HTTPException(status_code=404, detail="Artista sin tracks registrados")

    predominant = query_one(ARTIST_PREDOMINANT_GENRE, {"artist_id": artist_id})
    if not predominant:
        raise HTTPException(status_code=404, detail="El artista no tiene tracks registrados")

    semanas = [r["load_week"] for r in rows]
    valores = [r["avg_popularity"] for r in rows]
    proyeccion_artista = proyectar_serie(semanas, valores)

    genero_rows = query_rows(GENRE_WEEKLY_POPULARITY, {"genre_id": predominant["genre_id"]})
    genero_semanas = [r["load_week"] for r in genero_rows]
    genero_valores = [r["avg_popularity"] for r in genero_rows]
    proyeccion_genero = proyectar_serie(genero_semanas, genero_valores)

    trayectoria = None
    if proyeccion_artista["suficiente"] and proyeccion_genero["suficiente"]:
        trayectoria = clasificar_trayectoria(
            proyeccion_artista["pendiente_semanal"], proyeccion_genero["pendiente_semanal"],
        )

    return {
        "artist_id":            artist_id,
        "genero_id":            predominant["genre_id"],
        "serie_historica":      rows,
        "proyeccion_artista":   proyeccion_artista,
        "proyeccion_genero":    proyeccion_genero,
        "trayectoria":          trayectoria,
    }


@v1_router.get("/reporte-diario", dependencies=[Depends(require_staff)])
def v1_reporte_diario(fecha: date | None = Query(None)):
    """RF-ANA-008: reporte diario operativo (CU-O16, Data Analyst/BI Lead).

    Agrega ingestas (ETL_LOGS) y actividad de engagement del día corriente.
    No incluye suscripciones ni adquisiciones: FACT_SUSCRIPCION y
    FACT_ADQUISICION no existen en el esquema ClickHouse actual (ver
    decisiones de diseño de la implementación) — esta capability no inventa
    ni acopla una fuente de datos que no está desplegada.
    """
    fecha = fecha or date.today()
    ingestas   = query_one(REPORTE_DIARIO_INGESTAS, {"fecha": fecha}) or {}
    engagement = query_rows(REPORTE_DIARIO_ENGAGEMENT, {"fecha": fecha})

    return {
        "fecha": fecha.isoformat(),
        "ingestas": {
            "corridas":          ingestas.get("corridas", 0),
            "records_read":      ingestas.get("records_read", 0),
            "records_inserted":  ingestas.get("records_inserted", 0),
            "records_rejected":  ingestas.get("records_rejected", 0),
            "statuses":          ingestas.get("statuses", []),
        },
        "engagement_por_tipo": engagement,
        "suscripciones": None,
        "adquisiciones": None,
        "nota": (
            "Pendiente táctico: métricas de suscripciones (altas, bajas, churn) "
            "y adquisiciones no se incluyen aún — requieren el ETL de suscripciones "
            "PocketBase → ClickHouse, previsto para la capa táctica."
        ),
    }


@v1_router.get("/churn", dependencies=[Depends(require_staff)])
async def v1_churn(
    desde: date = Query(...),
    hasta: date = Query(...),
    por_motivo: bool = Query(False),
):
    """Tasa de churn mensual (monetizacion-retencion-mejoras, Lead Data
    Engineer/CTO). `activas_al_inicio(mes)` se aproxima como altas antes del
    mes (PocketBase) menos bajas antes del mes (FACT_CANCELACION_SUSCRIPCION)
    — exacto desde el despliegue de esta métrica en adelante, ver design.md
    decisión 5."""
    if desde > hasta:
        raise HTTPException(status_code=422, detail="desde no puede ser mayor que hasta")

    meses = _meses_entre(desde, hasta)
    rango_desde = datetime.combine(meses[0], datetime.min.time())
    rango_hasta = datetime.combine(hasta, datetime.min.time()) + timedelta(days=1)

    if por_motivo:
        filas = query_rows(CANCELACIONES_POR_MES_Y_MOTIVO, {"desde": rango_desde, "hasta": rango_hasta})
        cancelaciones_por_mes: dict[str, dict[str, int]] = {}
        for fila in filas:
            clave = fila["mes"].isoformat() if hasattr(fila["mes"], "isoformat") else str(fila["mes"])
            cancelaciones_por_mes.setdefault(clave, {})[fila["motivo"]] = fila["cancelaciones"]
    else:
        filas = query_rows(CANCELACIONES_POR_MES, {"desde": rango_desde, "hasta": rango_hasta})
        cancelaciones_totales: dict[str, int] = {
            (f["mes"].isoformat() if hasattr(f["mes"], "isoformat") else str(f["mes"])): f["cancelaciones"]
            for f in filas
        }

    resultado = []
    for mes in meses:
        inicio_mes = datetime.combine(mes, datetime.min.time())
        altas = await pb_client.contar_altas_antes_de(inicio_mes, PLANES_DE_PAGO)
        bajas = (query_one(BAJAS_ANTES_DE, {"fecha": inicio_mes}) or {}).get("n", 0)
        activas_al_inicio = max(altas - bajas, 0)

        clave = mes.isoformat()
        if por_motivo:
            por_motivo_mes = cancelaciones_por_mes.get(clave, {})
            cancelaciones_mes = sum(por_motivo_mes.values())
        else:
            cancelaciones_mes = cancelaciones_totales.get(clave, 0)

        tasa = round(cancelaciones_mes / activas_al_inicio, 4) if activas_al_inicio else None

        fila_resultado = {
            "mes":               clave,
            "cancelaciones":     cancelaciones_mes,
            "activas_al_inicio": activas_al_inicio,
            "tasa_churn":        tasa,
        }
        if por_motivo:
            fila_resultado["por_motivo"] = por_motivo_mes
        resultado.append(fila_resultado)

    return {
        "data": resultado,
        "nota": (
            "La tasa de churn es precisa desde el despliegue de esta métrica en "
            "adelante; meses anteriores pueden sobreestimar activas_al_inicio "
            "porque las cancelaciones previas a este cambio no quedaron "
            "registradas con fecha."
        ),
    }


def _rango_dt(desde: date, hasta: date) -> tuple[datetime, datetime]:
    if desde > hasta:
        raise HTTPException(status_code=422, detail="desde no puede ser mayor que hasta")
    return datetime.combine(desde, datetime.min.time()), datetime.combine(hasta, datetime.min.time()) + timedelta(days=1)


@v1_router.get("/funnel-conversion", dependencies=[Depends(require_staff)])
async def v1_funnel_conversion(desde: date = Query(...), hasta: date = Query(...)):
    """Funnel free → vio anuncio → se suscribió (monetizacion-retencion-
    mejoras, Lead Data Engineer/CTO). `vieron_anuncio` cubre audio y display
    sin distinguir tipo (RF: "vio al menos un anuncio")."""
    rango_desde, rango_hasta = _rango_dt(desde, hasta)

    free_activos = await pb_client.contar_activas("free")
    vieron_anuncio = (
        query_one(USUARIOS_CON_IMPRESION_EN_RANGO, {"desde": rango_desde, "hasta": rango_hasta}) or {}
    ).get("n", 0)
    se_suscribieron = await pb_client.contar_altas_en_rango(rango_desde, rango_hasta, PLANES_PAGO_B2C)

    return {
        "free_activos":    free_activos,
        "vieron_anuncio":  vieron_anuncio,
        "se_suscribieron": se_suscribieron,
    }


@v1_router.get("/pnl", dependencies=[Depends(require_staff)])
def v1_pnl(desde: date = Query(...), hasta: date = Query(...)):
    """P&L consolidado (monetizacion-retencion-mejoras, Lead Data Engineer/
    CTO): ingreso por suscripciones + ingreso publicitario − regalías
    pagadas = margen neto, agregado sobre tablas ya existentes de
    facturacion/publicidad/regalias."""
    rango_desde, rango_hasta = _rango_dt(desde, hasta)
    params = {"desde": rango_desde, "hasta": rango_hasta}

    ingreso_suscripciones = float((query_one(INGRESO_SUSCRIPCIONES_EN_RANGO, params) or {}).get("total") or 0)
    ingreso_publicitario  = float((query_one(INGRESO_PUBLICITARIO_EN_RANGO,  params) or {}).get("total") or 0)
    regalias_pagadas      = float((query_one(REGALIAS_PAGADAS_EN_RANGO,      params) or {}).get("total") or 0)

    return {
        "ingreso_suscripciones": round(ingreso_suscripciones, 2),
        "ingreso_publicitario":  round(ingreso_publicitario, 2),
        "regalias_pagadas":      round(regalias_pagadas, 2),
        "margen_neto":           round(ingreso_suscripciones + ingreso_publicitario - regalias_pagadas, 2),
    }


@v1_router.get("/mrr-arr", dependencies=[Depends(require_staff)])
async def v1_mrr_arr(desde: date = Query(...), hasta: date = Query(...)):
    """MRR/ARR (modelo-financiero-simulacion, Lead Data Engineer/CTO): MRR es
    el ingreso mensual recurrente actual (suma de `monto` de suscripciones de
    pago activas en PocketBase, fuente de verdad en tiempo real — no un
    agregado histórico de ClickHouse). ARR = MRR × 12. La tendencia por mes
    es una aproximación (ingreso cobrado, no MRR reconstruido
    punto-en-el-tiempo, ver design.md decisión 7)."""
    rango_desde, rango_hasta = _rango_dt(desde, hasta)

    mrr = await pb_client.sumar_montos_activos(PLANES_DE_PAGO)
    tendencia = query_rows(INGRESO_MENSUAL_RECURRENTE_HISTORICO, {"desde": rango_desde, "hasta": rango_hasta})

    return {
        "mrr": round(mrr, 2),
        "arr": round(mrr * 12, 2),
        "tendencia_mensual": tendencia,
        "nota": (
            "MRR es el ingreso recurrente activo en este momento (suscripciones de pago activas). "
            "La tendencia mensual aproxima el ingreso recurrente con lo efectivamente cobrado cada "
            "mes, no una reconstrucción de MRR punto-en-el-tiempo."
        ),
    }


@v1_router.get("/bsc/resumen", dependencies=[Depends(require_staff)], tags=["BSC"])
@cached(ttl=300)
def v1_bsc_resumen():
    """Balanced Scorecard estratégico (S14-FINAL, Fase 6, CU-E01..CU-E07):
    4 perspectivas × 2 KPIs cada una, calculados desde Gold real (ver
    `paquetes.analitica.bsc`). `require_staff`, mismo gate que
    reporte-diario/churn/funnel-conversion/pnl/mrr-arr — todos herramientas
    estratégicas de staff interno, no paneles de cliente B2B (analyst no
    entra, mismo criterio ya establecido para esos 5 endpoints)."""
    return bsc_resumen()
