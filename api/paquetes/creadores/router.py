import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from core.database import get_client, query_one, query_rows
from core.deps import get_current_user
from paquetes.creadores.deps import require_admin, require_cuenta_artista_aprobada
from paquetes.creadores.promocion import NEUTRAL_AUDIO_DEFAULTS, promover_a_fact_tracks
from paquetes.creadores.queries import (
    ARTIST_ID_POR_NOMBRE, CUENTA_ACTUAL_POR_ID, CUENTA_ACTUAL_POR_USUARIO, CUENTA_EXISTE_POR_USUARIO,
    CUENTAS_ARTISTA_TOTAL, GENERO_EXISTE, SUBIDA_ACTUAL_POR_ID, SUBIDAS_POR_CUENTA,
    SUBIDAS_POR_ESTADO, cuentas_admin_sql, subidas_admin_sql,
)
from paquetes.seguridad import audit
from paquetes.social import notificaciones

router = APIRouter(prefix="/app/v1/creadores", tags=["Creadores"])

_DIM_CUENTA_COLS = [
    "cuenta_artista_id", "usuario_id", "nombre_artistico", "estado_cuenta",
    "fecha_solicitud", "fecha_resolucion", "admin_resolutor_id",
]

_FACT_SUBIDA_COLS = [
    "subida_id", "cuenta_artista_id", "staging_id", "estado_revision_id",
    "fecha_subida", "fecha_resolucion", "admin_resolutor_id", "fact_id_promovido",
]

# DIM_ESTADO_REVISION es un catálogo fijo de 3 filas sembrado en init_clickhouse.py
# (pendiente=1, aprobado=2, rechazado=3) — no requiere una consulta para resolver
# el id al insertar, solo al aprobar/rechazar.
_ESTADO_REVISION_ID = {"pendiente": 1, "aprobado": 2, "rechazado": 3}


# ─────────────────────────────────────────────────────────────────────────────
# 1. Solicitud y resolución de cuenta de artista (CU-O24/CU-O25)
# ─────────────────────────────────────────────────────────────────────────────

class SolicitudCuentaBody(BaseModel):
    nombre_artistico: str


class ResolverCuentaBody(BaseModel):
    decision: Literal["aprobar", "rechazar"]


@router.post("/cuenta", status_code=201)
def solicitar_cuenta(body: SolicitudCuentaBody, user: dict = Depends(get_current_user)):
    usuario_id = user["record"]["id"]
    ya_existe = query_one(CUENTA_EXISTE_POR_USUARIO, {"usuario_id": usuario_id})["n"] > 0
    if ya_existe:
        raise HTTPException(status_code=409, detail="Ya existe una cuenta de artista asociada a este usuario")

    cuenta_artista_id = str(uuid.uuid4())
    get_client().insert(
        "DIM_CUENTA_ARTISTA",
        [(
            cuenta_artista_id, usuario_id, body.nombre_artistico, "pendiente",
            datetime.now(timezone.utc), None, None,
        )],
        column_names=_DIM_CUENTA_COLS,
    )
    return {"status": "ok", "cuenta_artista_id": cuenta_artista_id, "estado_cuenta": "pendiente"}


@router.get("/cuenta")
def mi_cuenta(user: dict = Depends(get_current_user)):
    cuenta = query_one(CUENTA_ACTUAL_POR_USUARIO, {"usuario_id": user["record"]["id"]})
    if not cuenta:
        raise HTTPException(status_code=404, detail="No has solicitado una cuenta de artista")
    return cuenta


@router.get("/admin/cuentas", dependencies=[Depends(require_admin)])
def listar_cuentas_admin(estado: str | None = Query(None)):
    where, params = "", {}
    if estado:
        where = "WHERE estado_cuenta = {estado:String}"
        params["estado"] = estado
    return {"data": query_rows(cuentas_admin_sql(where), params)}


