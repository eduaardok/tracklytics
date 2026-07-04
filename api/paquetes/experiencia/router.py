import random
from datetime import datetime, timezone
from typing import Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from core.config import AIRFLOW_PASS, AIRFLOW_URL, AIRFLOW_USER
from core.database import execute, get_client, query_one, query_rows
from paquetes.experiencia import pb_client
from paquetes.experiencia.deps import (
    get_current_user, require_admin, require_b2c_user, verify_analytics_access,
)
from paquetes.experiencia.queries import (
    COUNT_MIEMBROS_SUSCRIPCION,
    FACT_IDS_FAVORITOS_USUARIO,
    GENEROS_FAVORITOS_USUARIO,
    MIEMBRO_EXISTE,
    MIEMBROS_DE_SUSCRIPCION,
    MIS_TICKETS,
    RECOMENDACIONES_POPULARES,
    RECOMENDACIONES_POR_GENERO,
    SUSCRIPCION_TIENE_TITULAR,
    TICKET_POR_ID,
    TOP_TRACKS_PLAYLIST,
    USUARIO_YA_EN_PLAN_FAMILIAR,
    tickets_admin_sql,
)
from paquetes.seguridad import audit

router = APIRouter(prefix="/app/v1/experiencia", tags=["Experiencia"])

FAMILIA_LIMITE_MIEMBROS = 5
PLAYLISTS_SYNC_DAG = "playlists_sync"


def _gen_fact_id() -> int:
    # UInt64 aleatorio sin lock, 50 bits (no 63 — Number.MAX_SAFE_INTEGER en el
    # cliente), mismo patrón ya corregido en `social`/`distribucion`
    # (design.md, "Generación de identificadores").
    return random.getrandbits(50)


# ─────────────────────────────────────────────────────────────────────────────
# 1. Reproducción enriquecida (RF-EXP-001) — funciones internas invocadas
# desde `paquetes/biblioteca/router.py::add_historial`, mismo punto único de
# "intento de reproducción" que ya usa `distribucion` (design.md, "Reproducción
# rica vs. historial existente").
# ─────────────────────────────────────────────────────────────────────────────

def registrar_reproduccion_enriquecida(
    usuario_id: str, fact_id_track: int, dispositivo_id: str, sesion_id: str, porcentaje_completado: float,
) -> None:
    get_client().insert(
        "FACT_REPRODUCCION_EVENTO",
        [(
            _gen_fact_id(), usuario_id, fact_id_track, dispositivo_id, sesion_id,
            porcentaje_completado, datetime.now(timezone.utc),
        )],
        column_names=[
            "fact_id", "usuario_id", "fact_id_track", "dispositivo_id", "sesion_id",
            "porcentaje_completado", "fecha",
        ],
    )


def marcar_impresion_reproducida(usuario_id: str, fact_id_impresion: int, fact_id_track: int) -> None:
    # No-op silencioso si `fact_id_impresion` no corresponde a este usuario/track
    # (WHERE no matchea ninguna fila) — evita que un cliente pueda marcar como
    # reproducida una impresión ajena solo con adivinar un fact_id.
    execute(
        "ALTER TABLE FACT_IMPRESION_RECOMENDACION UPDATE fue_reproducido = 1 "
        "WHERE fact_id = {fact_id:UInt64} AND usuario_id = {usuario_id:String} "
        "AND fact_id_track = {fact_id_track:UInt64}",
        {"fact_id": fact_id_impresion, "usuario_id": usuario_id, "fact_id_track": fact_id_track},
    )


