import random
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from core.database import execute, get_client, query_one, query_rows
from core.deps import get_current_user, require_b2c_user
from paquetes.seguridad import audit
from paquetes.seguridad.deps import require_admin
from paquetes.social.queries import (
    ARTISTA_EXISTE,
    ARTISTAS_SEGUIDOS_POR_USUARIO,
    COMENTARIO_PADRE_INFO,
    COMENTARIO_POR_ID,
    COMENTARIOS_VISIBLES_DE_TRACK,
    SEGUIMIENTO_ACTIVO_EXISTE,
    TRACK_EXISTE,
    comentarios_admin_sql,
)

router = APIRouter(prefix="/app/v1/social", tags=["Social"])

# DIM_TIPO_INTERACCION_SOCIAL es un catálogo fijo de 5 filas sembrado en
# init_clickhouse.py — no requiere una consulta para resolver el id al
# insertar (mismo patrón que _ESTADO_REVISION_ID en `creadores`).
_TIPO_INTERACCION_ID = {
    "comentario_raiz": 1,
    "comentario_respuesta": 2,
    "compartir_track": 3,
    "compartir_playlist": 4,
    "compartir_perfil_artista": 5,
}

_FACT_COMENTARIO_COLS = [
    "fact_id", "usuario_id", "fact_id_track", "tipo_interaccion_id",
    "comentario_padre_id", "contenido", "fecha_creacion",
    "estado_moderacion", "moderado_por", "fecha_moderacion",
]

_FACT_COMPARTICION_COLS = [
    "fact_id", "usuario_id", "fact_id_track", "artista_id", "playlist_id",
    "tipo_interaccion_id", "canal", "fecha",
]


def _gen_fact_id() -> int:
    # UInt64 aleatorio sin lock ni SELECT max()+1 (design.md, "`fact_id` de
    # `FACT_COMENTARIO`/`FACT_COMPARTICION`: `UInt64` aleatorio generado en
    # Python, sin lock" y "Riesgo aceptado: fact_id generado sin lock").
    # 50 bits, no 63: el frontend React consume este valor como JSON number
    # (Number.MAX_SAFE_INTEGER = 2^53-1) — 63 bits produce valores que pierden
    # precisión al pasar por JSON.parse en el cliente (comentario_padre_id y
    # el fact_id de moderación dejarían de coincidir con la fila real). 2^50
    # (~1.1e15) sigue siendo un espacio astronómicamente mayor al volumen
    # esperado de esta capability, la misma tolerancia al riesgo de colisión
    # ya aceptada en design.md, solo que dentro del rango seguro de JS.
    return random.getrandbits(50)


# ─────────────────────────────────────────────────────────────────────────────
# 1. Seguimiento de artistas (CU-O29/CU-O30/CU-O31)
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/seguimiento/{artista_id}", status_code=201)
def seguir_artista(artista_id: int, user: dict = Depends(require_b2c_user)):
    usuario_id = user["record"]["id"]
    if query_one(ARTISTA_EXISTE, {"artista_id": artista_id})["n"] == 0:
        raise HTTPException(status_code=404, detail="Artista no encontrado")
    if query_one(SEGUIMIENTO_ACTIVO_EXISTE, {"usuario_id": usuario_id, "artista_id": artista_id})["n"] > 0:
        raise HTTPException(status_code=409, detail="Ya sigues a este artista")

    get_client().insert(
        "BRIDGE_SEGUIMIENTO_ARTISTA",
        [(usuario_id, artista_id, datetime.now(timezone.utc), 1)],
        column_names=["usuario_id", "artista_id", "fecha_inicio", "activo"],
    )
    return {"status": "ok", "artista_id": artista_id}


