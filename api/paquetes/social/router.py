import random
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Path, Query, Request
from pydantic import BaseModel, Field

from core.database import execute, get_client, query_one, query_rows
from core.deps import get_current_user, require_b2c_user
from core.featuring import enriquecer_featuring
from paquetes.biblioteca import pb_playlists
from paquetes.biblioteca.queries import TRACKS_BY_FACT_IDS
from paquetes.seguridad import audit, strikes
from paquetes.seguridad.deps import require_email_verificado, require_rol_admin

# Autorización administrativa segmentada (change roles-gestion-usuarios): la
# moderación de comentarios y el dashboard social pertenecen al área de
# comunidad. `superadmin` siempre pasa.
require_admin = require_rol_admin("admin_comunidad")
from paquetes.social import notificaciones
from paquetes.social.queries import (
    ACTIVIDAD_SOCIAL_POR_DIA,
    ARTISTA_EXISTE,
    ARTISTAS_MAS_SEGUIDOS,
    ARTISTAS_SEGUIDOS_POR_USUARIO,
    AUTOR_TRACK_POR_FACT_ID,
    BLOQUEO_VIGENTE,
    COMENTARIO_PADRE_INFO,
    COMENTARIO_POR_ID,
    COMENTARIOS_VISIBLES_DE_TRACK,
    DENUNCIA_POR_ID,
    FEED_ACTIVIDAD_SEGUIDOS,
    ME_BLOQUEO,
    MIS_BLOQUEADOS,
    NOTIFICACION_POR_ID,
    NOTIFICACIONES_ADMIN,
    NOTIFICACIONES_DE_USUARIO,
    NOTIFICACIONES_NO_LEIDAS_TOTAL,
    PERFIL_PUBLICO_USUARIO,
    SEGUIMIENTO_ACTIVO_EXISTE,
    TRACK_EXISTE,
    USUARIO_EXISTE,
    comentarios_admin_count_sql,
    comentarios_admin_sql,
    denuncias_admin_sql,
    denuncias_count_sql,
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
def seguir_artista(artista_id: int = Path(..., ge=1), user: dict = Depends(require_b2c_user)):
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
def dejar_de_seguir(artista_id: int = Path(..., ge=1), user: dict = Depends(require_b2c_user)):
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


@router.get("/feed")
def feed_actividad(user: dict = Depends(get_current_user)):
    """Feed de actividad real (S10 Día 3) — el modelo solo tiene seguimiento
    de artistas, no de usuarios; ver FEED_ACTIVIDAD_SEGUIDOS (queries.py) para
    la decisión de interpretación."""
    return {"data": query_rows(FEED_ACTIVIDAD_SEGUIDOS, {"usuario_id": user["record"]["id"]})}


# ─────────────────────────────────────────────────────────────────────────────
# 2. Comentarios (CU-O32/CU-O33)
# ─────────────────────────────────────────────────────────────────────────────

class ComentarioBody(BaseModel):
    # fact_id_track/comentario_padre_id: FK a fact_id de FACT_TRACKS/FACT_COMENTARIO,
    # nunca 0 ni negativo en el dominio real (mismo criterio que catalogo.md).
    fact_id_track: int = Field(..., ge=1)
    # 2000 caracteres: generoso para un comentario de track (varios párrafos),
    # sin permitir que alguien mande un string de 1MB como "comentario" (auditoría
    # de validación) — no hay límite de negocio documentado, es un techo defensivo.
    contenido: str = Field(..., min_length=1, max_length=2000)
    comentario_padre_id: int | None = Field(None, ge=1)


@router.post("/comentarios", status_code=201)
def comentar_track(
    body: ComentarioBody,
    user: dict = Depends(require_b2c_user),
    _verificado: dict = Depends(require_email_verificado),
):
    if not body.contenido.strip():
        raise HTTPException(status_code=422, detail="El contenido del comentario no puede estar vacío")
    if query_one(TRACK_EXISTE, {"fact_id": body.fact_id_track})["n"] == 0:
        raise HTTPException(status_code=404, detail="Track no encontrado")

    tipo = "comentario_raiz"
    padre = None
    if body.comentario_padre_id is not None:
        padre = query_one(COMENTARIO_PADRE_INFO, {"fact_id": body.comentario_padre_id})
        if not padre:
            raise HTTPException(status_code=404, detail="Comentario padre no encontrado")
        if padre["fact_id_track"] != body.fact_id_track:
            raise HTTPException(status_code=422, detail="El comentario padre pertenece a otro track")
        # Bloqueo (change p2-descubrimiento-comunidad): responder a un comentario
        # es la forma real de dirigirse a alguien en este modelo (no hay muro de
        # perfil), así que es donde se corta el contacto del bloqueado hacia
        # quien lo bloqueó. El mensaje no dice "te bloqueó" explícitamente pero
        # tampoco lo esconde: la acción falla de forma comprensible.
        autor_padre = padre.get("usuario_id")
        if autor_padre and autor_padre != user["record"]["id"]:
            fila = query_one(ME_BLOQUEO, {
                "autor_id": autor_padre, "candidato_id": user["record"]["id"],
            })
            if (fila or {}).get("activo") == 1:
                raise HTTPException(
                    status_code=403,
                    detail="No puedes responder a los comentarios de este usuario",
                )
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
    _notificar_comentario(tipo, usuario_id, body, padre)
    return {"status": "ok", "fact_id": fact_id, "estado_moderacion": "visible"}


def _notificar_comentario(tipo: str, autor_id: str, body: ComentarioBody, padre: dict | None) -> None:
    # "comentario_en_tu_contenido" (notificaciones, S10 ronda 2): una respuesta
    # notifica al autor del comentario padre; un comentario raíz notifica al
    # dueño de la cuenta de artista que subió el track (si es resoluble — ver
    # AUTOR_TRACK_POR_FACT_ID). Nunca se autonotifica el propio autor.
    if tipo == "comentario_respuesta":
        destino = (padre or {}).get("usuario_id")
        if destino and destino != autor_id:
            notificaciones.crear(
                destino, "comentario_en_tu_contenido", "comentario", str(body.comentario_padre_id),
                "Alguien respondió tu comentario",
            )
    else:
        autor_track = query_one(AUTOR_TRACK_POR_FACT_ID, {"fact_id": body.fact_id_track})
        destino = autor_track["usuario_id"] if autor_track else None
        if destino and destino != autor_id:
            notificaciones.crear(
                destino, "comentario_en_tu_contenido", "track", str(body.fact_id_track),
                "Nuevo comentario en uno de tus tracks",
            )


@router.get("/comentarios/{fact_id_track}")
def listar_comentarios(fact_id_track: int, user: dict = Depends(get_current_user)):
    return {"data": query_rows(COMENTARIOS_VISIBLES_DE_TRACK, {
        "fact_id_track": fact_id_track, "lector_id": user["record"]["id"],
    })}


# ─────────────────────────────────────────────────────────────────────────────
# Bloqueo usuario-a-usuario (change p2-descubrimiento-comunidad)
#
# Herramienta del propio usuario, no de moderación: no requiere motivo ni pasa
# por un admin. Efectos en la lectura de comentarios y en el feed (queries.py) y
# en la capacidad de responder (POST /comentarios, arriba).
# ─────────────────────────────────────────────────────────────────────────────

class BloqueoBody(BaseModel):
    usuario_id: str = Field(..., min_length=1)


_BRIDGE_BLOQUEO_COLS = [
    "bloqueador_id", "bloqueado_id", "activo", "created_at", "actualizado_en",
]


@router.post("/bloqueos", status_code=201)
def bloquear_usuario(body: BloqueoBody, user: dict = Depends(require_b2c_user)):
    bloqueador_id = user["record"]["id"]
    if body.usuario_id == bloqueador_id:
        raise HTTPException(status_code=422, detail="No puedes bloquearte a ti mismo")
    if query_one(USUARIO_EXISTE, {"usuario_id": body.usuario_id})["n"] == 0:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    ahora = datetime.now(timezone.utc)
    get_client().insert(
        "BRIDGE_BLOQUEO_USUARIO",
        [(bloqueador_id, body.usuario_id, 1, ahora, ahora)],
        column_names=_BRIDGE_BLOQUEO_COLS,
    )
    return {"status": "ok", "bloqueado_id": body.usuario_id}


@router.delete("/bloqueos/{usuario_id}")
def desbloquear_usuario(usuario_id: str = Path(..., min_length=1), user: dict = Depends(require_b2c_user)):
    bloqueador_id = user["record"]["id"]
    fila = query_one(BLOQUEO_VIGENTE, {
        "bloqueador_id": bloqueador_id, "bloqueado_id": usuario_id,
    })
    if (fila or {}).get("activo") != 1:
        raise HTTPException(status_code=404, detail="No tienes bloqueado a este usuario")

    # Borrado lógico: fila nueva con activo=0 y `actualizado_en` mayor, que es
    # la que gana en el argMax y en el merge del ReplacingMergeTree.
    ahora = datetime.now(timezone.utc)
    get_client().insert(
        "BRIDGE_BLOQUEO_USUARIO",
        [(bloqueador_id, usuario_id, 0, ahora, ahora)],
        column_names=_BRIDGE_BLOQUEO_COLS,
    )
    return {"status": "ok", "desbloqueado_id": usuario_id}


@router.get("/bloqueos")
def listar_bloqueos(user: dict = Depends(require_b2c_user)):
    rows = query_rows(MIS_BLOQUEADOS, {"bloqueador_id": user["record"]["id"]})
    return {"data": rows, "total": len(rows)}


# ─────────────────────────────────────────────────────────────────────────────
# 3. Moderación de comentarios (CU-O34/CU-O35)
# ─────────────────────────────────────────────────────────────────────────────

class ModerarComentarioBody(BaseModel):
    decision: Literal["oculto", "eliminado"]


@router.post("/admin/comentarios/{fact_id}/moderar")
def moderar_comentario(body: ModerarComentarioBody, fact_id: int = Path(..., ge=1), admin: dict = Depends(require_admin)):
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
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
):
    clauses, params = [], {"limit": limit, "offset": (page - 1) * limit}
    if fact_id_track is not None:
        clauses.append("c.fact_id_track = {fact_id_track:UInt64}")
        params["fact_id_track"] = fact_id_track
    if estado:
        clauses.append("c.estado_moderacion = {estado:String}")
        params["estado"] = estado
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    data = query_rows(comentarios_admin_sql(where), params)
    total = query_one(comentarios_admin_count_sql(where), params)["total"]
    return {"data": data, "total": total, "page": page, "limit": limit}


