import random
import re
from datetime import datetime, timezone
from typing import Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, Path, Query
from pydantic import BaseModel, Field, field_validator

from core.cache import cached
from core.config import AIRFLOW_PASS, AIRFLOW_URL, AIRFLOW_USER, YOUTUBE_API_KEY
from core.database import execute, get_client, query_one, query_rows
from paquetes.experiencia import pb_client
from paquetes.experiencia.deps import (
    get_current_user, require_admin, require_b2c_user, verify_analytics_access,
)
from paquetes.experiencia.queries import (
    AB_TESTS_RESUMEN,
    COUNT_MIEMBROS_SUSCRIPCION,
    FACT_IDS_ESCUCHADOS_USUARIO,
    FACT_IDS_FAVORITOS_USUARIO,
    FAMILIAS_RESUMEN,
    GENERO_DOMINANTE_USUARIO,
    GENEROS_FAVORITOS_USUARIO,
    GENEROS_MAS_ESCUCHADOS_USUARIO,
    MIEMBRO_EXISTE,
    MIEMBROS_DE_SUSCRIPCION,
    MIS_TICKETS,
    MIX_AFINIDAD,
    MIX_EXPLORACION,
    PERFIL_AUDIO_FAVORITOS_E_HISTORIAL,
    RADIO_POR_TRACK,
    RECOMENDACIONES_NOVEDADES_ARTISTAS_SEGUIDOS,
    RECOMENDACIONES_POPULARES,
    RECOMENDACIONES_POR_AFINIDAD,
    REDESCUBRE_USUARIO,
    TRACK_SEMILLA,
    SUSCRIPCION_FAMILIAR_DE_USUARIO,
    SUSCRIPCION_TIENE_TITULAR,
    TICKET_POR_ID,
    TICKETS_ABIERTOS_TOTAL,
    TICKETS_POR_ESTADO,
    TOP_TRACKS_PLAYLIST,
    USUARIO_POR_EMAIL,
    USUARIO_YA_EN_PLAN_FAMILIAR,
    tickets_admin_sql,
)
from paquetes.seguridad import audit
from paquetes.social.queries import ARTISTAS_SEGUIDOS_POR_USUARIO

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
# 1b. Resolución de video de YouTube (RF-EXP-010, corrección post-lanzamiento)
# El player del cliente (PlayerContext.tsx) reproducía audio de fondo pasando
# `playerVars: { listType: 'search', list: query }` directo a la IFrame
# Player API, sin backend ni API key — YouTube deprecó ese valor de
# `listType` el 15/11/2020 (sigue aceptando el player pero el <video> interno
# nunca resuelve media real), así que en la práctica SIEMPRE caía al
# fallback simulado. Este endpoint hace la búsqueda de texto → videoId contra
# la YouTube Data API v3 (`search.list`, sí soportada), que es la alternativa
# que la propia documentación de YouTube indica para reemplazar `listType:
# 'search'`. Cacheado varias horas: el video de "artista + track" no cambia,
# y cada llamada a `search.list` cuesta 100 unidades de las 10.000/día que
# trae la cuota gratuita.
# ─────────────────────────────────────────────────────────────────────────────

YOUTUBE_RESOLVER_CACHE_TTL_S = 6 * 60 * 60


@cached(ttl=YOUTUBE_RESOLVER_CACHE_TTL_S)
async def _resolver_youtube_video_id(query: str) -> str | None:
    if not YOUTUBE_API_KEY:
        return None
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.get(
                "https://www.googleapis.com/youtube/v3/search",
                params={
                    "part": "id", "type": "video", "maxResults": 1,
                    "q": query, "key": YOUTUBE_API_KEY,
                },
            )
    except httpx.RequestError:
        return None
    if resp.status_code != 200:
        return None
    items = resp.json().get("items") or []
    if not items:
        return None
    return items[0]["id"]["videoId"]


