from collections import Counter

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from core.database import get_client, query_one, query_rows
from core.deps import require_b2c_user
from paquetes.biblioteca import pb_playlists
from paquetes.biblioteca.queries import (
    COUNT_FAVORITOS, FACT_ID_EXISTS, FAVORITOS_ACTUALES, HISTORIAL_RECIENTE, TRACKS_BY_FACT_IDS,
)
from paquetes.distribucion.router import registrar_restriccion_reproduccion, resolver_pais_id, restriccion_activa
from paquetes.experiencia.router import marcar_impresion_reproducida, registrar_reproduccion_enriquecida
from paquetes.seguridad.queries import SESION_ABIERTA_POR_DISPOSITIVO
from paquetes.suscripciones import pb_client

router = APIRouter(prefix="/app/v1/biblioteca", tags=["Biblioteca"])

FREE_FAV_LIMIT     = 20
FREE_HISTORIAL_CAP = 20
FREE_UPGRADE_URL   = "/autenticacion/planes.html"


async def _get_plan(user: dict) -> str:
    activas = await pb_client.list_activas(user["token"], user["record"]["id"])
    return activas[0]["tipo_plan"] if activas else "free"


def _assert_fact_exists(fact_id: int) -> None:
    if not query_one(FACT_ID_EXISTS, {"fact_id": fact_id}):
        raise HTTPException(status_code=404, detail=f"fact_id {fact_id} not found")


def _insert_event(user_id: str, fact_id: int, event_type: str) -> None:
    get_client().insert(
        "FACT_ENGAGEMENT_USUARIO",
        [(user_id, fact_id, event_type, False, "app")],
        column_names=["user_id", "fact_id", "event_type", "is_synthetic", "source"],
    )


@router.get("/favoritos")
async def get_favoritos(user: dict = Depends(require_b2c_user)):
    user_id = user["record"]["id"]
    plan    = await _get_plan(user)
    rows    = query_rows(FAVORITOS_ACTUALES, {"user_id": user_id})
    return {
        "data":       rows,
        "total":      len(rows),
        "plan":       plan,
        "plan_limit": FREE_FAV_LIMIT if plan == "free" else None,
    }


@router.post("/favoritos/{fact_id}")
async def add_favorito(fact_id: int, user: dict = Depends(require_b2c_user)):
    user_id = user["record"]["id"]
    _assert_fact_exists(fact_id)
    plan = await _get_plan(user)
    if plan == "free":
        row = query_one(COUNT_FAVORITOS, {"user_id": user_id})
        if row and row["total"] >= FREE_FAV_LIMIT:
            raise HTTPException(
                status_code=403,
                detail=f"Plan Free: límite de {FREE_FAV_LIMIT} favoritos alcanzado. Actualiza a Premium.",
            )
    _insert_event(user_id, fact_id, "favorito_add")
    return {"status": "ok", "plan": plan}


@router.delete("/favoritos/{fact_id}")
async def remove_favorito(fact_id: int, user: dict = Depends(require_b2c_user)):
    user_id = user["record"]["id"]
    _assert_fact_exists(fact_id)
    _insert_event(user_id, fact_id, "favorito_remove")
    return {"status": "ok"}


@router.get("/historial")
async def get_historial(
    limit: int = Query(50, ge=1, le=200),
    user: dict = Depends(require_b2c_user),
):
    user_id         = user["record"]["id"]
    plan            = await _get_plan(user)
    effective_limit = min(limit, FREE_HISTORIAL_CAP) if plan == "free" else limit
    rows            = query_rows(HISTORIAL_RECIENTE, {"user_id": user_id, "limit": effective_limit})
    return {
        "data":          rows,
        "total":         len(rows),
        "plan":          plan,
        "limit_applied": effective_limit,
    }


class HistorialBody(BaseModel):
    # Todos opcionales: el llamador legacy (`app/js/history.js` sin cambios)
    # sigue funcionando sin body — la telemetría enriquecida (RF-EXP-001/003)
    # es aditiva, nunca bloqueante (design.md de `experiencia`, "Reproducción
    # rica vs. historial existente").
    dispositivo_id: str | None = None
    porcentaje_completado: float = 0.0
    impresion_id: int | None = None


