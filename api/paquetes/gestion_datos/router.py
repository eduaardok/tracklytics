import asyncio
from typing import Any, Literal, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from core.config import (
    AIRFLOW_DAG, AIRFLOW_PASS, AIRFLOW_URL, AIRFLOW_USER, CH_DB, DIM_FK_COLUMN, DIM_TABLES,
)
from core.database import execute, get_client, query_one, query_rows
from paquetes.gestion_datos.deps import require_lead_data_engineer
from paquetes.gestion_datos.queries import (
    ETL_LOGS, ETL_LOGS_TOTAL, ETL_STATUS_LAST,
    DATA_QUALITY_COUNTS, DATA_QUALITY_REJECTION, DATA_QUALITY_LAST_LOAD,
    CARGAS_HISTORIAL, CARGAS_ULTIMA, ETL_BATCH_EXISTS,
    dim_fk_references_sql, dim_list_sql, dim_list_total_sql, dim_pk_sql, dim_str_cols_sql,
    facts_list_sql,
)

router = APIRouter(tags=["Data Management"], dependencies=[Depends(require_lead_data_engineer)])


class ETLTriggerRequest(BaseModel):
    week_number: int


class DimRecord(BaseModel):
    data: dict[str, Any]


# ── Health ────────────────────────────────────────────────────────────────────

@router.get("/health", tags=["System"])
def health():
    try:
        client = get_client()
        client.command("SELECT 1")
        return {"status": "ok", "clickhouse": "reachable"}
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"ClickHouse unreachable: {exc}")


# ── ETL ───────────────────────────────────────────────────────────────────────

@router.get("/etl/logs", tags=["ETL"])
def etl_logs(
    page:  int = Query(1,  ge=1),
    limit: int = Query(20, ge=1, le=200),
):
    offset = (page - 1) * limit
    rows   = query_rows(ETL_LOGS, {"limit": limit, "offset": offset})
    total  = query_one(ETL_LOGS_TOTAL)["n"]
    return {"data": rows, "page": page, "limit": limit, "total": total}


@router.get("/etl/status", tags=["ETL"])
def etl_status():
    row = query_one(ETL_STATUS_LAST)
    if not row:
        raise HTTPException(status_code=404, detail="No ETL runs found")
    return row


def _truncate_fact_tables() -> None:
    for table in ("FACT_TRACKS", "ETL_BATCH_CONTROL"):
        try:
            execute(f"TRUNCATE TABLE {table}")
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Error truncando {table}: {exc}")


@router.post("/etl/clear", tags=["ETL"])
def etl_clear():
    _truncate_fact_tables()
    return {"status": "cleared"}


@router.post("/etl/trigger", tags=["ETL"], status_code=202)
async def etl_trigger(body: ETLTriggerRequest):
    """Mantenido por compatibilidad con el panel ETL existente. Desde la
    implementación de `ingesta`, comparte el guard de idempotencia
    (RF-ING-003/RN-ING-001) y de concurrencia con `POST /app/v1/ingesta/ejecuciones`
    — ver `_trigger_guarded`. No se le agregó `forzar_recarga` para no romper
    el contrato existente con `etl.html`; siempre se comporta como recarga NO forzada."""
    result = await _trigger_guarded(body.week_number, forzar_recarga=False)
    return {
        "message":      "DAG run triggered",
        "week_number":  body.week_number,
        "airflow":      result["airflow"],
    }


@router.get("/etl/run-status", tags=["ETL"])
async def etl_run_status(run_id: str = Query(..., description="Airflow dag_run_id")):
    url = f"{AIRFLOW_URL}/api/v1/dags/{AIRFLOW_DAG}/dagRuns/{run_id}"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, auth=(AIRFLOW_USER, AIRFLOW_PASS))
        if resp.status_code == 404:
            raise HTTPException(status_code=404, detail="DAG run not found")
        if not resp.is_success:
            raise HTTPException(status_code=resp.status_code, detail=f"Airflow error: {resp.text}")
        return {"run_id": run_id, "state": resp.json().get("state")}
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"Cannot reach Airflow: {exc}")


# ── Data Quality ──────────────────────────────────────────────────────────────