@router.delete("/seguimiento/{artista_id}")
def dejar_de_seguir(artista_id: int, user: dict = Depends(require_b2c_user)):
    usuario_id = user["record"]["id"]
    if query_one(SEGUIMIENTO_ACTIVO_EXISTE, {"usuario_id": usuario_id, "artista_id": artista_id})["n"] == 0:
        raise HTTPException(status_code=404, detail="No sigues a este artista")

    execute(
        "ALTER TABLE BRIDGE_SEGUIMIENTO_ARTISTA UPDATE activo = 0 "
        "WHERE usuario_id = {usuario_id:String} AND artista_id = {artista_id:UInt32} AND activo = 1",
        {"usuario_id": usuario_id, "artista_id": artista_id},
    )
    return {"status": "ok", "artista_id": artista_id}


@router.get("/seguimiento")
def mis_seguidos(user: dict = Depends(get_current_user)):
    return {"data": query_rows(ARTISTAS_SEGUIDOS_POR_USUARIO, {"usuario_id": user["record"]["id"]})}


# ─────────────────────────────────────────────────────────────────────────────
# 2. Comentarios (CU-O32/CU-O33)
# ─────────────────────────────────────────────────────────────────────────────

class ComentarioBody(BaseModel):
    fact_id_track: int
    contenido: str
    comentario_padre_id: int | None = None


@router.post("/comentarios", status_code=201)
def comentar_track(body: ComentarioBody, user: dict = Depends(require_b2c_user)):
    if not body.contenido.strip():
        raise HTTPException(status_code=422, detail="El contenido del comentario no puede estar vacío")
    if query_one(TRACK_EXISTE, {"fact_id": body.fact_id_track})["n"] == 0:
        raise HTTPException(status_code=404, detail="Track no encontrado")

    tipo = "comentario_raiz"
    if body.comentario_padre_id is not None:
        padre = query_one(COMENTARIO_PADRE_INFO, {"fact_id": body.comentario_padre_id})
        if not padre:
            raise HTTPException(status_code=404, detail="Comentario padre no encontrado")
        if padre["fact_id_track"] != body.fact_id_track:
            raise HTTPException(status_code=422, detail="El comentario padre pertenece a otro track")
        tipo = "comentario_respuesta"

    usuario_id = user["record"]["id"]
    fact_id = _gen_fact_id()
    get_client().insert(
        "FACT_COMENTARIO",
        [(
            fact_id, usuario_id, body.fact_id_track, _TIPO_INTERACCION_ID[tipo],
            body.comentario_padre_id, body.contenido, datetime.now(timezone.utc),
            "visible", None, None,
        )],
        column_names=_FACT_COMENTARIO_COLS,
    )
    return {"status": "ok", "fact_id": fact_id, "estado_moderacion": "visible"}


@router.get("/comentarios/{fact_id_track}")
def listar_comentarios(fact_id_track: int, user: dict = Depends(get_current_user)):
    return {"data": query_rows(COMENTARIOS_VISIBLES_DE_TRACK, {"fact_id_track": fact_id_track})}


# ─────────────────────────────────────────────────────────────────────────────
# 3. Moderación de comentarios (CU-O34/CU-O35)
# ─────────────────────────────────────────────────────────────────────────────

class ModerarComentarioBody(BaseModel):
    decision: Literal["oculto", "eliminado"]


@router.post("/admin/comentarios/{fact_id}/moderar")
def moderar_comentario(fact_id: int, body: ModerarComentarioBody, admin: dict = Depends(require_admin)):
    comentario = query_one(COMENTARIO_POR_ID, {"fact_id": fact_id})
    if not comentario:
        raise HTTPException(status_code=404, detail="Comentario no encontrado")

    admin_id = admin["record"]["id"]
    execute(
        "ALTER TABLE FACT_COMENTARIO UPDATE estado_moderacion = {decision:String}, "
        "moderado_por = {admin_id:String}, fecha_moderacion = now() "
        "WHERE fact_id = {fact_id:UInt64}",
        {"decision": body.decision, "admin_id": admin_id, "fact_id": fact_id},
    )
    audit.record(
        usuario_id=admin_id,
        accion="moderacion_comentario",
        tabla_afectada="FACT_COMENTARIO",
        antes={"fact_id": fact_id, "estado_moderacion": comentario["estado_moderacion"]},
        despues={"fact_id": fact_id, "estado_moderacion": body.decision},
    )
    return {"status": "ok", "fact_id": fact_id, "estado_moderacion": body.decision}


