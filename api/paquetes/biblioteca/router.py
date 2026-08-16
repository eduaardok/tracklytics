from collections import Counter
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException, Path, Query
from pydantic import BaseModel, EmailStr, Field

from core.database import get_client, query_one, query_rows
from core.deps import get_current_user_optional, require_b2c_user
from core.featuring import enriquecer_featuring
from paquetes.biblioteca import pb_playlists
from paquetes.biblioteca.queries import (
    COUNT_FAVORITOS, FACT_ID_EXISTS, FAVORITOS_ACTUALES, HISTORIAL_RECIENTE, LIKES_DISLIKES_BATCH,
    LIKES_DISLIKES_COUNT, TRACKS_BY_FACT_IDS, VOTO_USUARIO_ACTUAL, VOTOS_USUARIO_BATCH,
)
from paquetes.distribucion.router import registrar_restriccion_reproduccion, resolver_pais_id, restriccion_activa
from paquetes.experiencia.queries import USUARIO_POR_EMAIL
from paquetes.experiencia.router import marcar_impresion_reproducida, registrar_reproduccion_enriquecida
from paquetes.seguridad.queries import SESION_ABIERTA_POR_DISPOSITIVO
from paquetes.social import notificaciones
from paquetes.suscripciones import pb_client

router = APIRouter(prefix="/app/v1/biblioteca", tags=["Biblioteca"])

# Formato real de un ID de registro de PocketBase (15 caracteres en base32
# minúscula) — mismo criterio y mismo hallazgo que `partners/router.py`
# (auditoría de validación): `pb_playlists.py` interpola `playlist_id` sin
# validar tanto en la URL del REST API (`.../records/{playlist_id}`) como en
# filtros armados por f-string (`f'playlist="{playlist_id}"'` en
# `listar_tracks`/`quitar_track_por_fact_id`). Un `playlist_id` con `"` rompe
# el filtro; acotar el formato en el borde de la API cierra la vía sin tocar
# `pb_playlists.py`. Se aplica también a `usuario_id` en el endpoint de
# colaboradores por el mismo motivo (es un ID de la colección `users`).
_PB_ID_PATTERN = r"^[a-z0-9]{15}$"

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
    rows    = enriquecer_featuring(query_rows(FAVORITOS_ACTUALES, {"user_id": user_id}))
    return {
        "data":       rows,
        "total":      len(rows),
        "plan":       plan,
        "plan_limit": FREE_FAV_LIMIT if plan == "free" else None,
    }


@router.post("/favoritos/{fact_id}")
async def add_favorito(fact_id: int = Path(..., ge=1), user: dict = Depends(require_b2c_user)):
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
async def remove_favorito(fact_id: int = Path(..., ge=1), user: dict = Depends(require_b2c_user)):
    user_id = user["record"]["id"]
    _assert_fact_exists(fact_id)
    _insert_event(user_id, fact_id, "favorito_remove")
    return {"status": "ok"}


# ─────────────────────────────────────────────────────────────────────────────
# Like/dislike (RN-ANA-001, autorizado por Eduardo en S16 prompt 09): mismo
# patrón de evento que favoritos (_insert_event), mutuamente excluyentes por
# usuario+track — insertar 'like' retira un 'dislike' vigente y viceversa
# porque el estado se resuelve por el ÚLTIMO evento (argMax), sin necesidad
# de borrar la fila anterior. `voto_remove` no compone raw_score (solo
# 'like' lo hace) — existe únicamente para que DELETE pueda anular un voto
# sin inventar un evento con significado de negocio.
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/tracks/{fact_id}/like")
async def like_track(fact_id: int = Path(..., ge=1), user: dict = Depends(require_b2c_user)):
    _assert_fact_exists(fact_id)
    _insert_event(user["record"]["id"], fact_id, "like")
    return {"status": "ok"}


@router.post("/tracks/{fact_id}/dislike")
async def dislike_track(fact_id: int = Path(..., ge=1), user: dict = Depends(require_b2c_user)):
    _assert_fact_exists(fact_id)
    _insert_event(user["record"]["id"], fact_id, "dislike")
    return {"status": "ok"}


@router.delete("/tracks/{fact_id}/like")
async def quitar_voto_track(fact_id: int = Path(..., ge=1), user: dict = Depends(require_b2c_user)):
    _assert_fact_exists(fact_id)
    _insert_event(user["record"]["id"], fact_id, "voto_remove")
    return {"status": "ok"}