# ─────────────────────────────────────────────────────────────────────────────
# 2. Recomendaciones (RF-EXP-002/003) — algoritmo simple documentado como tal
# (design.md, Non-Goal "Motor de recomendación con machine learning"): mismo
# género que los favoritos del usuario, con fallback a popularidad global.
# Cada track devuelto registra su propia impresión (`FACT_IMPRESION_RECOMENDACION`,
# `fue_reproducido=0`); el `impresion_id` devuelto es el que el cliente reenvía
# en `POST /biblioteca/historial/{fact_id}` si el usuario reproduce esa recomendación.
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/recomendaciones")
def obtener_recomendaciones(limit: int = Query(10, ge=1, le=50), user: dict = Depends(require_b2c_user)):
    usuario_id = user["record"]["id"]
    excluidos  = [r["fact_id"] for r in query_rows(FACT_IDS_FAVORITOS_USUARIO, {"usuario_id": usuario_id})]
    generos    = [r["genre_id"] for r in query_rows(GENEROS_FAVORITOS_USUARIO, {"usuario_id": usuario_id})]

    if generos:
        algoritmo = "mismo_genero_favoritos"
        tracks = query_rows(
            RECOMENDACIONES_POR_GENERO,
            {"genre_ids": generos, "excluidos": excluidos, "limit": limit},
        )
    else:
        algoritmo = "popularidad_global"
        tracks = query_rows(RECOMENDACIONES_POPULARES, {"excluidos": excluidos, "limit": limit})

    filas = []
    resultado = []
    for t in tracks:
        impresion_id = _gen_fact_id()
        filas.append((impresion_id, usuario_id, t["fact_id"], algoritmo, 0, datetime.now(timezone.utc)))
        resultado.append({**t, "impresion_id": impresion_id, "algoritmo": algoritmo})

    if filas:
        get_client().insert(
            "FACT_IMPRESION_RECOMENDACION",
            filas,
            column_names=["fact_id", "usuario_id", "fact_id_track", "algoritmo", "fue_reproducido", "fecha"],
        )
    return {"data": resultado, "algoritmo": algoritmo}


# ─────────────────────────────────────────────────────────────────────────────
# 3. Tickets de soporte (RF-EXP-004/005, CU-O45..CU-O48)
# ─────────────────────────────────────────────────────────────────────────────

class TicketBody(BaseModel):
    asunto: str
    descripcion: str


class ActualizarTicketBody(BaseModel):
    estado: Literal["abierto", "en_proceso", "resuelto", "cerrado"]


@router.post("/tickets", status_code=201)
def crear_ticket(body: TicketBody, user: dict = Depends(require_b2c_user)):
    asunto      = body.asunto.strip()
    descripcion = body.descripcion.strip()
    if not asunto or not descripcion:
        raise HTTPException(status_code=422, detail="El asunto y la descripción son requeridos")

    usuario_id = user["record"]["id"]
    fact_id    = _gen_fact_id()
    get_client().insert(
        "FACT_TICKET_SOPORTE",
        [(fact_id, usuario_id, asunto, descripcion, "abierto", datetime.now(timezone.utc), None)],
        column_names=[
            "fact_id", "usuario_id", "asunto", "descripcion", "estado", "fecha_creacion", "fecha_resolucion",
        ],
    )
    return {"status": "ok", "fact_id": fact_id, "estado": "abierto"}


@router.get("/tickets")
def listar_tickets(estado: str | None = Query(None), user: dict = Depends(get_current_user)):
    role = user.get("record", {}).get("role", "")
    if role == "admin":
        clauses, params = [], {}
        if estado:
            clauses.append("estado = {estado:String}")
            params["estado"] = estado
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        return {"data": query_rows(tickets_admin_sql(where), params)}
    if role != "user":
        raise HTTPException(status_code=403, detail="Los tickets de soporte son exclusivos de Usuario B2C o admin")
    return {"data": query_rows(MIS_TICKETS, {"usuario_id": user["record"]["id"]})}


