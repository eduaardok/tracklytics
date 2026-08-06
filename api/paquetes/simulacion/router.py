from datetime import date, datetime, timedelta

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core.config import AIRFLOW_PASS, AIRFLOW_URL, AIRFLOW_USER
from core.database import query_rows
from core.database_gold import query_rows_gold
from paquetes.regalias.router import liquidar_periodo_interno
from paquetes.seguridad.deps import require_admin, require_rol_admin
from paquetes.simulacion.generador import (
    generar_impresiones_publicitarias,
    generar_reproducciones,
    generar_suscripciones,
)

router = APIRouter(prefix="/app/v1/simulacion", tags=["Simulacion"], dependencies=[Depends(require_admin)])

# S14-P4, Fase 5: generación bajo demanda con relleno de huecos + refresco de
# Gold encadenado — capability distinta en alcance del `generar-actividad`
# original (CU-O78, "última hora"), así que va en un router propio dentro
# del mismo paquete en vez de forzarlo al contrato existente. Gateado por
# `admin_datos` (superadmin también pasa siempre, ver `require_rol_admin`) —
# más permisivo que `require_admin` (superadmin-only) del router de arriba,
# a propósito: es un panel operativo de Lead Data Engineer, no exclusivo del
# CTO. Panel interno únicamente (`SimulacionPage`) — nada de esto se expone
# en superficies de negocio.
router_bajo_demanda = APIRouter(
    prefix="/app/v1/simulacion", tags=["Simulacion"], dependencies=[Depends(require_rol_admin("admin_datos"))],
)

DOMINIOS_BAJO_DEMANDA = (
    "usuarios", "gasto_marketing", "publicidad", "engagement", "regalias",
    "disponibilidad", "api_partners", "comunidad", "denuncias_tickets", "producto",
)
DAG_BAJO_DEMANDA = "dag_generar_bajo_demanda"
DAG_GOLD = "dag_gold_aggregations"


class GenerarHistoricoBody(BaseModel):
    periodo_inicio: date
    periodo_fin: date
    dominios: list[str] | None = None  # None = los 10 dominios soportados


async def _airflow_dag_activo(dag_id: str) -> bool:
    """Mismo criterio que `gestion_datos/router.py::_airflow_has_active_run`
    (filtra por estado directo en la API, no ordena por start_date — un
    dagRun 'queued' todavía no lo tiene)."""
    url = f"{AIRFLOW_URL}/api/v1/dags/{dag_id}/dagRuns"
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            url, params=[("state", "queued"), ("state", "running"), ("limit", 10)],
            auth=(AIRFLOW_USER, AIRFLOW_PASS),
        )
    resp.raise_for_status()
    return len(resp.json().get("dag_runs", [])) > 0


@router_bajo_demanda.post("/generar-historico", status_code=202)
async def generar_historico(body: GenerarHistoricoBody):
    """Dispara `dag_generar_bajo_demanda`: genera actividad de negocio para
    el rango pedido RELLENANDO HUECOS (períodos sin datos dentro de la
    ventana, no solo agregando al final — idempotente por dominio+mes vía
    `ETL_BATCH_CONTROL`, ver `gold.backfill_negocio.generar_actividad_rango`)
    y, encadenado, refresca la capa Gold completa (`dag_gold_aggregations`,
    60 tareas) para que los 30 informes compuestos reflejen lo nuevo."""
    if body.periodo_fin <= body.periodo_inicio:
        raise HTTPException(status_code=422, detail="periodo_fin debe ser posterior a periodo_inicio")
    dominios = body.dominios or list(DOMINIOS_BAJO_DEMANDA)
    invalidos = [d for d in dominios if d not in DOMINIOS_BAJO_DEMANDA]
    if invalidos:
        raise HTTPException(
            status_code=422,
            detail=f"Dominios no soportados: {invalidos}. Soportados: {list(DOMINIOS_BAJO_DEMANDA)}",
        )

    try:
        if await _airflow_dag_activo(DAG_BAJO_DEMANDA):
            raise HTTPException(status_code=409, detail="Ya hay una generación en curso. Espere a que finalice.")
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"No se pudo contactar Airflow: {exc}")

    payload = {"conf": {
        "dominios": dominios,
        "periodo_inicio": body.periodo_inicio.isoformat(),
        "periodo_fin": body.periodo_fin.isoformat(),
    }}
    url = f"{AIRFLOW_URL}/api/v1/dags/{DAG_BAJO_DEMANDA}/dagRuns"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url, json=payload, auth=(AIRFLOW_USER, AIRFLOW_PASS))
        if resp.status_code not in (200, 201):
            raise HTTPException(status_code=resp.status_code, detail=f"Error de Airflow: {resp.text}")
        airflow_data = resp.json()
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"No se pudo contactar Airflow: {exc}")

    return {
        "status": "disparado", "ejecucion_id": airflow_data.get("dag_run_id"),
        "dominios": dominios, "periodo_inicio": str(body.periodo_inicio), "periodo_fin": str(body.periodo_fin),
    }