@router.get("/reproduccion/youtube-video-id")
async def resolver_youtube_video_id(
    q: str = Query(..., min_length=1, max_length=200), user: dict = Depends(get_current_user),
):
    """Solo requiere sesión iniciada (no un rol B2C específico) — mismo umbral
    de acceso que ya tiene la reproducción en el cliente. No expone
    `YOUTUBE_API_KEY` al navegador: el cliente solo recibe el `video_id`."""
    video_id = await _resolver_youtube_video_id(q)
    if not video_id:
        raise HTTPException(status_code=404, detail="Sin resultados de YouTube para esta búsqueda")
    return {"video_id": video_id}


# ─────────────────────────────────────────────────────────────────────────────
# 2. Recomendaciones (RF-EXP-002/003) — algoritmo simple documentado como tal
# (design.md, Non-Goal "Motor de recomendación con machine learning"). Desde
# S10 ronda 2, "Para ti" se divide en hasta 3 secciones independientes en vez
# de una sola lista genérica (ver queries.py para el detalle de cada una):
#   1. "Hecho para ti" — el algoritmo de 3 niveles que ya existía (similitud
#      de audio real dentro de tus géneros más escuchados → mismo género que
#      tus favoritos → popularidad global), solo renombrado en la UI.
#   2. "Novedades de artistas que sigues" — tracks recientes de artistas en
#      BRIDGE_SEGUIMIENTO_ARTISTA, ausente si el usuario no sigue a nadie.
#   3. "Redescubre" — su propio historial/favoritos con interacción más
#      antigua, ausente si el usuario no tiene ningún favorito/reproducción.
# Cada track de cada sección registra su propia impresión
# (`FACT_IMPRESION_RECOMENDACION`, `fue_reproducido=0`); el `impresion_id`
# devuelto es el que el cliente reenvía en `POST /biblioteca/historial/{fact_id}`
# si el usuario reproduce esa recomendación.
# ─────────────────────────────────────────────────────────────────────────────

def _registrar_impresiones(
    usuario_id: str, algoritmo: str, tracks: list[dict], motivo: str = "",
) -> list[dict]:
    filas, items = [], []
    for t in tracks:
        impresion_id = _gen_fact_id()
        filas.append((impresion_id, usuario_id, t["fact_id"], algoritmo, 0, datetime.now(timezone.utc)))
        items.append({
            **t, "impresion_id": impresion_id, "algoritmo": algoritmo, "motivo": motivo,
        })
    if filas:
        get_client().insert(
            "FACT_IMPRESION_RECOMENDACION",
            filas,
            column_names=["fact_id", "usuario_id", "fact_id_track", "algoritmo", "fue_reproducido", "fecha"],
        )
    return items