@router.get("/tracks/{fact_id}/likes")
async def get_likes(fact_id: int = Path(..., ge=1), user: dict | None = Depends(get_current_user_optional)):
    _assert_fact_exists(fact_id)
    counts = query_one(LIKES_DISLIKES_COUNT, {"fact_id": fact_id}) or {"likes": 0, "dislikes": 0}
    voto = None
    if user is not None:
        row = query_one(VOTO_USUARIO_ACTUAL, {"fact_id": fact_id, "user_id": user["record"]["id"]})
        last_event = row["last_event"] if row else None
        voto = last_event if last_event in ("like", "dislike") else None
    return {"likes": counts["likes"], "dislikes": counts["dislikes"], "voto": voto}


# Batch (hallazgo real de rendimiento, S16 prompt 09): un listado de catálogo
# renderiza N TrackCard a la vez, y cada uno pedía su propio GET .../likes —
# un listado de 20 tracks disparaba 20 GET simultáneos, saturando el pool de
# conexiones de ClickHouse (503 real, reproducido). `useLikes.ts` agrupa esos
# N pedidos en uno solo contra este endpoint.
@router.get("/tracks/likes")
async def get_likes_batch(
    fact_ids: str = Query(..., description="fact_id separados por coma, máx. 200"),
    user: dict | None = Depends(get_current_user_optional),
):
    try:
        ids = [int(x) for x in fact_ids.split(",") if x.strip()]
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="fact_ids debe ser una lista de enteros separados por coma") from exc
    if not ids:
        return {"data": {}}
    if len(ids) > 200:
        raise HTTPException(status_code=422, detail="Máximo 200 fact_ids por consulta")

    counts_by_fact = {r["fact_id"]: r for r in query_rows(LIKES_DISLIKES_BATCH, {"fact_ids": ids})}
    votos_by_fact: dict[int, str] = {}
    if user is not None:
        votos_by_fact = {
            r["fact_id"]: r["last_event"]
            for r in query_rows(VOTOS_USUARIO_BATCH, {"fact_ids": ids, "user_id": user["record"]["id"]})
        }

    return {
        "data": {
            str(fid): {
                "likes": counts_by_fact.get(fid, {}).get("likes", 0),
                "dislikes": counts_by_fact.get(fid, {}).get("dislikes", 0),
                "voto": votos_by_fact.get(fid) if votos_by_fact.get(fid) in ("like", "dislike") else None,
            }
            for fid in ids
        }
    }


@router.get("/historial")
async def get_historial(
    limit: int = Query(50, ge=1, le=200),
    user: dict = Depends(require_b2c_user),
):
    user_id         = user["record"]["id"]
    plan            = await _get_plan(user)
    effective_limit = min(limit, FREE_HISTORIAL_CAP) if plan == "free" else limit
    rows            = enriquecer_featuring(query_rows(HISTORIAL_RECIENTE, {"user_id": user_id, "limit": effective_limit}))
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
    dispositivo_id: str | None = Field(None, min_length=1, max_length=200)
    # Porcentaje de una reproducción — nunca puede exceder el 100% ni ser negativo.
    porcentaje_completado: float = Field(0.0, ge=0, le=100)
    impresion_id: int | None = Field(None, ge=1)


@router.post("/historial/{fact_id}")
async def add_historial(
    fact_id: int = Path(..., ge=1), body: HistorialBody | None = None, user: dict = Depends(require_b2c_user),
):
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
    # El frontend ya limita el input a maxLength=60 (PlaylistsTab.tsx,
    # AddToPlaylistMenu.tsx) — 100 en el backend da margen sobre esa UX sin
    # dejar pasar un nombre arbitrariamente largo si alguien llama a la API
    # directo (auditoría de validación).
    name: str = Field(..., min_length=1, max_length=100)


class PlaylistTrackBody(BaseModel):
    fact_id: int = Field(..., ge=1)