@router.put("/tickets/{fact_id}")
def actualizar_ticket(fact_id: int, body: ActualizarTicketBody, admin: dict = Depends(require_admin)):
    ticket = query_one(TICKET_POR_ID, {"fact_id": fact_id})
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")

    admin_id = admin["record"]["id"]
    if body.estado == "resuelto":
        execute(
            "ALTER TABLE FACT_TICKET_SOPORTE UPDATE estado = {estado:String}, fecha_resolucion = now() "
            "WHERE fact_id = {fact_id:UInt64}",
            {"estado": body.estado, "fact_id": fact_id},
        )
    else:
        execute(
            "ALTER TABLE FACT_TICKET_SOPORTE UPDATE estado = {estado:String} WHERE fact_id = {fact_id:UInt64}",
            {"estado": body.estado, "fact_id": fact_id},
        )
    audit.record(
        usuario_id=admin_id,
        accion="actualizar_ticket_soporte",
        tabla_afectada="FACT_TICKET_SOPORTE",
        antes={"fact_id": fact_id, "estado": ticket["estado"]},
        despues={"fact_id": fact_id, "estado": body.estado},
    )
    return {"status": "ok", "fact_id": fact_id, "estado": body.estado}


# ─────────────────────────────────────────────────────────────────────────────
# 4. Reflejo de playlists (RF-EXP-006/007, CU-O49/CU-O50)
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/playlists/sincronizar", status_code=202)
async def forzar_sincronizacion_playlists(admin: dict = Depends(require_admin)):
    """Dispara el DAG `playlists_sync` en Airflow fuera del ciclo semanal
    (design.md, "BRIDGE_TRACK_PLAYLIST_USUARIO — frecuencia de
    sincronización"). Mismo patrón de disparo HTTP que
    `paquetes/gestion_datos/router.py::etl_trigger`, sin `week_number` — el
    snapshot de playlists no depende de la semana académica."""
    url = f"{AIRFLOW_URL}/api/v1/dags/{PLAYLISTS_SYNC_DAG}/dagRuns"
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(url, json={"conf": {}}, auth=(AIRFLOW_USER, AIRFLOW_PASS))
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"Cannot reach Airflow: {exc}")
    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail=f"Airflow error: {resp.text}")

    dag_run_id = resp.json().get("dag_run_id")
    audit.record(
        usuario_id=admin["record"]["id"],
        accion="forzar_sincronizacion_playlists",
        tabla_afectada="BRIDGE_TRACK_PLAYLIST_USUARIO",
        antes=None,
        despues={"dag_run_id": dag_run_id},
    )
    return {"status": "ok", "dag_run_id": dag_run_id}


@router.get("/playlists/top-tracks")
def top_tracks_playlists(limit: int = Query(20, ge=1, le=100), user: dict = Depends(verify_analytics_access)):
    return {"data": query_rows(TOP_TRACKS_PLAYLIST, {"limit": limit})}


# ─────────────────────────────────────────────────────────────────────────────
# 5. Plan familiar (RF-EXP-008, CU-O51..CU-O53) — elegibilidad restringida a
# suscripciones del plan `premium` (B2C), validada en Python contra
# PocketBase/`planes.py` (design.md, "elegibilidad de plan": no existe
# columna de tipo de plan en ClickHouse).
# ─────────────────────────────────────────────────────────────────────────────

class TitularBody(BaseModel):
    usuario_id: str


class MiembroBody(BaseModel):
    usuario_id: str


@router.post("/familia/titular", status_code=201)
async def crear_titular(body: TitularBody, admin: dict = Depends(require_admin)):
    usuario_id = body.usuario_id
    if query_one(USUARIO_YA_EN_PLAN_FAMILIAR, {"usuario_id": usuario_id})["n"] > 0:
        raise HTTPException(status_code=409, detail="El usuario ya es titular o miembro de un plan familiar")

    suscripcion = await pb_client.suscripcion_activa_de_usuario(usuario_id)
    if not suscripcion:
        raise HTTPException(status_code=404, detail="El usuario no tiene una suscripción activa")
    if suscripcion.get("tipo_plan") != "premium":
        raise HTTPException(
            status_code=403,
            detail="El plan familiar solo aplica a suscriptores del plan premium",
        )

    suscripcion_id = suscripcion["id"]
    if query_one(SUSCRIPCION_TIENE_TITULAR, {"suscripcion_id": suscripcion_id})["n"] > 0:
        raise HTTPException(status_code=409, detail="Esta suscripción ya tiene un titular de plan familiar")

    get_client().insert(
        "BRIDGE_SUSCRIPTOR_FAMILIA",
        [(suscripcion_id, usuario_id, 1, datetime.now(timezone.utc))],
        column_names=["suscripcion_id", "usuario_id", "es_titular", "fecha_union"],
    )
    audit.record(
        usuario_id=admin["record"]["id"],
        accion="crear_titular_plan_familiar",
        tabla_afectada="BRIDGE_SUSCRIPTOR_FAMILIA",
        antes=None,
        despues={"suscripcion_id": suscripcion_id, "usuario_id": usuario_id},
    )
    return {"status": "ok", "suscripcion_id": suscripcion_id, "usuario_id": usuario_id, "es_titular": True}