@router.get("/recomendaciones")
def obtener_recomendaciones(limit: int = Query(10, ge=1, le=50), user: dict = Depends(require_b2c_user)):
    usuario_id = user["record"]["id"]
    favoritos  = [r["fact_id"] for r in query_rows(FACT_IDS_FAVORITOS_USUARIO, {"usuario_id": usuario_id})]
    escuchados = [r["fact_id"] for r in query_rows(FACT_IDS_ESCUCHADOS_USUARIO, {"usuario_id": usuario_id})]
    # No recomendar lo que el usuario ya conoce (favorito o ya reproducido) —
    # no solo lo que marcó como favorito.
    excluidos  = list({*favoritos, *escuchados})

    secciones = []

    # 1. Hecho para ti — afinidad real al perfil de audio del usuario (change
    # p2-descubrimiento-comunidad). Antes esta sección ordenaba por distancia
    # solo DENTRO de los géneros más escuchados; ahora la distancia se evalúa
    # sobre todo el catálogo disponible con el género como peso, de modo que
    # puede sorprender con un track afín de un género vecino.
    perfil = query_one(PERFIL_AUDIO_FAVORITOS_E_HISTORIAL, {"usuario_id": usuario_id}) or {}
    generos_usuario = [
        r["genre_id"] for r in query_rows(GENEROS_MAS_ESCUCHADOS_USUARIO, {"usuario_id": usuario_id})
    ] or [
        r["genre_id"] for r in query_rows(GENEROS_FAVORITOS_USUARIO, {"usuario_id": usuario_id})
    ]

    if perfil.get("n_senales"):
        algoritmo = "afinidad_audio"
        fila_genero = query_one(GENERO_DOMINANTE_USUARIO, {"usuario_id": usuario_id}) or {}
        genero_dominante = fila_genero.get("genero") or ""
        motivo = (
            f"similar a tus favoritos de {genero_dominante}" if genero_dominante
            else "similar a lo que sueles escuchar"
        )
        tracks = query_rows(
            RECOMENDACIONES_POR_AFINIDAD,
            {
                "genre_ids": generos_usuario, "excluidos": excluidos, "limit": limit,
                **_params_perfil(perfil),
            },
        )
    else:
        # Sin ninguna señal de consumo: populares de géneros diversos.
        algoritmo = "popularidad_global"
        motivo = "popular ahora mismo"
        tracks = query_rows(RECOMENDACIONES_POPULARES, {"excluidos": excluidos, "limit": limit})

    secciones.append({
        "id": "hecho_para_ti", "titulo": "Hecho para ti",
        "data": _registrar_impresiones(usuario_id, algoritmo, tracks, motivo),
    })

    # 2. Novedades de artistas que sigues — ausente si no sigue a nadie o no
    # hay tracks nuevos, no una sección vacía.
    artistas_seguidos = [r["artista_id"] for r in query_rows(ARTISTAS_SEGUIDOS_POR_USUARIO, {"usuario_id": usuario_id})]
    if artistas_seguidos:
        tracks_novedades = query_rows(
            RECOMENDACIONES_NOVEDADES_ARTISTAS_SEGUIDOS,
            {"artist_ids": artistas_seguidos, "excluidos": excluidos, "limit": limit},
        )
        if tracks_novedades:
            secciones.append({
                "id": "novedades_seguidos", "titulo": "Novedades de artistas que sigues",
                "data": _registrar_impresiones(
                    usuario_id, "novedades_artistas_seguidos", tracks_novedades,
                    "novedad de un artista que sigues",
                ),
            })

    # 3. Redescubre — ausente si el usuario no tiene ningún favorito/reproducción todavía.
    tracks_redescubre = query_rows(REDESCUBRE_USUARIO, {"usuario_id": usuario_id, "limit": limit})
    if tracks_redescubre:
        secciones.append({
            "id": "redescubre", "titulo": "Redescubre",
            "data": _registrar_impresiones(
                usuario_id, "redescubre_historial_antiguo", tracks_redescubre,
                "lo escuchaste hace tiempo",
            ),
        })

    return {"secciones": secciones}


# ─────────────────────────────────────────────────────────────────────────────
# Radio y mix diario (change p2-descubrimiento-comunidad)
# ─────────────────────────────────────────────────────────────────────────────

RADIO_LIMITE = 25
MIX_TOTAL = 30
# ~20 % de exploración fuera de los géneros habituales: suficiente para que el
# mix no se cierre sobre sí mismo, sin desdibujar que es un mix personal.
MIX_EXPLORACION_N = 6


def _params_perfil(perfil: dict) -> dict:
    """Traduce un perfil de audio a los parámetros de la métrica de distancia.

    Los defaults neutrales evitan un 500 por parámetro nulo cuando el promedio
    viene vacío; `tempo` usa 120 BPM (tempo medio típico) en vez de 0, que
    sesgaría toda la distancia hacia los tracks más lentos del catálogo.
    """
    return {
        "p_danceability": perfil.get("danceability") or 0.5,
        "p_energy":       perfil.get("energy") or 0.5,
        "p_valence":      perfil.get("valence") or 0.5,
        "p_acousticness": perfil.get("acousticness") or 0.5,
        "p_tempo":        perfil.get("tempo") or 120.0,
    }