@router.get("/admin/comentarios", dependencies=[Depends(require_admin)])
def listar_comentarios_admin(
    fact_id_track: int | None = Query(None),
    estado: str | None = Query(None),
):
    clauses, params = [], {}
    if fact_id_track is not None:
        clauses.append("c.fact_id_track = {fact_id_track:UInt64}")
        params["fact_id_track"] = fact_id_track
    if estado:
        clauses.append("c.estado_moderacion = {estado:String}")
        params["estado"] = estado
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    return {"data": query_rows(comentarios_admin_sql(where), params)}


# ─────────────────────────────────────────────────────────────────────────────
# 4. Compartir contenido (CU-O36)
# ─────────────────────────────────────────────────────────────────────────────

class ComparticionBody(BaseModel):
    tipo_interaccion_id: Literal["compartir_track", "compartir_playlist", "compartir_perfil_artista"]
    canal: Literal["x", "whatsapp", "copiar_enlace"]
    fact_id_track: int | None = None
    artista_id: int | None = None
    playlist_id: str | None = None


def _armar_contenido_compartir(body: ComparticionBody) -> dict:
    # Simulación (sin llamada real a X/WhatsApp — design.md, `FACT_COMPARTICION`:
    # solo registra intención). No se resuelve el nombre real del objeto: alcanzaría
    # con el mismo nivel de simulación ya aceptado para los pagos en `facturacion`.
    if body.tipo_interaccion_id == "compartir_track":
        ruta = f"/track/{body.fact_id_track}"
    elif body.tipo_interaccion_id == "compartir_perfil_artista":
        ruta = f"/artista/{body.artista_id}"
    else:
        ruta = f"/playlist/{body.playlist_id}"
    enlace = f"https://tracklytics.app{ruta}"
    if body.canal == "copiar_enlace":
        return {"contenido": enlace}
    return {"contenido": f"Escucha esto en Tracklytics: {enlace}"}


@router.post("/comparticiones", status_code=201)
def compartir(body: ComparticionBody, user: dict = Depends(require_b2c_user)):
    if body.tipo_interaccion_id == "compartir_track":
        if body.fact_id_track is None:
            raise HTTPException(status_code=422, detail="fact_id_track es requerido para compartir_track")
        if query_one(TRACK_EXISTE, {"fact_id": body.fact_id_track})["n"] == 0:
            raise HTTPException(status_code=404, detail="Track no encontrado")
    elif body.tipo_interaccion_id == "compartir_perfil_artista":
        if body.artista_id is None:
            raise HTTPException(status_code=422, detail="artista_id es requerido para compartir_perfil_artista")
        if query_one(ARTISTA_EXISTE, {"artista_id": body.artista_id})["n"] == 0:
            raise HTTPException(status_code=404, detail="Artista no encontrado")
    else:  # compartir_playlist — sin validación de existencia (design.md)
        if not body.playlist_id:
            raise HTTPException(status_code=422, detail="playlist_id es requerido para compartir_playlist")

    usuario_id = user["record"]["id"]
    fact_id = _gen_fact_id()
    get_client().insert(
        "FACT_COMPARTICION",
        [(
            fact_id, usuario_id, body.fact_id_track, body.artista_id, body.playlist_id,
            _TIPO_INTERACCION_ID[body.tipo_interaccion_id], body.canal, datetime.now(timezone.utc),
        )],
        column_names=_FACT_COMPARTICION_COLS,
    )
    return {"status": "ok", "fact_id": fact_id, **_armar_contenido_compartir(body)}