# ─────────────────────────────────────────────────────────────────────────────
# 3b. Denuncias de contenido por usuarios (change p1-ciclos-vida)
# ─────────────────────────────────────────────────────────────────────────────

TipoObjetoDenuncia = Literal["comentario", "track"]
MotivoDenuncia = Literal["spam", "contenido_inapropiado", "derechos_de_autor", "otro"]

_FACT_DENUNCIA_COLS = [
    "denuncia_id", "denunciante_id", "tipo_objeto", "objeto_id",
    "motivo", "descripcion", "estado",
]


class DenunciaBody(BaseModel):
    tipo_objeto: TipoObjetoDenuncia
    # objeto_id es un fact_id UInt64 en texto (máx. 20 dígitos) — 50 da margen
    # sin dejar pasar un payload arbitrariamente largo.
    objeto_id: str = Field(..., min_length=1, max_length=50)
    motivo: MotivoDenuncia
    descripcion: str = Field("", max_length=1000)


@router.post("/denuncias", status_code=201)
def crear_denuncia(body: DenunciaBody, user: dict = Depends(require_b2c_user)):
    """Un usuario B2C denuncia un comentario o un track. La denuncia entra en
    estado `pendiente` a la bandeja de moderación; no ejecuta ninguna acción
    automática sobre el objeto."""
    if not body.objeto_id.strip():
        raise HTTPException(status_code=422, detail="objeto_id es obligatorio")
    # Validación de existencia del objeto denunciado (best-effort: ambos ids
    # son fact_id UInt64 en su tabla respectiva).
    try:
        objeto_num = int(body.objeto_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="objeto_id debe ser numérico")
    if body.tipo_objeto == "comentario":
        if not query_one(COMENTARIO_POR_ID, {"fact_id": objeto_num}):
            raise HTTPException(status_code=404, detail="Comentario no encontrado")
    else:
        if query_one(TRACK_EXISTE, {"fact_id": objeto_num})["n"] == 0:
            raise HTTPException(status_code=404, detail="Track no encontrado")

    denuncia_id = _gen_fact_id()
    get_client().insert(
        "FACT_DENUNCIA",
        [(
            denuncia_id, user["record"]["id"], body.tipo_objeto, body.objeto_id.strip(),
            body.motivo, body.descripcion.strip(), "pendiente",
        )],
        column_names=_FACT_DENUNCIA_COLS,
    )
    return {"status": "ok", "denuncia_id": denuncia_id, "estado": "pendiente"}