@router.get("/radio/track/{fact_id}")
def radio_por_track(fact_id: int, limit: int = Query(RADIO_LIMITE, ge=1, le=50)):
    """Radio basada en una canción: cola de tracks similares a la semilla."""
    semilla = query_one(TRACK_SEMILLA, {"fact_id": fact_id})
    # `query_one` sobre una agregación sin GROUP BY devuelve siempre una fila;
    # el track no existe (o no está disponible) cuando esa fila viene vacía.
    if not semilla or not semilla.get("track_name"):
        raise HTTPException(status_code=404, detail="Track no encontrado o no disponible")

    tracks = query_rows(
        RADIO_POR_TRACK,
        {
            "genre_ids": semilla.get("genre_ids") or [],
            "semilla_nombre": semilla["track_name"],
            "semilla_artista": semilla.get("artist_name") or "",
            "limit": limit,
            **_params_perfil(semilla),
        },
    )
    return {
        "semilla": {
            "fact_id": fact_id,
            "track_name": semilla["track_name"],
            "artist_name": semilla.get("artist_name"),
        },
        "data": tracks,
        "total": len(tracks),
    }


@router.get("/mix-diario")
def mix_diario(user: dict = Depends(require_b2c_user)):
    """Mix diario del usuario: estable dentro del día, distinto al siguiente.

    El determinismo viene de la semilla (usuario_id + fecha) que ordena la
    porción de exploración, y del desempate estable por nombre en la porción de
    afinidad. No se cachea nada: se recalcula igual cada vez.
    """
    usuario_id = user["record"]["id"]
    fecha = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    seed = f"{usuario_id}:{fecha}"

    perfil = query_one(PERFIL_AUDIO_FAVORITOS_E_HISTORIAL, {"usuario_id": usuario_id}) or {}
    generos = [
        r["genre_id"] for r in query_rows(GENEROS_MAS_ESCUCHADOS_USUARIO, {"usuario_id": usuario_id})
    ] or [
        r["genre_id"] for r in query_rows(GENEROS_FAVORITOS_USUARIO, {"usuario_id": usuario_id})
    ]

    # Sin señal de consumo no hay perfil que seguir: se degrada a populares.
    if not perfil.get("n_senales") or not generos:
        populares = query_rows(RECOMENDACIONES_POPULARES, {"excluidos": [], "limit": MIX_TOTAL})
        return {
            "fecha": fecha, "personalizado": False,
            "data": populares, "total": len(populares),
        }

    favoritos  = [r["fact_id"] for r in query_rows(FACT_IDS_FAVORITOS_USUARIO, {"usuario_id": usuario_id})]
    escuchados = [r["fact_id"] for r in query_rows(FACT_IDS_ESCUCHADOS_USUARIO, {"usuario_id": usuario_id})]
    excluidos  = list({*favoritos, *escuchados})

    afinidad = query_rows(
        MIX_AFINIDAD,
        {
            "genre_ids": generos, "excluidos": excluidos,
            "limit": MIX_TOTAL - MIX_EXPLORACION_N, **_params_perfil(perfil),
        },
    )
    exploracion = query_rows(
        MIX_EXPLORACION,
        {"genre_ids": generos, "excluidos": excluidos, "limit": MIX_EXPLORACION_N, "seed": seed},
    )

    # La exploración va al final y no intercalada: intercalar exigiría un
    # barajado que rompería el determinismo o habría que sembrarlo aparte, y la
    # cola se consume en orden de todos modos.
    return {
        "fecha": fecha, "personalizado": True,
        "data": afinidad + exploracion,
        "total": len(afinidad) + len(exploracion),
    }


# ─────────────────────────────────────────────────────────────────────────────
# 3. Tickets de soporte (RF-EXP-004/005, CU-O45..CU-O48)
# ─────────────────────────────────────────────────────────────────────────────

class TicketBody(BaseModel):
    asunto: str = Field(min_length=1, max_length=200)
    descripcion: str = Field(min_length=1, max_length=5000)
    # S13-P2 (patrón CRUD docente): admin puede crear un ticket EN NOMBRE de
    # un usuario (campo "usuario afectado" del formulario) — un usuario B2C
    # normal lo ignora y siempre crea a nombre propio, igual que antes.
    # `usuario_id` es un id de registro de PocketBase (15 caracteres típicos);
    # 64 deja margen sin permitir strings arbitrariamente largos.
    usuario_id: str | None = Field(None, min_length=1, max_length=64)


