import asyncio
from typing import Any, Literal, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from core.config import (
    AIRFLOW_DAG, AIRFLOW_PASS, AIRFLOW_URL, AIRFLOW_USER, CH_DB, DIM_FK_COLUMN, DIM_TABLES,
    RECALIFICACION_DAG,
)
from core.database import execute, get_client, insert_row, query_one, query_rows
from paquetes.gestion_datos.deps import require_lead_data_engineer
from paquetes.gestion_datos.queries import (
    ETL_LOGS, ETL_LOGS_TOTAL, ETL_STATUS_LAST,
    DATA_QUALITY_COUNTS, DATA_QUALITY_REJECTION, DATA_QUALITY_LAST_LOAD,
    CARGAS_HISTORIAL, CARGAS_ULTIMA, ETL_BATCH_EXISTS,
    ETL_MUESTRA, ETL_MUESTRA_LAST_WEEK, ETL_DISTRIBUCION_GENEROS,
    dim_columns_sql, dim_fk_references_sql, dim_list_sql, dim_list_total_sql, dim_pk_sql,
    dim_str_cols_sql, facts_list_sql, etl_distribucion_atributo_sql,
)

# Longitud máxima aceptada para un valor de texto libre en el CRUD genérico de
# dimensiones — sin esto, un string arbitrariamente largo se insertaba tal
# cual (auditoría de validación de entrada de datos).
_MAX_STR_LEN = 500

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
    # FACT_TRACKS: no se trunca sin condición — preservaría los tracks
    # promovidos por `creadores` (source_type='user_uploaded'), que no tienen
    # otra fuente de la que regenerarse tras un borrado (a diferencia de
    # favoritos/historial, que solo referencian un fact_id). Se borra
    # únicamente lo que la recarga batch va a regenerar (design.md de
    # `creadores`, "Preservación de tracks `user_uploaded`...").
    try:
        execute("ALTER TABLE FACT_TRACKS DELETE WHERE source_type != 'user_uploaded'")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error borrando FACT_TRACKS: {exc}")

    try:
        execute("TRUNCATE TABLE ETL_BATCH_CONTROL")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error truncando ETL_BATCH_CONTROL: {exc}")


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

        total         = counts["total_records"]           if counts else 0
        real          = counts["real_records"]             if counts else 0
        synthetic     = counts["synthetic_records"]        if counts else 0
        user_uploaded = counts["user_uploaded_records"]     if counts else 0

        real_pct          = round(real / total * 100, 1)          if total else 0.0
        synthetic_pct     = round(synthetic / total * 100, 1)     if total else 0.0
        user_uploaded_pct = round(user_uploaded / total * 100, 1) if total else 0.0

        return {
            "total_records":        total,
            "real_records":         real,
            "synthetic_records":    synthetic,
            "user_uploaded_records": user_uploaded,
            "real_pct":             real_pct,
            "synthetic_pct":        synthetic_pct,
            "user_uploaded_pct":    user_uploaded_pct,
            "last_load":            last_load,
            "rejection_rate":       rejection["rejection_rate"] if rejection else None,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error fetching data quality: {exc}")


# ── FACT_TRACKS (read-only) ───────────────────────────────────────────────────

@router.get("/facts", tags=["Facts"])
async def facts_list(
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
    # PERF (pre-demo S16): filas y conteo son independientes entre sí — en
    # paralelo con asyncio.gather/to_thread, mismo patrón que /ingesta/cargas
    # y /search, en vez de dos round-trips secuenciales a ClickHouse.
    rows, total_row = await asyncio.gather(
        asyncio.to_thread(query_rows, facts_list_sql(where), params),
        asyncio.to_thread(query_one, f"SELECT count() AS n FROM FACT_TRACKS {where}", params),
    )
    return {"data": rows, "page": page, "limit": limit, "total": total_row["n"]}


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


def _get_columns(ch_table: str) -> dict[str, str]:
    """Whitelist real de columnas (nombre -> tipo ClickHouse) de una tabla de
    dimensión. Toda key de `DimRecord.data` se valida contra esta whitelist
    antes de usarse como identificador de columna — nunca se interpola una
    key de usuario directo en SQL sin pasar por aquí primero."""
    rows = query_rows(dim_columns_sql(CH_DB, ch_table))
    return {row["name"]: row["type"] for row in rows}


def _clean_and_validate_data(data: dict[str, Any], columns: dict[str, str]) -> dict[str, Any]:
    unknown = [k for k in data if k not in columns]
    if unknown:
        raise HTTPException(
            status_code=422,
            detail=f"Columna(s) desconocida(s) para esta tabla: {unknown}. Válidas: {list(columns)}",
        )
    cleaned: dict[str, Any] = {}
    for k, v in data.items():
        if isinstance(v, str):
            v = v.strip()
            if len(v) > _MAX_STR_LEN:
                raise HTTPException(
                    status_code=422,
                    detail=f"'{k}' excede la longitud máxima permitida ({_MAX_STR_LEN} caracteres).",
                )
        cleaned[k] = v
    return cleaned


@router.get("/dim/{table}", tags=["Dimensions"])
async def dim_list(
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
    # PERF (pre-demo S16): mismo criterio que /facts — filas y conteo son
    # independientes, se piden en paralelo en vez de en secuencia.
    rows, total_row = await asyncio.gather(
        asyncio.to_thread(query_rows, dim_list_sql(ch_table, where), params),
        asyncio.to_thread(query_one, dim_list_total_sql(ch_table, where), params),
    )
    return {"data": rows, "page": page, "limit": limit, "total": total_row["n"]}


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

    columns = _get_columns(ch_table)
    data    = _clean_and_validate_data(dict(body.data), columns)

    pk = _get_pk_column(ch_table)
    # El identificador SIEMPRE lo asigna el sistema, nunca el cliente — se
    # descarta cualquier valor de `pk` que venga en el payload en vez de
    # confiar en él. Antes, un `pk` incluido en el body (ej. el formulario
    # de "Nuevo" precargaba la fila del primer registro visible como
    # plantilla, id incluido) se insertaba tal cual sin comprobar si ya
    # existía — hallazgo real: dos álbumes con el mismo `album_id` (auditoría
    # de validación, pre-demo S16). `dim_update` ya rechaza explícitamente
    # cambiar el pk; acá el criterio es más estricto todavía: ni se acepta.
    data.pop(pk, None)
    next_id = query_one(f"SELECT max({pk}) AS n FROM {ch_table}")
    nuevo_id = (next_id["n"] if next_id and next_id["n"] else 0) + 1
    # `max+1` no es atómico: dos creaciones casi simultáneas sobre la misma
    # tabla podrían calcular el mismo `nuevo_id` (MergeTree no tiene
    # constraint de unicidad que lo impida solo). Se reconfirma justo antes
    # de insertar y se avanza si alguien más ya lo tomó — acotado a unos
    # pocos intentos, no un loop sin límite.
    for _ in range(5):
        ya_existe = query_one(
            f"SELECT count() AS n FROM {ch_table} WHERE {pk} = {{id:{columns[pk]}}}", {"id": nuevo_id},
        )
        if not ya_existe or ya_existe["n"] == 0:
            break
        nuevo_id += 1
    else:
        raise HTTPException(status_code=409, detail=f"No se pudo asignar un '{pk}' disponible, intenta de nuevo.")
    data[pk] = nuevo_id

    # Inserta vía el protocolo nativo del driver (core.database.insert_row),
    # no SQL de texto — antes esta función construía `INSERT ... VALUES (...)`
    # con f-strings interpolando directamente las keys/values del payload:
    # inyección de SQL real (hallazgo crítico de la auditoría de validación,
    # ver docs/auditoria_validacion/gestion_datos.md).
    try:
        insert_row(ch_table, data)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"message": "Record created", "data": data}


@router.put("/dim/{table}/{record_id}", tags=["Dimensions"])
def dim_update(table: str, record_id: int, body: DimRecord):
    ch_table = _resolve_table(table)
    pk = _get_pk_column(ch_table)
    if not body.data:
        raise HTTPException(status_code=422, detail="data must not be empty")

    columns = _get_columns(ch_table)
    data    = _clean_and_validate_data(dict(body.data), columns)

    if pk in data:
        # El identificador es inmutable tras la creación del registro: se
        # rechaza explícitamente en vez de sobreescribirlo o descartarlo en
        # silencio (auditoría de validación — antes se filtraba sin avisar).
        raise HTTPException(
            status_code=400,
            detail=f"'{pk}' es la clave primaria de esta tabla y no puede modificarse en una actualización.",
        )
    if not data:
        raise HTTPException(status_code=422, detail="No updatable fields provided")

    # Nombres de columna: solo los ya validados contra `columns` (whitelist
    # real de system.columns) llegan a interpolarse como identificadores.
    # Valores: siempre parametrizados, nunca interpolados como texto —
    # mismo motivo que en `dim_create`.
    assignments = []
    params: dict[str, Any] = {"record_id": record_id}
    for i, (k, v) in enumerate(data.items()):
        p = f"p_{i}"
        assignments.append(f"{k} = {{{p}:{columns[k]}}}")
        params[p] = v
    set_clause = ", ".join(assignments)

    try:
        execute(
            f"ALTER TABLE {ch_table} UPDATE {set_clause} WHERE {pk} = {{record_id:{columns[pk]}}}",
            params,
        )
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
    columns   = _get_columns(ch_table)
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
        execute(
            f"ALTER TABLE {ch_table} DELETE WHERE {pk} = {{record_id:{columns[pk]}}}",
            {"record_id": record_id},
        )
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


async def _airflow_has_active_run(dag_id: str = AIRFLOW_DAG) -> bool:
    """Guard de concurrencia (tarea 2.3): el pipeline actual trunca toda
    FACT_TRACKS en cada corrida (recarga completa, no incremental), por lo
    que dos ejecuciones simultáneas de cualquier semana corromperían los
    datos entre sí. ETL_BATCH_CONTROL no tiene una columna de estado para
    marcar "en curso" y el Migration Plan de esta capability prohíbe
    modificar el modelo de datos técnico — el guard se apoya en el estado
    real de Airflow (dagRuns activos) en vez de un campo nuevo en ClickHouse.
    Reutilizado por la recalificación (tarea 3 de `enriquecimiento-catalogo`)
    pasando su propio `dag_id`, para no permitir dos recalificaciones a la vez."""
    url = f"{AIRFLOW_URL}/api/v1/dags/{dag_id}/dagRuns"
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


_recalificacion_lock = asyncio.Lock()


@v1_router.post("/recalificacion", status_code=202)
async def disparar_recalificacion():
    """CU-O79: dispara `tracklytics_recalificacion` (DAG independiente, design.md
    decisión 3) para corregir en bloque álbumes/artistas sin año/país informado
    y tracks no reales con perfil de audio incoherente con su género."""
    async with _recalificacion_lock:
        try:
            if await _airflow_has_active_run(RECALIFICACION_DAG):
                raise HTTPException(
                    status_code=409,
                    detail="Ya hay una recalificación en curso en Airflow. Espere a que finalice.",
                )
        except httpx.RequestError as exc:
            raise HTTPException(status_code=502, detail=f"Cannot reach Airflow: {exc}")

        url = f"{AIRFLOW_URL}/api/v1/dags/{RECALIFICACION_DAG}/dagRuns"
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(url, json={"conf": {}}, auth=(AIRFLOW_USER, AIRFLOW_PASS))
            if resp.status_code not in (200, 201):
                raise HTTPException(status_code=resp.status_code, detail=f"Airflow error: {resp.text}")
            airflow_data = resp.json()
        except httpx.RequestError as exc:
            raise HTTPException(status_code=502, detail=f"Cannot reach Airflow: {exc}")

    return {"ejecucion_id": airflow_data.get("dag_run_id"), "airflow": airflow_data}


@v1_router.get("/recalificacion/{ejecucion_id}")
async def estado_recalificacion(ejecucion_id: str):
    """Estado de una ejecución de recalificación, mismo patrón que `estado_ejecucion`."""
    base = f"{AIRFLOW_URL}/api/v1/dags/{RECALIFICACION_DAG}/dagRuns/{ejecucion_id}"
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

    tarea_estado = None
    if tasks_resp.is_success:
        for t in tasks_resp.json().get("task_instances", []):
            if t.get("task_id") == "task_recalificacion":
                tarea_estado = t.get("state")

    resultado = None
    if tarea_estado == "success":
        xcom_url = f"{base}/taskInstances/task_recalificacion/xcomEntries/resultado"
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                xcom_resp = await client.get(xcom_url, auth=(AIRFLOW_USER, AIRFLOW_PASS))
            if xcom_resp.is_success:
                resultado = xcom_resp.json().get("value")
        except httpx.RequestError:
            pass

    return {
        "ejecucion_id": ejecucion_id,
        "estado":       run_resp.json().get("state"),
        "tarea_estado": tarea_estado,
        "resultado":    resultado,
    }


@v1_router.get("/cargas")
async def historial_cargas(
    page:  int = Query(1,  ge=1),
    limit: int = Query(20, ge=1, le=200),
):
    """RF-ING-005/RF-ING-006/RN-ING-002: historial de cargas con tasa de
    rechazo, señal de "requiere revisión" (>1%) e indicador de última carga."""
    offset = (page - 1) * limit
    # PERF (revisión de rendimiento): las 3 consultas son independientes entre
    # sí (ETL_LOGS es una tabla de log chica, no el cuello de botella real) —
    # se mandan en paralelo con `asyncio.gather`/`to_thread` en vez de en
    # secuencia, mismo patrón que `/search` en `catalogo/router.py`.
    rows, total_row, ultima = await asyncio.gather(
        asyncio.to_thread(query_rows, CARGAS_HISTORIAL, {"limit": limit, "offset": offset}),
        asyncio.to_thread(query_one, ETL_LOGS_TOTAL),
        asyncio.to_thread(query_one, CARGAS_ULTIMA),
    )
    for row in rows:
        row["requiere_revision"] = (row.get("tasa_rechazo_pct") or 0) > 1.0
    total = total_row["n"]

    if ultima:
        ultima["requiere_revision"] = (ultima.get("tasa_rechazo_pct") or 0) > 1.0

    return {"data": rows, "page": page, "limit": limit, "total": total, "ultima_carga": ultima}


def _resolve_week_number(week_number: Optional[int]) -> int:
    """Sin `week_number` explícito, usa la semana más reciente presente en
    FACT_TRACKS (no ETL_LOGS: una ejecución fallida puede loggearse sin haber
    insertado filas, y lo que este panel necesita es la semana con datos)."""
    if week_number is not None:
        return week_number
    row = query_one(ETL_MUESTRA_LAST_WEEK)
    if not row or row["n"] is None:
        raise HTTPException(status_code=404, detail="No hay ninguna semana cargada en FACT_TRACKS todavía")
    return row["n"]


_ATTR_COLUMNS = ("energy", "valence", "danceability")


@v1_router.get("/etl/muestra")
def etl_muestra(
    week_number: Optional[int] = Query(None, description="Semana de load_week; por defecto, la más reciente cargada"),
    limit: int = Query(200, ge=1, le=200),
):
    """Muestra aleatoria de una semana ya cargada, para inspección visual de lo
    que efectivamente se generó/insertó (Context: no había forma de ver qué
    produjo un modo `synthetic_mode` sin consultar ClickHouse a mano)."""
    week = _resolve_week_number(week_number)
    rows = query_rows(ETL_MUESTRA, {"week_number": week, "limit": limit})
    return {"week_number": week, "data": rows}


@v1_router.get("/etl/distribucion")
async def etl_distribucion(
    week_number: Optional[int] = Query(None, description="Semana de load_week; por defecto, la más reciente cargada"),
):
    """Agregados sobre el set COMPLETO de filas de una semana (no la muestra):
    distribución por género y bins de 0.2 (5 bins, 0.0–1.0) para energy/valence/
    danceability."""
    week = _resolve_week_number(week_number)
    # PERF (revisión de rendimiento): 4 agregados independientes (géneros +
    # 3 columnas de atributo) sobre la misma semana se mandaban en secuencia,
    # 4 round-trips a ClickHouse uno detrás del otro. En paralelo con
    # `asyncio.gather`/`to_thread` — mismo patrón que `/search` y `/cargas`.
    generos, *bin_rows_por_col = await asyncio.gather(
        asyncio.to_thread(query_rows, ETL_DISTRIBUCION_GENEROS, {"week_number": week}),
        *(
            asyncio.to_thread(query_rows, etl_distribucion_atributo_sql(col), {"week_number": week})
            for col in _ATTR_COLUMNS
        ),
    )

    atributos: dict[str, list[dict[str, Any]]] = {}
    for col, bin_rows in zip(_ATTR_COLUMNS, bin_rows_por_col):
        by_bin = {row["bin"]: row["n"] for row in bin_rows}
        atributos[col] = [
            {"bin": i, "rango": f"{i * 0.2:.1f}–{i * 0.2 + 0.2:.1f}", "n": by_bin.get(i, 0)}
            for i in range(5)
        ]

    return {"week_number": week, "generos": generos, "atributos": atributos}