@router.get("/data-quality", tags=["Data Management"])
def data_quality():
    try:
        counts    = query_one(DATA_QUALITY_COUNTS)
        rejection = query_one(DATA_QUALITY_REJECTION)
        last_load = query_one(DATA_QUALITY_LAST_LOAD)

        total     = counts["total_records"]     if counts else 0
        real      = counts["real_records"]      if counts else 0
        synthetic = counts["synthetic_records"] if counts else 0

        real_pct      = round(real / total * 100, 1)      if total else 0.0
        synthetic_pct = round(synthetic / total * 100, 1) if total else 0.0

        return {
            "total_records":    total,
            "real_records":     real,
            "synthetic_records": synthetic,
            "real_pct":         real_pct,
            "synthetic_pct":    synthetic_pct,
            "last_load":        last_load,
            "rejection_rate":   rejection["rejection_rate"] if rejection else None,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error fetching data quality: {exc}")


# ── FACT_TRACKS (read-only) ───────────────────────────────────────────────────

@router.get("/facts", tags=["Facts"])
def facts_list(
    page:   int = Query(1,  ge=1),
    limit:  int = Query(50, ge=1, le=500),
    search: Optional[str] = Query(None),
):
    offset = (page - 1) * limit
    params: dict = {"limit": limit, "offset": offset}
    where = ""
    if search and search.strip():
        where = "WHERE position(lower(track_name), lower({search:String})) > 0"
        params["search"] = search.strip()
    rows  = query_rows(facts_list_sql(where), params)
    total = query_one(f"SELECT count() AS n FROM FACT_TRACKS {where}", params)["n"]
    return {"data": rows, "page": page, "limit": limit, "total": total}


# ── Generic DIM CRUD ──────────────────────────────────────────────────────────

def _resolve_table(table: str) -> str:
    resolved = DIM_TABLES.get(table)
    if not resolved:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown dimension table '{table}'. Valid options: {list(DIM_TABLES)}",
        )
    return resolved


def _get_pk_column(ch_table: str) -> str:
    row = query_one(dim_pk_sql(CH_DB, ch_table))
    if not row:
        raise HTTPException(status_code=500, detail=f"Cannot resolve PK for {ch_table}")
    return row["name"]


@router.get("/dim/{table}", tags=["Dimensions"])
def dim_list(
    table:  str,
    page:   int = Query(1,  ge=1),
    limit:  int = Query(50, ge=1, le=500),
    search: Optional[str] = Query(None),
):
    ch_table = _resolve_table(table)
    offset   = (page - 1) * limit
    params: dict = {"limit": limit, "offset": offset}
    where = ""
    if search and search.strip():
        str_cols = query_rows(dim_str_cols_sql(CH_DB, ch_table))
        if str_cols:
            conditions = " OR ".join(
                f"position(lower({col['name']}), lower({{search:String}})) > 0"
                for col in str_cols
            )
            where = f"WHERE {conditions}"
            params["search"] = search.strip()
    rows  = query_rows(dim_list_sql(ch_table, where), params)
    total = query_one(dim_list_total_sql(ch_table, where), params)["n"]
    return {"data": rows, "page": page, "limit": limit, "total": total}


@router.get("/dim/{table}/{record_id}", tags=["Dimensions"])
def dim_get(table: str, record_id: int):
    ch_table = _resolve_table(table)
    pk = _get_pk_column(ch_table)
    row = query_one(
        f"SELECT * FROM {ch_table} WHERE {pk} = {{record_id:Int32}}",
        {"record_id": record_id},
    )
    if not row:
        raise HTTPException(status_code=404, detail="Record not found")
    return row


@router.post("/dim/{table}", tags=["Dimensions"], status_code=201)
def dim_create(table: str, body: DimRecord):
    ch_table = _resolve_table(table)
    if not body.data:
        raise HTTPException(status_code=422, detail="data must not be empty")
    cols = ", ".join(body.data.keys())
    vals = ", ".join(
        f"'{v}'" if isinstance(v, str) else str(v)
        for v in body.data.values()
    )
    try:
        execute(f"INSERT INTO {ch_table} ({cols}) VALUES ({vals})")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"message": "Record created", "data": body.data}


@router.put("/dim/{table}/{record_id}", tags=["Dimensions"])
def dim_update(table: str, record_id: int, body: DimRecord):
    ch_table = _resolve_table(table)
    pk = _get_pk_column(ch_table)
    if not body.data:
        raise HTTPException(status_code=422, detail="data must not be empty")
    assignments = ", ".join(
        f"{k} = '{v}'" if isinstance(v, str) else f"{k} = {v}"
        for k, v in body.data.items()
        if k != pk
    )
    if not assignments:
        raise HTTPException(status_code=422, detail="No updatable fields provided")
    try:
        execute(f"ALTER TABLE {ch_table} UPDATE {assignments} WHERE {pk} = {record_id}")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"message": "Record updated", "id": record_id}