class ActualizarTicketBody(BaseModel):
    estado: Literal["abierto", "en_proceso", "resuelto", "cerrado"]


@router.post("/tickets", status_code=201)
def crear_ticket(body: TicketBody, user: dict = Depends(get_current_user)):
    asunto      = body.asunto.strip()
    descripcion = body.descripcion.strip()
    if not asunto or not descripcion:
        raise HTTPException(status_code=422, detail="El asunto y la descripción son requeridos")

    role = user.get("record", {}).get("role", "")
    if role == "admin" and body.usuario_id:
        # Admin crea el ticket en nombre de otro usuario (S13-P2) — no valida
        # contra DIM_USUARIO acá: el `usuario_id` viene de UserPicker
        # (frontend), que ya solo ofrece usuarios reales encontrados por
        # búsqueda, mismo criterio de confianza que el resto de los formularios
        # admin que usan ese componente (distribución, facturación, permisos).
        usuario_id = body.usuario_id
    elif role == "user":
        usuario_id = user["record"]["id"]
    else:
        raise HTTPException(status_code=403, detail="Los tickets de soporte son exclusivos de Usuario B2C o admin")
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


# Ver detalle (S13-P2, patrón CRUD docente) — mismo `TICKET_POR_ID` que ya
# usaba internamente `actualizar_ticket`, ahora expuesto como consulta propia.
@router.get("/tickets/{fact_id}")
def obtener_ticket(fact_id: int, admin: dict = Depends(require_admin)):
    ticket = query_one(TICKET_POR_ID, {"fact_id": fact_id})
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")
    return ticket


@router.put("/tickets/{fact_id}")
def actualizar_ticket(
    body: ActualizarTicketBody, fact_id: int = Path(..., ge=1), admin: dict = Depends(require_admin),
):
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

# Formato real de un ID de registro de PocketBase (15 caracteres en base32
# minúscula) — mismo hallazgo que `partners`/`biblioteca` (auditoría de
# validación): `pb_client.suscripcion_activa_de_usuario()` (este paquete)
# interpola `usuario_id` sin validar en un filtro armado por f-string
# (`f'usuario_o_cliente="{usuario_id}" && estado="activa"'`). `TitularBody.
# usuario_id` (admin-controlado, no viene de la sesión) llega directo a esa
# función vía `crear_titular` — un `usuario_id` con `"` rompe el filtro.
_PB_ID_PATTERN = r"^[a-z0-9]{15}$"


class TitularBody(BaseModel):
    usuario_id: str = Field(min_length=1, max_length=64, pattern=_PB_ID_PATTERN)


class MiembroBody(BaseModel):
    usuario_id: str = Field(min_length=1, max_length=64, pattern=_PB_ID_PATTERN)


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


@router.get("/familia/resolver-suscripcion/{usuario_id}")
async def resolver_suscripcion_de_usuario(
    usuario_id: str = Path(..., pattern=_PB_ID_PATTERN), admin: dict = Depends(require_admin),
):
    """UX (S11): el panel admin de plan familiar pedía `suscripcion_id` como
    texto libre — un ID de PocketBase que el humano no tiene forma de conocer.
    Se busca ahora por el usuario titular (`UserPicker`, ya usado arriba en la
    misma página) y se resuelve su suscripción premium activa aquí."""
    suscripcion = await pb_client.suscripcion_activa_de_usuario(usuario_id)
    if not suscripcion:
        raise HTTPException(status_code=404, detail="El usuario no tiene una suscripción activa")
    if suscripcion.get("tipo_plan") != "premium":
        raise HTTPException(status_code=403, detail="El plan familiar solo aplica a suscriptores del plan premium")
    return {"suscripcion_id": suscripcion["id"]}


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
def quitar_miembro(
    suscripcion_id: str,
    usuario_id: str = Path(..., pattern=_PB_ID_PATTERN),
    admin: dict = Depends(require_admin),
):
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


# ─────────────────────────────────────────────────────────────────────────────
# Plan familiar — autoservicio para el titular premium (CU-O51/52/53, además
# del flujo admin de arriba, que se conserva para soporte/override). En un
# entorno real, el usuario gestiona su propio plan familiar sin depender de
# un Lead Data Engineer — cambio 2026-07-09.
# ─────────────────────────────────────────────────────────────────────────────