@router_bajo_demanda.get("/estado")
async def estado_generacion():
    """Estado visible (Fase 5, "sin esto el botón es un acto de fe"): qué se
    generó y cuándo por dominio de negocio, cuándo corrió por última vez
    cada tabla Gold (y con qué resultado), y si hay una ejecución en curso
    ahora mismo."""
    dominios_negocio = query_rows(
        "SELECT checksum, max(loaded_at) AS ultima_corrida, sum(record_count) AS total_filas, count() AS corridas "
        "FROM ETL_BATCH_CONTROL WHERE checksum LIKE 'backfill_negocio:%' GROUP BY checksum ORDER BY ultima_corrida DESC"
    )
    tablas_gold = query_rows_gold(
        "SELECT tabla, granularidad, max(ejecutado_en) AS ultima_corrida, "
        "argMax(estado, ejecutado_en) AS ultimo_estado "
        "FROM GOLD_ETL_LOG GROUP BY tabla, granularidad ORDER BY tabla, granularidad"
    )
    try:
        en_curso = await _airflow_dag_activo(DAG_BAJO_DEMANDA) or await _airflow_dag_activo(DAG_GOLD)
    except httpx.RequestError:
        en_curso = None  # Airflow no responde -- no se sabe, no se asume "no".

    return {"dominios_negocio": dominios_negocio, "tablas_gold": tablas_gold, "ejecucion_en_curso": en_curso}

# Defaults sensatos (CU-O78): suficiente streams para ponderar el reparto
# entre varios tracks, y suscripciones/impresiones suficientes para que el
# pool de liquidación tenga un monto real que no sea trivial.
N_STREAMS_DEFAULT = 5000
N_SUSCRIPCIONES_DEFAULT = 50
N_IMPRESIONES_DEFAULT = 200


class GenerarActividadBody(BaseModel):
    n_streams: int = N_STREAMS_DEFAULT
    n_suscripciones: int = N_SUSCRIPCIONES_DEFAULT
    n_impresiones: int = N_IMPRESIONES_DEFAULT


@router.post("/generar-actividad", status_code=201)
def generar_actividad(body: GenerarActividadBody):
    """CU-O78: genera streams + suscripciones + impresiones publicitarias en
    la misma ventana de tiempo reciente, y liquida automáticamente el
    período resultante — ver design.md, Decisión 1: los streams solos no
    generan dinero, el pool sale de suscripciones + publicidad."""
    ahora = datetime.utcnow()

    streams_generados = generar_reproducciones(body.n_streams, ahora)
    ingreso_suscripciones = generar_suscripciones(body.n_suscripciones, ahora)
    ingreso_publicitario = generar_impresiones_publicitarias(body.n_impresiones, ahora)

    # Liquidación diaria (mismo grano que el resto de `regalias`, que opera
    # en `date`, no en `datetime`) — cubre todo lo generado en esta corrida.
    # Si ya se simuló actividad hoy, la liquidación de este período ya
    # corrió antes (idempotencia, ver design.md decisión 4): el ingreso
    # nuevo queda igual reflejado en P&L/MRR (leen las tablas de ingreso
    # directamente), pero no se vuelve a repartir a rightsholders hasta el
    # día siguiente.
    hoy = ahora.date()
    resultado_liquidacion = liquidar_periodo_interno(hoy, hoy + timedelta(days=1))

    return {
        "status": "ok",
        "streams_generados": streams_generados,
        "ingreso_suscripciones_generado": ingreso_suscripciones,
        "ingreso_publicitario_generado": ingreso_publicitario,
        "liquidacion": resultado_liquidacion,
    }
