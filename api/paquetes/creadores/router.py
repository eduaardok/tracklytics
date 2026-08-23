import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from pydantic import BaseModel, Field, field_validator

from core.database import execute, get_client, query_one, query_rows
from core.deps import get_current_user
from paquetes.creadores.deps import require_admin, require_admin_lectura_cuentas, require_cuenta_artista_aprobada
from paquetes.creadores.promocion import (
    NEUTRAL_AUDIO_DEFAULTS, perfil_audio_por_genero, promover_a_fact_tracks,
)
from paquetes.creadores.queries import (
    ANALITICA_ARTISTA_POR_TRACK, ANALITICA_ARTISTA_SERIE,
    ARTIST_ID_POR_NOMBRE, CUENTA_ACTUAL_POR_ID, CUENTA_ACTUAL_POR_USUARIO, CUENTA_EXISTE_POR_USUARIO,
    CUENTAS_ARTISTA_TOTAL, GENERO_EXISTE, SUBIDA_ACTUAL_POR_ID, SUBIDA_MAX_VERSION, SUBIDAS_POR_CUENTA,
    SUBIDAS_POR_ESTADO, cuentas_admin_sql, subidas_admin_sql,
)
from paquetes.seguridad import audit
from paquetes.seguridad.deps import require_email_verificado
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
_ESTADO_REVISION_ID = {"pendiente": 1, "aprobado": 2, "rechazado": 3, "retirado": 4}

# Columnas de FACT_SUBIDA_TRACK incluyendo `version` — la edición y el retiro
# (change p1-ciclos-vida) insertan una fila nueva con version = max+1 para
# ganar el argMax(estado_revision_id, version) de forma determinista.
_FACT_SUBIDA_COLS_VER = _FACT_SUBIDA_COLS + ["version"]


# ─────────────────────────────────────────────────────────────────────────────
# 1. Solicitud y resolución de cuenta de artista (CU-O24/CU-O25)
# ─────────────────────────────────────────────────────────────────────────────