@router.delete("/dim/{table}/{record_id}", tags=["Dimensions"], status_code=204)
def dim_delete(
    table: str,
    record_id: int,
    confirmar: bool = Query(False, description="Confirmación explícita requerida si el valor está referenciado por FACT_TRACKS (RN-ING-004)"),
):
    ch_table  = _resolve_table(table)
    pk        = _get_pk_column(ch_table)
    fk_column = DIM_FK_COLUMN.get(table)

    if fk_column:
        refs = query_one(dim_fk_references_sql(fk_column), {"record_id": record_id})
        ref_count = refs["n"] if refs else 0
        if ref_count > 0 and not confirmar:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"El valor {record_id} está referenciado por {ref_count} registro(s) en FACT_TRACKS. "
                    "Repita la solicitud con confirmar=true para eliminarlo de todas formas."
                ),
            )

    try:
        execute(f"ALTER TABLE {ch_table} DELETE WHERE {pk} = {record_id}")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


# ─────────────────────────────────────────────────────────────────────────────
# OpenSpec `ingesta` v1 — disparo, monitoreo y auditoría de cargas
# ─────────────────────────────────────────────────────────────────────────────

v1_router = APIRouter(prefix="/app/v1/ingesta", tags=["Ingesta v1"], dependencies=[Depends(require_lead_data_engineer)])

# Mapea cada task de la DAG (etl/dags/tracklytics_etl.py) a la etapa que
# describe RF-ING-002: extracción → transformación a staging → carga a ClickHouse.
_STAGE_BY_TASK = {
    "task_bronze":       "extraccion",
    "task_silver":        "transformacion_staging",
    "task_gold":          "carga_clickhouse",
    "task_synthetic":     "carga_clickhouse",
    "task_log":           "auditoria",
    "task_log_failure":   "auditoria",
}


class EjecucionIngestaRequest(BaseModel):
    week_number: int
    forzar_recarga: bool = False
    synthetic_mode: Literal["uniform", "normal", "empirical"] = "uniform"


async def _airflow_has_active_run() -> bool:
    """Guard de concurrencia (tarea 2.3): el pipeline actual trunca toda
    FACT_TRACKS en cada corrida (recarga completa, no incremental), por lo
    que dos ejecuciones simultáneas de cualquier semana corromperían los
    datos entre sí. ETL_BATCH_CONTROL no tiene una columna de estado para
    marcar "en curso" y el Migration Plan de esta capability prohíbe
    modificar el modelo de datos técnico — el guard se apoya en el estado
    real de Airflow (dagRuns activos) en vez de un campo nuevo en ClickHouse."""
    url = f"{AIRFLOW_URL}/api/v1/dags/{AIRFLOW_DAG}/dagRuns"
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            url,
            # Filtra por estado directamente en la API en vez de ordenar por
            # start_date y mirar los últimos N: un dagRun en estado "queued"
            # todavía no tiene start_date (es null hasta que pasa a running),
            # así que ordenar por esa columna lo descarta del LIMIT de forma
            # impredecible. Confirmado empíricamente: con ese enfoque, un
            # disparo recién encolado no era detectado como activo.
            params=[("state", "queued"), ("state", "running"), ("limit", 10)],
            auth=(AIRFLOW_USER, AIRFLOW_PASS),
        )
    resp.raise_for_status()
    runs = resp.json().get("dag_runs", [])
    return len(runs) > 0


# Serializa el tramo "verificar -> truncar -> disparar" dentro de este
# proceso de FastAPI (un solo worker uvicorn, ver api_Dockerfile). Sin este
# lock, dos requests casi simultáneas pueden pasar ambas la verificación de
# `_airflow_has_active_run()` antes de que la primera llegue a registrar su
# propio dagRun en Airflow — confirmado empíricamente disparando dos
# ejecuciones con ~0.5s de diferencia durante la verificación de esta
# capability: ambas recibieron 202 sin que el guard rechazara la segunda.
_trigger_lock = asyncio.Lock()