@router.get("/admin/denuncias", dependencies=[Depends(require_admin)])
def listar_denuncias_admin(
    tipo_objeto: str | None = Query(None),
    motivo: str | None = Query(None),
    estado: str | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
):
    clauses, params = [], {"limit": limit, "offset": (page - 1) * limit}
    if tipo_objeto:
        clauses.append("tipo_objeto = {tipo_objeto:String}"); params["tipo_objeto"] = tipo_objeto
    if motivo:
        clauses.append("motivo = {motivo:String}"); params["motivo"] = motivo
    if estado:
        clauses.append("estado = {estado:String}"); params["estado"] = estado
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    data = query_rows(denuncias_admin_sql(where), params)
    total = query_one(denuncias_count_sql(where), params)["total"]
    return {"data": data, "total": total, "page": page, "limit": limit}


class ActualizarDenunciaBody(BaseModel):
    estado: Literal["revisada", "resuelta"]
    # Emisión de strike al resolver (change p2-descubrimiento-comunidad): la
    # sanción va en la misma acción que la resolución para que moderar sea un
    # solo paso y no dos pantallas distintas.
    emitir_strike: bool = False
    motivo: str = Field("", max_length=500)


def _autor_del_contenido_denunciado(denuncia: dict) -> str | None:
    """Resuelve a quién sancionar por una denuncia.

    Un track del dataset original no tiene autor resoluble: AUTOR_TRACK_POR_FACT_ID
    hace un join "suave" por nombre artístico contra DIM_CUENTA_ARTISTA, que solo
    encaja para tracks subidos por un artista de la plataforma. En ese caso no hay
    a quién sancionar y devuelve None.
    """
    if denuncia["tipo_objeto"] == "comentario":
        comentario = query_one(COMENTARIO_POR_ID, {"fact_id": int(denuncia["objeto_id"])})
        return (comentario or {}).get("usuario_id")
    autor = query_one(AUTOR_TRACK_POR_FACT_ID, {"fact_id": int(denuncia["objeto_id"])})
    return (autor or {}).get("usuario_id")