@router.post("/admin/cuentas/{cuenta_artista_id}/resolver")
def resolver_cuenta(cuenta_artista_id: str, body: ResolverCuentaBody, admin: dict = Depends(require_admin)):
    cuenta = query_one(CUENTA_ACTUAL_POR_ID, {"cuenta_artista_id": cuenta_artista_id})
    if not cuenta:
        raise HTTPException(status_code=404, detail="Cuenta de artista no encontrada")
    if cuenta["estado_cuenta"] != "pendiente":
        raise HTTPException(
            status_code=409,
            detail=f"La cuenta ya fue resuelta (estado actual: {cuenta['estado_cuenta']})",
        )

    nuevo_estado = "aprobada" if body.decision == "aprobar" else "rechazada"
    admin_id = admin["record"]["id"]

    get_client().insert(
        "DIM_CUENTA_ARTISTA",
        [(
            cuenta_artista_id, cuenta["usuario_id"], cuenta["nombre_artistico"], nuevo_estado,
            cuenta["fecha_solicitud"], datetime.now(timezone.utc), admin_id,
        )],
        column_names=_DIM_CUENTA_COLS,
    )
    audit.record(
        usuario_id=admin_id,
        accion="resolucion_cuenta_artista",
        tabla_afectada="DIM_CUENTA_ARTISTA",
        antes={"cuenta_artista_id": cuenta_artista_id, "estado_cuenta": "pendiente"},
        despues={"cuenta_artista_id": cuenta_artista_id, "estado_cuenta": nuevo_estado},
    )
    return {"status": "ok", "cuenta_artista_id": cuenta_artista_id, "estado_cuenta": nuevo_estado}


# ─────────────────────────────────────────────────────────────────────────────
# 2. Subida y resolución de tracks individuales (CU-O26/CU-O27)
# ─────────────────────────────────────────────────────────────────────────────

class SubidaTrackBody(BaseModel):
    track_name: str
    album_name: str = ""
    genre_id: int
    duration_ms: int
    explicit: bool = False


class ResolverTrackBody(BaseModel):
    decision: Literal["aprobar", "rechazar"]


@router.post("/tracks", status_code=201)
def subir_track(body: SubidaTrackBody, cuenta: dict = Depends(require_cuenta_artista_aprobada)):
    genero_existe = query_one(GENERO_EXISTE, {"genre_id": body.genre_id})["n"] > 0
    if not genero_existe:
        raise HTTPException(status_code=422, detail="El género indicado no existe")

    staging_id = str(uuid.uuid4())
    d = NEUTRAL_AUDIO_DEFAULTS
    get_client().insert(
        "STG_ARTIST_UPLOADS",
        [(
            staging_id, cuenta["cuenta_artista_id"], body.track_name, body.album_name,
            body.genre_id, body.duration_ms, int(body.explicit),
            d["danceability"], d["energy"], d["key"], d["loudness"], d["mode"],
            d["speechiness"], d["acousticness"], d["instrumentalness"], d["liveness"],
            d["valence"], d["tempo"], d["time_signature"],
        )],
        column_names=[
            "staging_id", "cuenta_artista_id", "track_name", "album_name", "genre_id",
            "duration_ms", "explicit", "danceability", "energy", "key", "loudness",
            "mode", "speechiness", "acousticness", "instrumentalness", "liveness",
            "valence", "tempo", "time_signature",
        ],
    )

    subida_id = str(uuid.uuid4())
    get_client().insert(
        "FACT_SUBIDA_TRACK",
        [(
            subida_id, cuenta["cuenta_artista_id"], staging_id, _ESTADO_REVISION_ID["pendiente"],
            datetime.now(timezone.utc), None, None, None,
        )],
        column_names=_FACT_SUBIDA_COLS,
    )
    return {"status": "ok", "subida_id": subida_id, "estado": "pendiente"}