class SolicitudCuentaBody(BaseModel):
    nombre_artistico: str = Field(min_length=1, max_length=150)

    @field_validator("nombre_artistico")
    @classmethod
    def _limpiar_nombre(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("El nombre artístico no puede estar vacío")
        return v


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


@router.get("/admin/cuentas", dependencies=[Depends(require_admin_lectura_cuentas)])
def listar_cuentas_admin(estado: str | None = Query(None)):
    where, params = "", {}
    if estado:
        where = "WHERE estado_cuenta = {estado:String}"
        params["estado"] = estado
    return {"data": query_rows(cuentas_admin_sql(where), params)}


@router.post("/admin/cuentas/{cuenta_artista_id}/resolver")
def resolver_cuenta(
    body: ResolverCuentaBody,
    cuenta_artista_id: str = Path(..., min_length=1, max_length=64),
    admin: dict = Depends(require_admin),
):
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
    track_name: str = Field(min_length=1, max_length=200)
    album_name: str = Field(default="", max_length=200)
    # Multi-género (S16 — auditoría de revisores): el dataset base ya modela
    # N:M track-género vía filas repetidas por `track_id` en FACT_TRACKS
    # (confirmado antes de este cambio, ver `promover_a_fact_tracks`); lo que
    # faltaba era que la subida de artista lo aceptara. Tope de 5, igual que
    # el máximo real observado en tracks del catálogo con más géneros.
    genre_ids: list[int] = Field(min_length=1, max_length=5)
    # Rango real observado en FACT_TRACKS: min=0 (artefacto de datos heredado
    # de la ingesta original, no un caso de negocio real), max≈5.24M ms
    # (~87 min). Para una subida NUEVA de un artista, ge=1000 (mínimo 1
    # segundo — 0 no es un track real) y le=10_800_000 (3 horas, generoso
    # sobre el máximo observado para permitir DJ sets/podcasts sin abrir la
    # puerta a un valor absurdo).
    duration_ms: int = Field(ge=1000, le=10_800_000)
    explicit: bool = False

    @field_validator("track_name")
    @classmethod
    def _limpiar_track_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("El nombre del track no puede estar vacío")
        return v

    @field_validator("album_name")
    @classmethod
    def _limpiar_album_name(cls, v: str) -> str:
        return v.strip()

    @field_validator("genre_ids")
    @classmethod
    def _generos_unicos(cls, v: list[int]) -> list[int]:
        # Orden estable (dict.fromkeys en vez de set()) — el primer género
        # sigue siendo el "principal" (perfil de audio, columna genre_id de
        # compatibilidad), da igual en qué orden el usuario los marcó.
        return list(dict.fromkeys(v))


class ResolverTrackBody(BaseModel):
    decision: Literal["aprobar", "rechazar"]


@router.post("/tracks", status_code=201)
def subir_track(
    body: SubidaTrackBody,
    cuenta: dict = Depends(require_cuenta_artista_aprobada),
    _verificado: dict = Depends(require_email_verificado),
):
    for genre_id in body.genre_ids:
        if query_one(GENERO_EXISTE, {"genre_id": genre_id})["n"] == 0:
            raise HTTPException(status_code=422, detail=f"El género indicado no existe: {genre_id}")

    staging_id = str(uuid.uuid4())
    # Perfil de audio calibrado contra el género principal (el primero
    # marcado) — perfiles neutros de todos modos (design.md, sin DSP real),
    # no hace falta promediar entre géneros.
    d = {**NEUTRAL_AUDIO_DEFAULTS, **perfil_audio_por_genero(body.genre_ids[0])}
    get_client().insert(
        "STG_ARTIST_UPLOADS",
        [(
            staging_id, cuenta["cuenta_artista_id"], body.track_name, body.album_name,
            body.genre_ids[0], body.genre_ids, body.duration_ms, int(body.explicit),
            d["danceability"], d["energy"], d["key"], d["loudness"], d["mode"],
            d["speechiness"], d["acousticness"], d["instrumentalness"], d["liveness"],
            d["valence"], d["tempo"], d["time_signature"],
        )],
        column_names=[
            "staging_id", "cuenta_artista_id", "track_name", "album_name", "genre_id", "genre_ids",
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
async def resolver_track(
    body: ResolverTrackBody,
    subida_id: str = Path(..., min_length=1, max_length=64),
    admin: dict = Depends(require_admin),
):
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


# ── Edición y retiro de un track propio por el artista (change p1-ciclos-vida) ─

class EditarTrackBody(BaseModel):
    track_name: str | None = Field(default=None, min_length=1, max_length=200)
    album_name: str | None = Field(default=None, max_length=200)
    genre_ids: list[int] | None = Field(default=None, min_length=1, max_length=5)
    descripcion: str | None = Field(default=None, max_length=2000)

    @field_validator("genre_ids")
    @classmethod
    def _generos_unicos(cls, v: list[int] | None) -> list[int] | None:
        return list(dict.fromkeys(v)) if v is not None else v


def _subida_propia_o_error(subida_id: str, cuenta: dict) -> dict:
    subida = query_one(SUBIDA_ACTUAL_POR_ID, {"subida_id": subida_id})
    if not subida:
        raise HTTPException(status_code=404, detail="Track no encontrado")
    if subida["cuenta_artista_id"] != cuenta["cuenta_artista_id"]:
        raise HTTPException(status_code=403, detail="Este track no pertenece a tu cuenta de artista")
    return subida


def _siguiente_version(subida_id: str) -> int:
    return int((query_one(SUBIDA_MAX_VERSION, {"subida_id": subida_id}) or {}).get("v") or 0) + 1


@router.put("/tracks/{subida_id}")
def editar_track(
    body: EditarTrackBody,
    subida_id: str = Path(..., min_length=1, max_length=64),
    cuenta: dict = Depends(require_cuenta_artista_aprobada),
):
    """El artista edita la metadata de un track propio. Si el track estaba
    `aprobado`, vuelve a `pendiente` para revisión editorial."""
    subida = _subida_propia_o_error(subida_id, cuenta)
    if subida["estado_nombre"] == "retirado":
        raise HTTPException(status_code=409, detail="Un track retirado no puede editarse")

    sets, params = [], {"sid": subida["staging_id"]}
    if body.track_name is not None:
        if not body.track_name.strip():
            raise HTTPException(status_code=422, detail="El nombre del track no puede estar vacío")
        sets.append("track_name = {tn:String}"); params["tn"] = body.track_name.strip()
    if body.album_name is not None:
        sets.append("album_name = {al:String}"); params["al"] = body.album_name.strip()
    if body.genre_ids is not None:
        for genre_id in body.genre_ids:
            if query_one(GENERO_EXISTE, {"genre_id": genre_id})["n"] == 0:
                raise HTTPException(status_code=422, detail=f"El género indicado no existe: {genre_id}")
        sets.append("genre_id = {gid:UInt16}"); params["gid"] = body.genre_ids[0]
        sets.append("genre_ids = {gids:Array(UInt16)}"); params["gids"] = body.genre_ids
    if body.descripcion is not None:
        sets.append("descripcion = {desc:String}"); params["desc"] = body.descripcion.strip()
    if not sets:
        raise HTTPException(status_code=422, detail="No se enviaron campos a editar")

    execute(f"ALTER TABLE STG_ARTIST_UPLOADS UPDATE {', '.join(sets)} WHERE staging_id = {{sid:String}}", params)

    volvio_a_pendiente = subida["estado_nombre"] == "aprobado"
    if volvio_a_pendiente:
        # Un track aprobado editado vuelve a revisión: fila nueva pendiente con
        # version+1. Se conserva fact_id_promovido para trazabilidad.
        get_client().insert(
            "FACT_SUBIDA_TRACK",
            [(
                subida_id, subida["cuenta_artista_id"], subida["staging_id"], _ESTADO_REVISION_ID["pendiente"],
                subida["fecha_subida"], None, None, subida["fact_id_promovido"], _siguiente_version(subida_id),
            )],
            column_names=_FACT_SUBIDA_COLS_VER,
        )
    audit.record(
        usuario_id=cuenta["usuario_id"], accion="editar_track_artista",
        tabla_afectada="STG_ARTIST_UPLOADS", antes={"subida_id": subida_id, "estado": subida["estado_nombre"]},
        despues={"subida_id": subida_id, "campos": [k for k in params if k != "sid"],
                 "volvio_a_pendiente": volvio_a_pendiente},
    )
    return {"status": "ok", "subida_id": subida_id,
            "estado": "pendiente" if volvio_a_pendiente else subida["estado_nombre"]}


@router.post("/tracks/{subida_id}/retirar")
def retirar_track(
    subida_id: str = Path(..., min_length=1, max_length=64),
    cuenta: dict = Depends(require_cuenta_artista_aprobada),
):
    """El artista retira un track propio: estado `retirado` + takedown en el
    catálogo (disponible=0 sobre el track promovido, si existe)."""
    subida = _subida_propia_o_error(subida_id, cuenta)
    if subida["estado_nombre"] == "retirado":
        raise HTTPException(status_code=409, detail="El track ya está retirado")

    get_client().insert(
        "FACT_SUBIDA_TRACK",
        [(
            subida_id, subida["cuenta_artista_id"], subida["staging_id"], _ESTADO_REVISION_ID["retirado"],
            subida["fecha_subida"], datetime.now(timezone.utc), cuenta["usuario_id"],
            subida["fact_id_promovido"], _siguiente_version(subida_id),
        )],
        column_names=_FACT_SUBIDA_COLS_VER,
    )
    fact_id = subida["fact_id_promovido"]
    if fact_id is not None:
        # Por track_id (= staging_id), no por `fact_id_promovido` (S16): un
        # track multi-género promueve a varias filas de FACT_TRACKS que
        # comparten `track_id` pero tienen `fact_id` distinto — filtrar por un
        # solo `fact_id` solo ocultaría el género "principal" y dejaría el
        # resto visible en el catálogo. Mismo criterio que el takedown
        # administrativo (`catalogo` router).
        execute(
            "ALTER TABLE FACT_TRACKS UPDATE disponible = 0 WHERE track_id = {tid:String}",
            {"tid": subida["staging_id"]},
        )
    audit.record(
        usuario_id=cuenta["usuario_id"], accion="retirar_track_artista",
        tabla_afectada="FACT_SUBIDA_TRACK", antes={"subida_id": subida_id, "estado": subida["estado_nombre"]},
        despues={"subida_id": subida_id, "estado": "retirado", "fact_id_ocultado": fact_id},
    )
    return {"status": "ok", "subida_id": subida_id, "estado": "retirado", "disponible": 0}


@router.get("/admin/dashboard")
def dashboard_creadores(admin: dict = Depends(require_admin)):
    return {
        "subidas_por_estado":   query_rows(SUBIDAS_POR_ESTADO),
        "cuentas_artista_total": (query_one(CUENTAS_ARTISTA_TOTAL) or {}).get("n", 0),
    }


# ── Analítica propia del artista (R2, S16-P9) ────────────────────────────────
# Engagement real (plays/likes/favoritos netos/oyentes únicos) sobre SOLO los
# tracks promovidos de la cuenta del artista que pregunta — el gap que
# CuentaArtistaPage tenía documentado desde F2. Lectura pura: sin audit ni
# mutación. El gating es el mismo criterio de mis-ganancias (cuenta aprobada),
# pero 403 en vez de vacío para que la UI distinga "sin cuenta" de "sin datos".

@router.get("/mi-analitica")
def mi_analitica(user: dict = Depends(get_current_user)):
    cuenta = query_one(CUENTA_ACTUAL_POR_USUARIO, {"usuario_id": user["record"]["id"]})
    if not cuenta or cuenta["estado_cuenta"] != "aprobada":
        raise HTTPException(status_code=403, detail="Requiere una cuenta de artista aprobada")

    subidas = query_rows(SUBIDAS_POR_CUENTA, {"cuenta_artista_id": cuenta["cuenta_artista_id"]})
    # Solo subidas promovidas a FACT_TRACKS tienen engagement posible.
    publicados = [
        (s["track_name"], int(s["fact_id_promovido"]))
        for s in subidas
        if s.get("fact_id_promovido")
    ]
    if not publicados:
        return {
            "data": {
                "totales": {"plays": 0, "likes": 0, "favoritos": 0, "oyentes": 0},
                "serie": [],
                "tracks": [],
            },
        }

    fact_ids = [f for _, f in publicados]
    nombres = dict(publicados)

    por_track = {
        r["fact_id"]: r
        for r in query_rows(ANALITICA_ARTISTA_POR_TRACK, {"fact_ids": fact_ids})
    }
    serie = query_rows(ANALITICA_ARTISTA_SERIE, {"fact_ids": fact_ids})

    tracks_out = []
    totales = {"plays": 0, "likes": 0, "favoritos": 0, "oyentes": 0}
    for nombre, fid in publicados:
        m = por_track.get(fid, {})
        plays, likes = int(m.get("plays", 0)), int(m.get("likes", 0))
        favoritos, oyentes = int(m.get("favoritos", 0)), int(m.get("oyentes", 0))
        tracks_out.append({
            "fact_id": fid, "track_name": nombre,
            "plays": plays, "likes": likes, "favoritos": favoritos, "oyentes": oyentes,
        })
        totales["plays"] += plays
        totales["likes"] += likes
        totales["favoritos"] += favoritos
        totales["oyentes"] += oyentes

    # Los tracks con más streams primero — el orden que espera el panel.
    tracks_out.sort(key=lambda t: t["plays"], reverse=True)
    return {"data": {"totales": totales, "serie": serie, "tracks": tracks_out}}