@router.get("/familia/{suscripcion_id}")
def ver_plan_familiar(suscripcion_id: str, admin: dict = Depends(require_admin)):
    miembros = query_rows(MIEMBROS_DE_SUSCRIPCION, {"suscripcion_id": suscripcion_id})
    return {"data": miembros, "total": len(miembros), "limite": FAMILIA_LIMITE_MIEMBROS}


@router.post("/familia/{suscripcion_id}/miembros", status_code=201)
def agregar_miembro(suscripcion_id: str, body: MiembroBody, admin: dict = Depends(require_admin)):
    if query_one(SUSCRIPCION_TIENE_TITULAR, {"suscripcion_id": suscripcion_id})["n"] == 0:
        raise HTTPException(status_code=404, detail="Esta suscripción no tiene un plan familiar activo")

    usuario_id = body.usuario_id
    if query_one(USUARIO_YA_EN_PLAN_FAMILIAR, {"usuario_id": usuario_id})["n"] > 0:
        raise HTTPException(status_code=409, detail="El usuario ya es titular o miembro de un plan familiar")

    total_actual = query_one(COUNT_MIEMBROS_SUSCRIPCION, {"suscripcion_id": suscripcion_id})["n"]
    if total_actual >= FAMILIA_LIMITE_MIEMBROS:
        raise HTTPException(
            status_code=403,
            detail=f"Se alcanzó el límite de {FAMILIA_LIMITE_MIEMBROS} miembros del plan familiar",
        )

    get_client().insert(
        "BRIDGE_SUSCRIPTOR_FAMILIA",
        [(suscripcion_id, usuario_id, 0, datetime.now(timezone.utc))],
        column_names=["suscripcion_id", "usuario_id", "es_titular", "fecha_union"],
    )
    audit.record(
        usuario_id=admin["record"]["id"],
        accion="agregar_miembro_plan_familiar",
        tabla_afectada="BRIDGE_SUSCRIPTOR_FAMILIA",
        antes=None,
        despues={"suscripcion_id": suscripcion_id, "usuario_id": usuario_id},
    )
    return {"status": "ok", "suscripcion_id": suscripcion_id, "usuario_id": usuario_id, "total": total_actual + 1}


@router.delete("/familia/{suscripcion_id}/miembros/{usuario_id}")
def quitar_miembro(suscripcion_id: str, usuario_id: str, admin: dict = Depends(require_admin)):
    if query_one(MIEMBRO_EXISTE, {"suscripcion_id": suscripcion_id, "usuario_id": usuario_id})["n"] == 0:
        raise HTTPException(status_code=404, detail="Este usuario no pertenece a este plan familiar")

    execute(
        "ALTER TABLE BRIDGE_SUSCRIPTOR_FAMILIA DELETE "
        "WHERE suscripcion_id = {suscripcion_id:String} AND usuario_id = {usuario_id:String}",
        {"suscripcion_id": suscripcion_id, "usuario_id": usuario_id},
    )
    audit.record(
        usuario_id=admin["record"]["id"],
        accion="quitar_miembro_plan_familiar",
        tabla_afectada="BRIDGE_SUSCRIPTOR_FAMILIA",
        antes={"suscripcion_id": suscripcion_id, "usuario_id": usuario_id},
        despues=None,
    )
    return {"status": "ok"}