@router.post("/historial/{fact_id}")
async def add_historial(fact_id: int, body: HistorialBody | None = None, user: dict = Depends(require_b2c_user)):
    user_id = user["record"]["id"]
    _assert_fact_exists(fact_id)

    # Enforcement de restricción geográfica (capability `distribucion`,
    # RF-DIS-007): punto único de "intento de reproducción" — no duplicar en
    # un endpoint paralelo (design.md, Decisión 4). País no reconocido -> None
    # -> fail-open, no se bloquea (design.md, Decisión 5).
    pais_id = resolver_pais_id(user["record"].get("pais", ""))
    if pais_id is not None:
        restriccion = restriccion_activa(fact_id, pais_id)
        if restriccion:
            registrar_restriccion_reproduccion(
                user_id, fact_id, pais_id, restriccion["tipo_restriccion_id"],
            )
            # `detail` como string (no dict): el frontend vanilla (`app/js/api.js::apiFetch`)
            # ya muestra un toast para cualquier 403 leyendo `err.detail` como texto — mantener
            # este contrato evita tener que tocar ese manejo global solo para esta capability.
            raise HTTPException(
                status_code=403,
                detail=f"Este track no está disponible en tu país ({restriccion['tipo_restriccion_nombre']})",
            )

    _insert_event(user_id, fact_id, "reproduccion")

    # RF-EXP-001 (capability `experiencia`): segundo insert síncrono, mismo
    # punto único de reproducción — no sustituye el insert de arriba. Sin
    # dispositivo identificado no hay evento enriquecido que registrar (spec.md,
    # "WHEN ocurre una reproducción ... con dispositivo y sesión identificados").
    if body and body.dispositivo_id:
        sesion = query_one(
            SESION_ABIERTA_POR_DISPOSITIVO, {"usuario_id": user_id, "dispositivo_id": body.dispositivo_id},
        )
        registrar_reproduccion_enriquecida(
            user_id, fact_id, body.dispositivo_id,
            sesion["sesion_id"] if sesion else "",
            body.porcentaje_completado,
        )

    # RF-EXP-003: si esta reproducción proviene de una recomendación mostrada
    # (GET /experiencia/recomendaciones), marca esa impresión como reproducida.
    if body and body.impresion_id is not None:
        marcar_impresion_reproducida(user_id, body.impresion_id, fact_id)

    return {"status": "ok"}


# ─────────────────────────────────────────────────────────────────────────────
# Playlists — descubierto durante la migración de `catalogo` a React: el
# frontend legacy (app/js/playlists.js) llama directo a PocketBase desde el
# navegador, sin pasar por Python (viola RT-01). Estos endpoints cierran ese
# gap reusando las colecciones `playlists`/`playlist_tracks` ya definidas en
# pb_init.py, cuyas reglas (`user = @request.auth.id`,
# `playlist.user = @request.auth.id`) ya limitan cada operación a las propias
# playlists del usuario — no hace falta reverificar ownership en Python.
# ─────────────────────────────────────────────────────────────────────────────

class PlaylistBody(BaseModel):
    name: str


class PlaylistTrackBody(BaseModel):
    fact_id: int


@router.get("/playlists")
async def listar_playlists(user: dict = Depends(require_b2c_user)):
    user_id = user["record"]["id"]
    token   = user["token"]
    playlists = await pb_playlists.listar(token, user_id)
    counts    = Counter(it["playlist"] for it in await pb_playlists.listar_tracks_de_usuario(token, user_id))
    return {
        "data": [
            {"playlist_id": p["id"], "name": p["name"], "track_count": counts.get(p["id"], 0)}
            for p in playlists
        ],
    }


@router.post("/playlists", status_code=201)
async def crear_playlist(body: PlaylistBody, user: dict = Depends(require_b2c_user)):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="El nombre no puede estar vacío")
    pl = await pb_playlists.crear(user["token"], user["record"]["id"], name)
    return {"playlist_id": pl["id"], "name": pl["name"], "track_count": 0}


@router.get("/playlists/{playlist_id}")
async def detalle_playlist(playlist_id: str, user: dict = Depends(require_b2c_user)):
    pl = await pb_playlists.obtener(user["token"], playlist_id)
    if not pl:
        raise HTTPException(status_code=404, detail="Playlist not found")

    items = await pb_playlists.listar_tracks(user["token"], playlist_id)
    fact_ids = [it["fact_id"] for it in items]
    tracks_by_fact = {}
    if fact_ids:
        rows = query_rows(TRACKS_BY_FACT_IDS, {"fact_ids": fact_ids})
        tracks_by_fact = {r["fact_id"]: r for r in rows}

    ordered = sorted(items, key=lambda it: it["position"])
    tracks  = [tracks_by_fact[it["fact_id"]] for it in ordered if it["fact_id"] in tracks_by_fact]
    return {"playlist_id": pl["id"], "name": pl["name"], "data": tracks, "total": len(tracks)}


@router.patch("/playlists/{playlist_id}")
async def renombrar_playlist(playlist_id: str, body: PlaylistBody, user: dict = Depends(require_b2c_user)):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="El nombre no puede estar vacío")
    pl = await pb_playlists.renombrar(user["token"], playlist_id, name)
    return {"playlist_id": pl["id"], "name": pl["name"]}


@router.delete("/playlists/{playlist_id}")
async def eliminar_playlist(playlist_id: str, user: dict = Depends(require_b2c_user)):
    await pb_playlists.eliminar(user["token"], playlist_id)
    return {"status": "ok"}


@router.post("/playlists/{playlist_id}/tracks", status_code=201)
async def agregar_track_playlist(playlist_id: str, body: PlaylistTrackBody, user: dict = Depends(require_b2c_user)):
    _assert_fact_exists(body.fact_id)
    token = user["token"]
    items = await pb_playlists.listar_tracks(token, playlist_id)
    if any(it["fact_id"] == body.fact_id for it in items):
        return {"status": "ok", "already_added": True}
    await pb_playlists.agregar_track(token, playlist_id, body.fact_id, position=len(items) + 1)
    return {"status": "ok", "already_added": False}


@router.delete("/playlists/{playlist_id}/tracks/{fact_id}")
async def quitar_track_playlist(playlist_id: str, fact_id: int, user: dict = Depends(require_b2c_user)):
    await pb_playlists.quitar_track_por_fact_id(user["token"], playlist_id, fact_id)
    return {"status": "ok"}