@router.get("/playlists")
async def listar_playlists(user: dict = Depends(require_b2c_user)):
    user_id = user["record"]["id"]
    token   = user["token"]
    playlists  = await pb_playlists.listar(token, user_id)
    all_items  = await pb_playlists.listar_tracks_de_usuario(token, user_id)
    counts     = Counter(it["playlist"] for it in all_items)

    # Collage de portada (S14-P1): hasta 4 portadas ya resueltas por playlist,
    # de sus primeras canciones por posición — sin request nuevo a PocketBase
    # (reusa `all_items`, ya traído para los conteos) y una sola consulta batch
    # a ClickHouse para todos los fact_ids de todas las playlists a la vez (no
    # N+1 por playlist).
    primeros_por_playlist: dict[str, list[int]] = {}
    for it in sorted(all_items, key=lambda it: it["position"]):
        lote = primeros_por_playlist.setdefault(it["playlist"], [])
        if len(lote) < 4:
            lote.append(it["fact_id"])

    fact_ids_todos = sorted({fid for lote in primeros_por_playlist.values() for fid in lote})
    imagen_por_fact_id: dict[int, str | None] = {}
    if fact_ids_todos:
        rows = query_rows(TRACKS_BY_FACT_IDS, {"fact_ids": fact_ids_todos})
        imagen_por_fact_id = {r["fact_id"]: r.get("imagen_url") for r in rows}

    return {
        "data": [
            {
                "playlist_id": p["id"], "name": p["name"], "track_count": counts.get(p["id"], 0),
                "es_publica": bool(p.get("es_publica", False)),
                "portada_urls": [
                    url for fid in primeros_por_playlist.get(p["id"], [])
                    if (url := imagen_por_fact_id.get(fid))
                ],
            }
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
async def detalle_playlist(playlist_id: str = Path(..., pattern=_PB_ID_PATTERN), user: dict = Depends(require_b2c_user)):
    pl = await pb_playlists.obtener(user["token"], playlist_id)
    if not pl:
        raise HTTPException(status_code=404, detail="Playlist not found")

    items = await pb_playlists.listar_tracks(user["token"], playlist_id)
    fact_ids = [it["fact_id"] for it in items]
    tracks_by_fact = {}
    if fact_ids:
        rows = enriquecer_featuring(query_rows(TRACKS_BY_FACT_IDS, {"fact_ids": fact_ids}))
        tracks_by_fact = {r["fact_id"]: r for r in rows}

    ordered = sorted(items, key=lambda it: it["position"])
    tracks  = [tracks_by_fact[it["fact_id"]] for it in ordered if it["fact_id"] in tracks_by_fact]

    # `expand.colaboradores` viene de pb_playlists.obtener() (params expand=colaboradores)
    colaboradores_raw = await pb_playlists.resolver_colaboradores(pl.get("colaboradores", []))
    colaboradores = [
        {"usuario_id": c["id"], "nombre": c.get("name", ""), "email": c.get("email", "")}
        for c in colaboradores_raw
    ]
    return {
        "playlist_id":  pl["id"],
        "name":         pl["name"],
        "data":         tracks,
        "total":        len(tracks),
        "is_owner":     pl["user"] == user["record"]["id"],
        "colaboradores": colaboradores,
        "es_publica":   bool(pl.get("es_publica", False)),
    }


class PlaylistReordenarBody(BaseModel):
    # Tope generoso (una playlist real no tiene miles de tracks) sin permitir
    # una lista arbitrariamente larga; cada fact_id nunca es 0 ni negativo.
    fact_ids: list[Annotated[int, Field(ge=1)]] = Field(..., max_length=2000)


@router.put("/playlists/{playlist_id}/reordenar")
async def reordenar_playlist(
    body: PlaylistReordenarBody,
    playlist_id: str = Path(..., pattern=_PB_ID_PATTERN),
    user: dict = Depends(require_b2c_user),
):
    try:
        await pb_playlists.reordenar(user["token"], playlist_id, body.fact_ids)
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            raise HTTPException(status_code=403, detail="No tienes acceso a esta playlist") from exc
        raise
    return {"status": "ok"}


class PlaylistColaboradorBody(BaseModel):
    email: EmailStr


@router.post("/playlists/{playlist_id}/colaboradores", status_code=201)
async def agregar_colaborador_playlist(
    body: PlaylistColaboradorBody,
    playlist_id: str = Path(..., pattern=_PB_ID_PATTERN),
    user: dict = Depends(require_b2c_user),
):
    fila = query_one(USUARIO_POR_EMAIL, {"email": body.email.strip()})
    if not fila:
        raise HTTPException(status_code=404, detail=f"No existe un usuario con email {body.email}")
    try:
        pl = await pb_playlists.agregar_colaborador(user["token"], playlist_id, fila["usuario_id"])
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            raise _solo_propietario() from exc
        raise
    notificaciones.crear(
        fila["usuario_id"], "nuevo_colaborador_playlist", "playlist", playlist_id,
        f"Te agregaron como colaborador de la playlist \"{pl.get('name', '')}\"",
    )
    return {"status": "ok", "usuario_id": fila["usuario_id"], "nombre": fila["nombre"]}


@router.delete("/playlists/{playlist_id}/colaboradores/{usuario_id}")
async def quitar_colaborador_playlist(
    playlist_id: str = Path(..., pattern=_PB_ID_PATTERN),
    usuario_id: str = Path(..., pattern=_PB_ID_PATTERN),
    user: dict = Depends(require_b2c_user),
):
    try:
        await pb_playlists.quitar_colaborador(user["token"], playlist_id, usuario_id)
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            raise _solo_propietario() from exc
        raise
    return {"status": "ok"}


def _solo_propietario() -> HTTPException:
    # PocketBase responde 404 (no 403) cuando `updateRule`/`deleteRule` rechaza
    # la operación — oculta el registro en vez de admitir que existe (comportamiento
    # de PocketBase, no un bug). Antes de playlists colaborativas esto nunca era
    # alcanzable (solo el owner conocía el playlist_id); ahora un colaborador sí
    # puede intentar renombrar/eliminar, así que se traduce a un 403 legible en
    # vez de dejar que el httpx.HTTPStatusError sin capturar se vuelva un 500 opaco.
    return HTTPException(status_code=403, detail="Solo el propietario puede hacer esto")


@router.patch("/playlists/{playlist_id}")
async def renombrar_playlist(
    body: PlaylistBody,
    playlist_id: str = Path(..., pattern=_PB_ID_PATTERN),
    user: dict = Depends(require_b2c_user),
):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="El nombre no puede estar vacío")
    try:
        pl = await pb_playlists.renombrar(user["token"], playlist_id, name)
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            raise _solo_propietario() from exc
        raise
    return {"playlist_id": pl["id"], "name": pl["name"]}


class PlaylistVisibilidadBody(BaseModel):
    es_publica: bool


@router.patch("/playlists/{playlist_id}/visibilidad")
async def actualizar_visibilidad_playlist(
    body: PlaylistVisibilidadBody,
    playlist_id: str = Path(..., pattern=_PB_ID_PATTERN),
    user: dict = Depends(require_b2c_user),
):
    """Perfiles públicos (S10 ronda 2): exclusivo del dueño — un colaborador
    puede administrar tracks pero no decide qué se expone en el perfil
    público de otra persona."""
    try:
        pl = await pb_playlists.actualizar_visibilidad(user["token"], playlist_id, body.es_publica)
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            raise _solo_propietario() from exc
        raise
    return {"playlist_id": pl["id"], "name": pl["name"], "es_publica": bool(pl.get("es_publica", False))}


@router.delete("/playlists/{playlist_id}")
async def eliminar_playlist(playlist_id: str = Path(..., pattern=_PB_ID_PATTERN), user: dict = Depends(require_b2c_user)):
    try:
        await pb_playlists.eliminar(user["token"], playlist_id)
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            raise _solo_propietario() from exc
        raise
    return {"status": "ok"}


@router.post("/playlists/{playlist_id}/tracks", status_code=201)
async def agregar_track_playlist(
    body: PlaylistTrackBody,
    playlist_id: str = Path(..., pattern=_PB_ID_PATTERN),
    user: dict = Depends(require_b2c_user),
):
    _assert_fact_exists(body.fact_id)
    token = user["token"]
    items = await pb_playlists.listar_tracks(token, playlist_id)
    if any(it["fact_id"] == body.fact_id for it in items):
        return {"status": "ok", "already_added": True}
    await pb_playlists.agregar_track(token, playlist_id, body.fact_id, position=len(items) + 1)
    return {"status": "ok", "already_added": False}


@router.delete("/playlists/{playlist_id}/tracks/{fact_id}")
async def quitar_track_playlist(
    playlist_id: str = Path(..., pattern=_PB_ID_PATTERN),
    fact_id: int = Path(..., ge=1),
    user: dict = Depends(require_b2c_user),
):
    await pb_playlists.quitar_track_por_fact_id(user["token"], playlist_id, fact_id)
    return {"status": "ok"}