# RFC 5321 acota la parte local a 64 octetos y el dominio a 255 — 254 es el
# límite práctico de una dirección completa citado por esa RFC.
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class MiembroEmailBody(BaseModel):
    email: str = Field(min_length=3, max_length=254)

    @field_validator("email")
    @classmethod
    def _validar_email(cls, v: str) -> str:
        v = v.strip()
        if not _EMAIL_RE.match(v):
            raise ValueError("El correo electrónico no tiene un formato válido")
        return v.lower()


@router.post("/familia", status_code=201)
async def crear_mi_plan_familiar(user: dict = Depends(require_b2c_user)):
    usuario_id = user["record"]["id"]
    if query_one(USUARIO_YA_EN_PLAN_FAMILIAR, {"usuario_id": usuario_id})["n"] > 0:
        raise HTTPException(status_code=409, detail="Ya eres titular o miembro de un plan familiar")

    suscripcion = await pb_client.suscripcion_activa_de_usuario(usuario_id)
    if not suscripcion:
        raise HTTPException(status_code=404, detail="No tienes una suscripción activa")
    if suscripcion.get("tipo_plan") != "premium":
        raise HTTPException(status_code=403, detail="El plan familiar solo aplica al plan Premium")

    suscripcion_id = suscripcion["id"]
    if query_one(SUSCRIPCION_TIENE_TITULAR, {"suscripcion_id": suscripcion_id})["n"] > 0:
        raise HTTPException(status_code=409, detail="Esta suscripción ya tiene un titular de plan familiar")

    get_client().insert(
        "BRIDGE_SUSCRIPTOR_FAMILIA",
        [(suscripcion_id, usuario_id, 1, datetime.now(timezone.utc))],
        column_names=["suscripcion_id", "usuario_id", "es_titular", "fecha_union"],
    )
    audit.record(
        usuario_id=usuario_id, accion="crear_titular_plan_familiar",
        tabla_afectada="BRIDGE_SUSCRIPTOR_FAMILIA", antes=None,
        despues={"suscripcion_id": suscripcion_id, "usuario_id": usuario_id},
    )
    return {"status": "ok", "suscripcion_id": suscripcion_id, "es_titular": True}


@router.get("/familia")
def mi_plan_familiar(user: dict = Depends(require_b2c_user)):
    usuario_id = user["record"]["id"]
    fila = query_one(SUSCRIPCION_FAMILIAR_DE_USUARIO, {"usuario_id": usuario_id})
    if not fila:
        return {"data": [], "total": 0, "limite": FAMILIA_LIMITE_MIEMBROS, "suscripcion_id": None, "es_titular": False}

    suscripcion_id = fila["suscripcion_id"]
    miembros = query_rows(MIEMBROS_DE_SUSCRIPCION, {"suscripcion_id": suscripcion_id})
    es_titular = any(m["usuario_id"] == usuario_id and m["es_titular"] for m in miembros)
    return {"data": miembros, "total": len(miembros), "limite": FAMILIA_LIMITE_MIEMBROS,
            "suscripcion_id": suscripcion_id, "es_titular": es_titular}


def _requiere_ser_titular(usuario_id: str) -> str:
    fila = query_one(SUSCRIPCION_FAMILIAR_DE_USUARIO, {"usuario_id": usuario_id})
    if not fila:
        raise HTTPException(status_code=404, detail="No tienes un plan familiar activo")
    suscripcion_id = fila["suscripcion_id"]
    if query_one(MIEMBRO_EXISTE, {"suscripcion_id": suscripcion_id, "usuario_id": usuario_id})["n"] == 0:
        raise HTTPException(status_code=404, detail="No tienes un plan familiar activo")
    es_titular = query_one(SUSCRIPCION_TIENE_TITULAR, {"suscripcion_id": suscripcion_id})
    titular_row = next(
        (m for m in query_rows(MIEMBROS_DE_SUSCRIPCION, {"suscripcion_id": suscripcion_id}) if m["es_titular"]),
        None,
    )
    if not titular_row or titular_row["usuario_id"] != usuario_id:
        raise HTTPException(status_code=403, detail="Solo el titular del plan familiar puede administrar miembros")
    return suscripcion_id