@router.put("/admin/denuncias/{denuncia_id}")
def actualizar_denuncia_admin(
    body: ActualizarDenunciaBody, denuncia_id: int = Path(..., ge=1), admin: dict = Depends(require_admin),
):
    actual = query_one(DENUNCIA_POR_ID, {"denuncia_id": denuncia_id})
    if not actual:
        raise HTTPException(status_code=404, detail="Denuncia no encontrada")
    # Transición de estado inválida (auditoría de validación): "resuelta" es
    # terminal — una denuncia ya resuelta no puede volver a "revisada" ni
    # re-resolverse (ej. para emitir un segundo strike por el mismo caso).
    # No hay flujo de "reabrir" en el diseño de p1-ciclos-vida/p2-descubrimiento-
    # comunidad, así que se rechaza en vez de permitir un retroceso silencioso.
    if actual["estado"] == "resuelta":
        raise HTTPException(
            status_code=409,
            detail="Esta denuncia ya fue resuelta y no puede modificarse",
        )
    if body.emitir_strike and not body.motivo.strip():
        raise HTTPException(status_code=422, detail="Un strike requiere motivo")

    # Fila nueva con el mismo id y estado actualizado (ReplacingMergeTree).
    get_client().insert(
        "FACT_DENUNCIA",
        [(
            denuncia_id, actual["denunciante_id"], actual["tipo_objeto"], actual["objeto_id"],
            actual["motivo"], actual["descripcion"], body.estado,
        )],
        column_names=_FACT_DENUNCIA_COLS,
    )
    audit.record(
        usuario_id=admin["record"]["id"], accion="actualizar_denuncia",
        tabla_afectada="FACT_DENUNCIA", antes={"denuncia_id": denuncia_id, "estado": actual["estado"]},
        despues={"denuncia_id": denuncia_id, "estado": body.estado},
    )

    respuesta = {"status": "ok", "denuncia_id": denuncia_id, "estado": body.estado}
    if body.emitir_strike:
        autor_id = _autor_del_contenido_denunciado(actual)
        if not autor_id:
            # La resolución de la denuncia NO se revierte: es válida por sí
            # misma. Solo se informa de que la sanción no pudo aplicarse.
            respuesta["strike"] = {
                "emitido": False,
                "detalle": "No se pudo determinar el autor del contenido denunciado",
            }
        else:
            resultado = strikes.emitir(
                usuario_id=autor_id, motivo=body.motivo.strip(),
                emitido_por=admin["record"]["id"],
                origen_tipo="denuncia", origen_id=str(denuncia_id),
            )
            respuesta["strike"] = {"emitido": True, "usuario_id": autor_id, **resultado}
    return respuesta