@router.get("/tracks")
def mis_tracks(user: dict = Depends(get_current_user)):
    cuenta = query_one(CUENTA_ACTUAL_POR_USUARIO, {"usuario_id": user["record"]["id"]})
    if not cuenta:
        return {"data": []}
    return {"data": query_rows(SUBIDAS_POR_CUENTA, {"cuenta_artista_id": cuenta["cuenta_artista_id"]})}


@router.get("/admin/tracks", dependencies=[Depends(require_admin)])
def listar_tracks_admin(estado: str | None = Query(None)):
    where, params = "", {}
    if estado:
        where = "WHERE er.nombre = {estado:String}"
        params["estado"] = estado
    return {"data": query_rows(subidas_admin_sql(where), params)}


@router.post("/admin/tracks/{subida_id}/resolver")
async def resolver_track(subida_id: str, body: ResolverTrackBody, admin: dict = Depends(require_admin)):
    subida = query_one(SUBIDA_ACTUAL_POR_ID, {"subida_id": subida_id})
    if not subida:
        raise HTTPException(status_code=404, detail="Subida no encontrada")
    if subida["estado_nombre"] != "pendiente":
        raise HTTPException(
            status_code=409,
            detail=f"La subida ya fue resuelta (estado actual: {subida['estado_nombre']})",
        )

    admin_id = admin["record"]["id"]
    fact_id_promovido = None

    if body.decision == "aprobar":
        cuenta = query_one(CUENTA_ACTUAL_POR_ID, {"cuenta_artista_id": subida["cuenta_artista_id"]})
        fact_id_promovido = await promover_a_fact_tracks(subida, cuenta["nombre_artistico"])
        nuevo_estado, nuevo_estado_id = "aprobado", _ESTADO_REVISION_ID["aprobado"]
    else:
        nuevo_estado, nuevo_estado_id = "rechazado", _ESTADO_REVISION_ID["rechazado"]

    get_client().insert(
        "FACT_SUBIDA_TRACK",
        [(
            subida_id, subida["cuenta_artista_id"], subida["staging_id"], nuevo_estado_id,
            subida["fecha_subida"], datetime.now(timezone.utc), admin_id, fact_id_promovido,
        )],
        column_names=_FACT_SUBIDA_COLS,
    )
    audit.record(
        usuario_id=admin_id,
        accion="resolucion_subida_track",
        tabla_afectada="FACT_SUBIDA_TRACK",
        antes={"subida_id": subida_id, "estado": "pendiente"},
        despues={"subida_id": subida_id, "estado": nuevo_estado, "fact_id_promovido": fact_id_promovido},
    )

    # Notificaciones (S10 ronda 2): un track aprobado notifica a todos los
    # seguidores activos del artista. El vínculo artist_id se resuelve por
    # nombre_artistico (mismo join "suave" que `promocion.py`) — si el
    # artista no existiera todavía en DIM_ARTISTS esto sería un bug de
    # promover_a_fact_tracks (ya lo crea si falta), así que siempre resuelve.
    if body.decision == "aprobar" and fact_id_promovido is not None:
        artista = query_one(ARTIST_ID_POR_NOMBRE, {"name": cuenta["nombre_artistico"]})
        if artista:
            notificaciones.crear_para_seguidores_de_artista(
                artista["artist_id"], "nuevo_track_artista_seguido", "track", str(fact_id_promovido),
                f"Nuevo track de {cuenta['nombre_artistico']}: {subida['track_name']}",
            )

    return {"status": "ok", "subida_id": subida_id, "estado": nuevo_estado, "fact_id_promovido": fact_id_promovido}


@router.get("/admin/dashboard")
def dashboard_creadores(admin: dict = Depends(require_admin)):
    return {
        "subidas_por_estado":   query_rows(SUBIDAS_POR_ESTADO),
        "cuentas_artista_total": (query_one(CUENTAS_ARTISTA_TOTAL) or {}).get("n", 0),
    }