@router.post("/familia/miembros", status_code=201)
def agregar_mi_miembro(body: MiembroEmailBody, user: dict = Depends(require_b2c_user)):
    suscripcion_id = _requiere_ser_titular(user["record"]["id"])

    destino = query_one(USUARIO_POR_EMAIL, {"email": body.email})
    if not destino:
        raise HTTPException(status_code=404, detail="No existe un usuario registrado con ese correo")
    usuario_id = destino["usuario_id"]

    if query_one(USUARIO_YA_EN_PLAN_FAMILIAR, {"usuario_id": usuario_id})["n"] > 0:
        raise HTTPException(status_code=409, detail="Ese usuario ya es titular o miembro de un plan familiar")

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
        usuario_id=user["record"]["id"], accion="agregar_miembro_plan_familiar",
        tabla_afectada="BRIDGE_SUSCRIPTOR_FAMILIA", antes=None,
        despues={"suscripcion_id": suscripcion_id, "usuario_id": usuario_id},
    )
    return {"status": "ok", "usuario_id": usuario_id, "nombre": destino["nombre"], "total": total_actual + 1}


@router.delete("/familia/miembros/{usuario_id}")
def quitar_mi_miembro(usuario_id: str, user: dict = Depends(require_b2c_user)):
    suscripcion_id = _requiere_ser_titular(user["record"]["id"])
    if usuario_id == user["record"]["id"]:
        raise HTTPException(status_code=422, detail="El titular no puede quitarse a sí mismo del plan familiar")
    if query_one(MIEMBRO_EXISTE, {"suscripcion_id": suscripcion_id, "usuario_id": usuario_id})["n"] == 0:
        raise HTTPException(status_code=404, detail="Ese usuario no pertenece a tu plan familiar")

    execute(
        "ALTER TABLE BRIDGE_SUSCRIPTOR_FAMILIA DELETE "
        "WHERE suscripcion_id = {suscripcion_id:String} AND usuario_id = {usuario_id:String}",
        {"suscripcion_id": suscripcion_id, "usuario_id": usuario_id},
    )
    audit.record(
        usuario_id=user["record"]["id"], accion="quitar_miembro_plan_familiar",
        tabla_afectada="BRIDGE_SUSCRIPTOR_FAMILIA",
        antes={"suscripcion_id": suscripcion_id, "usuario_id": usuario_id}, despues=None,
    )
    return {"status": "ok"}


@router.get("/admin/dashboard")
def dashboard_experiencia(admin: dict = Depends(require_admin)):
    return {
        "tickets_por_estado":   query_rows(TICKETS_POR_ESTADO),
        "tickets_abiertos_total": (query_one(TICKETS_ABIERTOS_TOTAL) or {}).get("n", 0),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Reportes administrativos
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/admin/ab-tests")
def ab_tests_resumen(admin: dict = Depends(require_admin)):
    return {"tests": query_rows(AB_TESTS_RESUMEN)}


@router.get("/admin/familias")
async def familias_resumen(admin: dict = Depends(require_admin)):
    """Panel de plan familiar (RF-EXP-008): a diferencia de GET /familia/
    {suscripcion_id} (miembros de UNA familia ya conocida), este lista TODAS
    las familias activas. `plan` se enriquece con un lookup a PocketBase por
    familia — best-effort: si PocketBase falla o no encuentra el registro, se
    degrada a 'familiar' (el único plan que admite plan familiar hoy, ver
    crear_titular/crear_mi_plan_familiar arriba) sin tumbar el reporte."""
    familias = query_rows(FAMILIAS_RESUMEN)
    for f in familias:
        try:
            suscripcion = await pb_client.obtener_por_id(f["familia_id"])
            f["plan"] = (suscripcion or {}).get("tipo_plan") or "familiar"
        except Exception:
            f["plan"] = "familiar"
    return {"familias": familias}