# ─────────────────────────────────────────────────────────────────────────────
# 4. Compartir contenido (CU-O36)
# ─────────────────────────────────────────────────────────────────────────────

class ComparticionBody(BaseModel):
    tipo_interaccion_id: Literal["compartir_track", "compartir_playlist", "compartir_perfil_artista"]
    canal: Literal["x", "whatsapp", "copiar_enlace"]
    fact_id_track: int | None = Field(None, ge=1)
    artista_id: int | None = Field(None, ge=1)
    # playlist_id es un id de PocketBase (15 caracteres alfanuméricos) — 50 da
    # margen sin aceptar un valor arbitrariamente largo.
    playlist_id: str | None = Field(None, min_length=1, max_length=50)


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


@router.get("/admin/dashboard")
def dashboard_social(admin: dict = Depends(require_admin)):
    return {
        "actividad_por_dia":    query_rows(ACTIVIDAD_SOCIAL_POR_DIA),
        "artistas_mas_seguidos": query_rows(ARTISTAS_MAS_SEGUIDOS),
    }


# ─────────────────────────────────────────────────────────────────────────────
# 5. Notificaciones (S10 ronda 2)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/notificaciones")
def mis_notificaciones(limit: int = Query(30, ge=1, le=100), user: dict = Depends(get_current_user)):
    usuario_id = user["record"]["id"]
    return {
        "data":      query_rows(NOTIFICACIONES_DE_USUARIO, {"usuario_id": usuario_id, "limit": limit}),
        "no_leidas": (query_one(NOTIFICACIONES_NO_LEIDAS_TOTAL, {"usuario_id": usuario_id}) or {}).get("n", 0),
    }


