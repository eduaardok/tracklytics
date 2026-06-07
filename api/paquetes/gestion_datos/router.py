from typing import Any, Optional

import httpx
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from core.config import AIRFLOW_DAG, AIRFLOW_PASS, AIRFLOW_URL, AIRFLOW_USER, CH_DB, DIM_TABLES
from core.database import execute, get_client, query_one, query_rows
from paquetes.gestion_datos.queries import (
    ETL_LOGS, ETL_LOGS_TOTAL, ETL_STATUS_LAST,
    DATA_QUALITY_COUNTS, DATA_QUALITY_REJECTION, DATA_QUALITY_LAST_LOAD,
    dim_list_sql, dim_list_total_sql, dim_pk_sql, dim_str_cols_sql,
    facts_list_sql,
)

router = APIRouter(tags=["Data Management"])


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
    _truncate_fact_tables()
    payload = {"conf": {"week_number": body.week_number}}
    url = f"{AIRFLOW_URL}/api/v1/dags/{AIRFLOW_DAG}/dagRuns"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url, json=payload, auth=(AIRFLOW_USER, AIRFLOW_PASS))
        if resp.status_code not in (200, 201):
            raise HTTPException(status_code=resp.status_code, detail=f"Airflow error: {resp.text}")
        return {"message": "DAG run triggered", "week_number": body.week_number, "airflow": resp.json()}
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"Cannot reach Airflow: {exc}")


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
def dim_delete(table: str, record_id: int):
    ch_table = _resolve_table(table)
    pk = _get_pk_column(ch_table)
    try:
        execute(f"ALTER TABLE {ch_table} DELETE WHERE {pk} = {record_id}")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