async def _trigger_guarded(week_number: int, forzar_recarga: bool, synthetic_mode: str = "uniform") -> dict:
    """Aplica idempotencia (RF-ING-003/RN-ING-001) y el guard de concurrencia
    antes de disparar la ejecución en Airflow. El disparo en sí (truncar +
    POST a Airflow) se mantiene exactamente como ya estaba."""
    if not (1 <= week_number <= 16):
        raise HTTPException(status_code=422, detail="week_number debe estar entre 1 y 16")

    async with _trigger_lock:
        ya_cargada = query_one(ETL_BATCH_EXISTS, {"week_number": week_number})["n"] > 0
        if ya_cargada and not forzar_recarga:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"La semana {week_number} ya fue cargada (ETL_BATCH_CONTROL). "
                    "Use forzar_recarga=true para recargarla de todas formas."
                ),
            )

        try:
            if await _airflow_has_active_run():
                raise HTTPException(
                    status_code=409,
                    detail="Ya hay una ejecución de ingesta en curso en Airflow. Espere a que finalice.",
                )
        except httpx.RequestError as exc:
            raise HTTPException(status_code=502, detail=f"Cannot reach Airflow: {exc}")

        _truncate_fact_tables()
        payload = {"conf": {"week_number": week_number, "synthetic_mode": synthetic_mode}}
        url = f"{AIRFLOW_URL}/api/v1/dags/{AIRFLOW_DAG}/dagRuns"
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(url, json=payload, auth=(AIRFLOW_USER, AIRFLOW_PASS))
            if resp.status_code not in (200, 201):
                raise HTTPException(status_code=resp.status_code, detail=f"Airflow error: {resp.text}")
            airflow_data = resp.json()
        except httpx.RequestError as exc:
            raise HTTPException(status_code=502, detail=f"Cannot reach Airflow: {exc}")

    return {
        "ejecucion_id":   airflow_data.get("dag_run_id"),
        "week_number":    week_number,
        "forzado":        forzar_recarga and ya_cargada,
        "synthetic_mode": synthetic_mode,
        "airflow":        airflow_data,
    }


@v1_router.post("/ejecuciones", status_code=202)
async def crear_ejecucion(body: EjecucionIngestaRequest):
    """RF-ING-001: dispara la ingesta de un período/lote en Airflow."""
    return await _trigger_guarded(body.week_number, body.forzar_recarga, body.synthetic_mode)


@v1_router.get("/ejecuciones/{ejecucion_id}")
async def estado_ejecucion(ejecucion_id: str):
    """RF-ING-002: estado en tiempo real de cada etapa del pipeline para una
    ejecución (dag_run_id de Airflow)."""
    base = f"{AIRFLOW_URL}/api/v1/dags/{AIRFLOW_DAG}/dagRuns/{ejecucion_id}"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            run_resp   = await client.get(base, auth=(AIRFLOW_USER, AIRFLOW_PASS))
            tasks_resp = await client.get(f"{base}/taskInstances", auth=(AIRFLOW_USER, AIRFLOW_PASS))
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"Cannot reach Airflow: {exc}")

    if run_resp.status_code == 404:
        raise HTTPException(status_code=404, detail="Ejecución no encontrada")
    if not run_resp.is_success:
        raise HTTPException(status_code=run_resp.status_code, detail=f"Airflow error: {run_resp.text}")

    etapas = []
    if tasks_resp.is_success:
        for t in tasks_resp.json().get("task_instances", []):
            etapas.append({
                "task_id": t.get("task_id"),
                "etapa":   _STAGE_BY_TASK.get(t.get("task_id"), t.get("task_id")),
                "estado":  t.get("state"),
            })

    return {
        "ejecucion_id": ejecucion_id,
        "estado":       run_resp.json().get("state"),
        "etapas":       etapas,
    }


@v1_router.get("/cargas")
def historial_cargas(
    page:  int = Query(1,  ge=1),
    limit: int = Query(20, ge=1, le=200),
):
    """RF-ING-005/RF-ING-006/RN-ING-002: historial de cargas con tasa de
    rechazo, señal de "requiere revisión" (>1%) e indicador de última carga."""
    offset = (page - 1) * limit
    rows   = query_rows(CARGAS_HISTORIAL, {"limit": limit, "offset": offset})
    for row in rows:
        row["requiere_revision"] = (row.get("tasa_rechazo_pct") or 0) > 1.0
    total  = query_one(ETL_LOGS_TOTAL)["n"]

    ultima = query_one(CARGAS_ULTIMA)
    if ultima:
        ultima["requiere_revision"] = (ultima.get("tasa_rechazo_pct") or 0) > 1.0

    return {"data": rows, "page": page, "limit": limit, "total": total, "ultima_carga": ultima}