@router.patch("/notificaciones/leer-todas")
def marcar_todas_leidas(user: dict = Depends(get_current_user)):
    usuario_id = user["record"]["id"]
    execute(
        "ALTER TABLE FACT_NOTIFICACION UPDATE leido = 1, fecha_lectura = now() "
        "WHERE usuario_destino_id = {usuario_id:String} AND leido = 0",
        {"usuario_id": usuario_id},
    )
    return {"status": "ok"}


@router.get("/admin/notificaciones")
def notificaciones_admin(admin: dict = Depends(require_admin)):
    """Panel de moderación (`admin_comunidad`): últimas 200 notificaciones de
    todo el sistema, a diferencia de GET /notificaciones que es autoservicio
    de la propia bandeja."""
    return {"notificaciones": query_rows(NOTIFICACIONES_ADMIN)}


@router.patch("/notificaciones/{fact_id}/leer")
def marcar_notificacion_leida(fact_id: int = Path(..., ge=1), user: dict = Depends(get_current_user)):
    notif = query_one(NOTIFICACION_POR_ID, {"fact_id": fact_id})
    if not notif:
        raise HTTPException(status_code=404, detail="Notificación no encontrada")
    if notif["usuario_destino_id"] != user["record"]["id"]:
        raise HTTPException(status_code=403, detail="Esta notificación no te pertenece")
    execute(
        "ALTER TABLE FACT_NOTIFICACION UPDATE leido = 1, fecha_lectura = now() WHERE fact_id = {fact_id:UInt64}",
        {"fact_id": fact_id},
    )
    return {"status": "ok"}


# ─────────────────────────────────────────────────────────────────────────────
# 6. Perfiles públicos/privados (S10 ronda 2)
# ─────────────────────────────────────────────────────────────────────────────

async def _usuario_opcional(request: Request, authorization: str | None = Header(None)) -> dict | None:
    # Un perfil público debe poder verse sin sesión — no se puede usar
    # get_current_user directo (exige 401 sin token). Reintenta la misma
    # verificación y degrada a None ante cualquier fallo (token ausente,
    # expirado o inválido) en vez de rechazar la request.
    if not authorization:
        return None
    try:
        return await get_current_user(request, authorization)
    except HTTPException:
        return None


@router.get("/usuarios/{usuario_id}/perfil")
async def perfil_publico(usuario_id: str, viewer: dict | None = Depends(_usuario_opcional)):
    fila = query_one(PERFIL_PUBLICO_USUARIO, {"usuario_id": usuario_id})
    if not fila:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    es_propio_dueno = viewer is not None and viewer["record"]["id"] == usuario_id
    if not fila["perfil_publico"] and not es_propio_dueno:
        raise HTTPException(status_code=404, detail="Este perfil es privado")

    playlists_pb = await pb_playlists.listar_publicas(usuario_id)
    playlists = []
    for pl in playlists_pb:
        items = await pb_playlists.listar_tracks_admin(pl["id"])
        fact_ids = [it["fact_id"] for it in items]
        tracks_by_fact = {r["fact_id"]: r for r in enriquecer_featuring(query_rows(TRACKS_BY_FACT_IDS, {"fact_ids": fact_ids}))} if fact_ids else {}
        ordered = sorted(items, key=lambda it: it["position"])
        tracks  = [tracks_by_fact[it["fact_id"]] for it in ordered if it["fact_id"] in tracks_by_fact]
        playlists.append({"playlist_id": pl["id"], "name": pl["name"], "data": tracks, "total": len(tracks)})

    return {
        "usuario_id":     usuario_id,
        "nombre":         fila["nombre"],
        "perfil_publico": bool(fila["perfil_publico"]),
        "es_propio":      es_propio_dueno,
        "playlists":      playlists,
    }
