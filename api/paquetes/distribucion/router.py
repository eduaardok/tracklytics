import random
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from core.database import execute, get_client, query_one, query_rows
from core.deps import require_b2c_user
from paquetes.seguridad import audit
from paquetes.seguridad.deps import require_admin
from paquetes.distribucion.queries import (
    ALBUM_EXISTE,
    ARTISTA_EXISTE,
    CANAL_EXISTE,
    CANALES_LIST,
    LICENCIA_ID_MAX,
    LICENCIAS_ACTIVAS_TOTAL,
    PAIS_EXISTE,
    PAIS_ID_POR_TEXTO,
    PAISES_LIST,
    RESTRICCIONES_DE_TRACK,
    RESTRICCIONES_POR_PAIS,
    RESTRICCION_ACTIVA_EXISTE,
    SELLO_EXISTE,
    SELLO_ID_MAX,
    SELLO_POR_ID,
    SELLOS_LIST,
    TIPO_RESTRICCION_EXISTE,
    TIPOS_RESTRICCION_LIST,
    TRACK_EXISTE,
    licencias_sql,
)

router = APIRouter(prefix="/app/v1/distribucion", tags=["Distribucion"])

# DIM_CANAL_DISTRIBUCION es un catálogo fijo de 3 filas sembrado en
# init_clickhouse.py (streaming=1, descarga=2, sync_licensing=3) — el único
# canal que el frontend ejercita hoy es streaming (design.md, Decisión 4).
CANAL_STREAMING_ID = 1


# ─────────────────────────────────────────────────────────────────────────────
# Utilidades reutilizadas por `biblioteca` para el enforcement (RF-DIS-007)
# ─────────────────────────────────────────────────────────────────────────────

def resolver_pais_id(texto_pais: str) -> int | None:
    """País declarado del usuario (texto libre, DIM_USUARIO.pais) -> pais_id.
    Devuelve None si no coincide con ningún DIM_PAIS conocido — el llamador
    debe tratar None como "no aplicar restricción" (fail-open, design.md
    Decisión 5, "Limitación conocida: bloqueo geográfico depende de país
    normalizado")."""
    if not texto_pais:
        return None
    row = query_one(PAIS_ID_POR_TEXTO, {"texto": texto_pais})
    return row["pais_id"] if row else None


def restriccion_activa(fact_id_track: int, pais_id: int, canal_id: int = CANAL_STREAMING_ID) -> dict | None:
    return query_one(
        RESTRICCION_ACTIVA_EXISTE,
        {"fact_id_track": fact_id_track, "pais_id": pais_id, "canal_id": canal_id},
    )


def generar_fact_id_restriccion() -> int:
    # UInt64 aleatorio sin lock, 50 bits (no 63 — Number.MAX_SAFE_INTEGER en el
    # cliente React), mismo patrón corregido en `social/router.py::_gen_fact_id`.
    return random.getrandbits(50)


def registrar_restriccion_reproduccion(usuario_id: str, fact_id_track: int, pais_id: int, tipo_restriccion_id: int) -> None:
    get_client().insert(
        "FACT_RESTRICCION_REPRODUCCION",
        [(generar_fact_id_restriccion(), usuario_id, fact_id_track, pais_id, tipo_restriccion_id, datetime.now(timezone.utc))],
        column_names=["fact_id", "usuario_id", "fact_id_track", "pais_id", "tipo_restriccion_id", "fecha"],
    )


# ─────────────────────────────────────────────────────────────────────────────
# 1. Sellos discográficos (CU-O37/CU-O38, RF-DIS-001/002)
# ─────────────────────────────────────────────────────────────────────────────

class SelloBody(BaseModel):
    nombre: str


@router.post("/sellos", status_code=201)
def crear_sello(body: SelloBody, admin: dict = Depends(require_admin)):
    if not body.nombre.strip():
        raise HTTPException(status_code=422, detail="El nombre del sello no puede estar vacío")
    nuevo_id = ((query_one(SELLO_ID_MAX) or {}).get("n") or 0) + 1
    get_client().insert(
        "DIM_SELLO_DISCOGRAFICO", [(nuevo_id, body.nombre)], column_names=["sello_id", "nombre"],
    )
    audit.record(
        usuario_id=admin["record"]["id"], accion="crear_sello", tabla_afectada="DIM_SELLO_DISCOGRAFICO",
        antes=None, despues={"sello_id": nuevo_id, "nombre": body.nombre},
    )
    return {"status": "ok", "sello_id": nuevo_id, "nombre": body.nombre}


@router.put("/sellos/{sello_id}")
def editar_sello(sello_id: int, body: SelloBody, admin: dict = Depends(require_admin)):
    sello = query_one(SELLO_POR_ID, {"sello_id": sello_id})
    if not sello:
        raise HTTPException(status_code=404, detail="Sello no encontrado")
    if not body.nombre.strip():
        raise HTTPException(status_code=422, detail="El nombre del sello no puede estar vacío")
    execute(
        "ALTER TABLE DIM_SELLO_DISCOGRAFICO UPDATE nombre = {nombre:String} WHERE sello_id = {sello_id:UInt32}",
        {"nombre": body.nombre, "sello_id": sello_id},
    )
    audit.record(
        usuario_id=admin["record"]["id"], accion="editar_sello", tabla_afectada="DIM_SELLO_DISCOGRAFICO",
        antes={"sello_id": sello_id, "nombre": sello["nombre"]}, despues={"sello_id": sello_id, "nombre": body.nombre},
    )
    return {"status": "ok", "sello_id": sello_id, "nombre": body.nombre}


@router.get("/sellos", dependencies=[Depends(require_admin)])
def listar_sellos():
    return {"data": query_rows(SELLOS_LIST)}


# Catálogos fijos de solo lectura, para poblar los selects de la UI admin
# (país/canal/tipo de restricción) — no forman parte de los casos de uso
# RF-DIS-*, son soporte de las pantallas de creación de licencias/restricciones.
@router.get("/paises", dependencies=[Depends(require_admin)])
def listar_paises():
    return {"data": query_rows(PAISES_LIST)}


# Versión pública (sin sesión) del mismo catálogo — el registro de cuenta
# (CU-O01) necesita poblar un <select> de país antes de que exista un JWT
# de usuario, para que el país declarado resuelva de forma confiable contra
# DIM_PAIS (antes era texto libre y `resolver_pais_id` fallaba en silencio
# — RF-DIS-007/CU-O41, auditoría 2026-07-09).
@router.get("/paises/publico")
def listar_paises_publico():
    return {"data": query_rows(PAISES_LIST)}


@router.get("/canales", dependencies=[Depends(require_admin)])
def listar_canales():
    return {"data": query_rows(CANALES_LIST)}


@router.get("/tipos-restriccion", dependencies=[Depends(require_admin)])
def listar_tipos_restriccion():
    return {"data": query_rows(TIPOS_RESTRICCION_LIST)}


class AsignarSelloBody(BaseModel):
    sello_id: int


@router.put("/artistas/{artist_id}/sello")
def asignar_sello_artista(artist_id: int, body: AsignarSelloBody, admin: dict = Depends(require_admin)):
    if query_one(ARTISTA_EXISTE, {"artist_id": artist_id})["n"] == 0:
        raise HTTPException(status_code=404, detail="Artista no encontrado")
    if query_one(SELLO_EXISTE, {"sello_id": body.sello_id})["n"] == 0:
        raise HTTPException(status_code=404, detail="Sello no encontrado")
    execute(
        "ALTER TABLE DIM_ARTISTS UPDATE sello_id = {sello_id:UInt32} WHERE artist_id = {artist_id:UInt32}",
        {"sello_id": body.sello_id, "artist_id": artist_id},
    )
    audit.record(
        usuario_id=admin["record"]["id"], accion="asignar_sello_artista", tabla_afectada="DIM_ARTISTS",
        antes={"artist_id": artist_id}, despues={"artist_id": artist_id, "sello_id": body.sello_id},
    )
    return {"status": "ok", "artist_id": artist_id, "sello_id": body.sello_id}


@router.put("/albumes/{album_id}/sello")
def asignar_sello_album(album_id: int, body: AsignarSelloBody, admin: dict = Depends(require_admin)):
    if query_one(ALBUM_EXISTE, {"album_id": album_id})["n"] == 0:
        raise HTTPException(status_code=404, detail="Álbum no encontrado")
    if query_one(SELLO_EXISTE, {"sello_id": body.sello_id})["n"] == 0:
        raise HTTPException(status_code=404, detail="Sello no encontrado")
    execute(
        "ALTER TABLE DIM_ALBUMS UPDATE sello_id = {sello_id:UInt32} WHERE album_id = {album_id:UInt32}",
        {"sello_id": body.sello_id, "album_id": album_id},
    )
    audit.record(
        usuario_id=admin["record"]["id"], accion="asignar_sello_album", tabla_afectada="DIM_ALBUMS",
        antes={"album_id": album_id}, despues={"album_id": album_id, "sello_id": body.sello_id},
    )
    return {"status": "ok", "album_id": album_id, "sello_id": body.sello_id}


# ─────────────────────────────────────────────────────────────────────────────
# 2. Licencias (CU-O39/CU-O40, RF-DIS-003/004)
# ─────────────────────────────────────────────────────────────────────────────

class LicenciaBody(BaseModel):
    sello_id: int
    pais_id: int
    fecha_inicio: date
    fecha_fin: date | None = None


@router.post("/licencias", status_code=201)
def crear_licencia(body: LicenciaBody, admin: dict = Depends(require_admin)):
    if query_one(SELLO_EXISTE, {"sello_id": body.sello_id})["n"] == 0:
        raise HTTPException(status_code=404, detail="Sello no encontrado")
    if query_one(PAIS_EXISTE, {"pais_id": body.pais_id})["n"] == 0:
        raise HTTPException(status_code=404, detail="País no encontrado")
    nuevo_id = ((query_one(LICENCIA_ID_MAX) or {}).get("n") or 0) + 1
    get_client().insert(
        "DIM_LICENCIA",
        [(nuevo_id, body.sello_id, body.pais_id, body.fecha_inicio, body.fecha_fin, "activa")],
        column_names=["licencia_id", "sello_id", "pais_id", "fecha_inicio", "fecha_fin", "estado"],
    )
    audit.record(
        usuario_id=admin["record"]["id"], accion="crear_licencia", tabla_afectada="DIM_LICENCIA",
        antes=None,
        despues={
            "licencia_id": nuevo_id, "sello_id": body.sello_id, "pais_id": body.pais_id,
            "fecha_inicio": str(body.fecha_inicio), "fecha_fin": str(body.fecha_fin) if body.fecha_fin else None,
        },
    )
    return {"status": "ok", "licencia_id": nuevo_id}


@router.get("/licencias", dependencies=[Depends(require_admin)])
def listar_licencias(sello_id: int | None = Query(None), pais_id: int | None = Query(None)):
    clauses, params = [], {}
    if sello_id is not None:
        clauses.append("l.sello_id = {sello_id:UInt32}")
        params["sello_id"] = sello_id
    if pais_id is not None:
        clauses.append("l.pais_id = {pais_id:UInt16}")
        params["pais_id"] = pais_id
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    return {"data": query_rows(licencias_sql(where), params)}


# ─────────────────────────────────────────────────────────────────────────────
# 3. Restricciones de reproducción (CU-O41/CU-O42, RF-DIS-005/006)
# ─────────────────────────────────────────────────────────────────────────────

class RestriccionBody(BaseModel):
    fact_id_track: int
    pais_id: int
    canal_id: int
    tipo_restriccion_id: int


@router.post("/restricciones", status_code=201)
def crear_restriccion(body: RestriccionBody, admin: dict = Depends(require_admin)):
    if query_one(TRACK_EXISTE, {"fact_id": body.fact_id_track})["n"] == 0:
        raise HTTPException(status_code=404, detail="Track no encontrado")
    if query_one(PAIS_EXISTE, {"pais_id": body.pais_id})["n"] == 0:
        raise HTTPException(status_code=404, detail="País no encontrado")
    if query_one(CANAL_EXISTE, {"canal_id": body.canal_id})["n"] == 0:
        raise HTTPException(status_code=404, detail="Canal de distribución no encontrado")
    if query_one(TIPO_RESTRICCION_EXISTE, {"tipo_restriccion_id": body.tipo_restriccion_id})["n"] == 0:
        raise HTTPException(status_code=404, detail="Tipo de restricción no encontrado")

    get_client().insert(
        "BRIDGE_RESTRICCION_TRACK",
        [(body.fact_id_track, body.pais_id, body.canal_id, body.tipo_restriccion_id, datetime.now(timezone.utc), 1)],
        column_names=["fact_id_track", "pais_id", "canal_id", "tipo_restriccion_id", "fecha_inicio", "activo"],
    )
    audit.record(
        usuario_id=admin["record"]["id"], accion="crear_restriccion", tabla_afectada="BRIDGE_RESTRICCION_TRACK",
        antes=None,
        despues={
            "fact_id_track": body.fact_id_track, "pais_id": body.pais_id,
            "canal_id": body.canal_id, "tipo_restriccion_id": body.tipo_restriccion_id,
        },
    )
    return {"status": "ok"}


@router.delete("/restricciones/{fact_id_track}/{pais_id}/{canal_id}")
def desactivar_restriccion(fact_id_track: int, pais_id: int, canal_id: int, admin: dict = Depends(require_admin)):
    activa = restriccion_activa(fact_id_track, pais_id, canal_id)
    if not activa:
        raise HTTPException(status_code=404, detail="No existe una restricción activa para esa combinación")
    execute(
        "ALTER TABLE BRIDGE_RESTRICCION_TRACK UPDATE activo = 0 "
        "WHERE fact_id_track = {fact_id_track:UInt64} AND pais_id = {pais_id:UInt16} "
        "AND canal_id = {canal_id:UInt16} AND activo = 1",
        {"fact_id_track": fact_id_track, "pais_id": pais_id, "canal_id": canal_id},
    )
    audit.record(
        usuario_id=admin["record"]["id"], accion="desactivar_restriccion", tabla_afectada="BRIDGE_RESTRICCION_TRACK",
        antes={"fact_id_track": fact_id_track, "pais_id": pais_id, "canal_id": canal_id, "activo": 1},
        despues={"fact_id_track": fact_id_track, "pais_id": pais_id, "canal_id": canal_id, "activo": 0},
    )
    return {"status": "ok"}


@router.get("/restricciones", dependencies=[Depends(require_admin)])
def listar_restricciones(fact_id_track: int = Query(...)):
    return {"data": query_rows(RESTRICCIONES_DE_TRACK, {"fact_id_track": fact_id_track})}


# ─────────────────────────────────────────────────────────────────────────────
# 4. Disponibilidad por país — solo lectura (CU-O44, RF-DIS-008)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/disponibilidad/{fact_id_track}")
def consultar_disponibilidad(fact_id_track: int, user: dict = Depends(require_b2c_user)):
    if query_one(TRACK_EXISTE, {"fact_id": fact_id_track})["n"] == 0:
        raise HTTPException(status_code=404, detail="Track no encontrado")

    pais_id = resolver_pais_id(user["record"].get("pais", ""))
    if pais_id is None:
        # País no reconocido: fail-open, no se puede determinar restricción (design.md, Decisión 5).
        return {"disponible": True, "tipo_restriccion": None}

    restriccion = restriccion_activa(fact_id_track, pais_id)
    if restriccion:
        return {"disponible": False, "tipo_restriccion": restriccion["tipo_restriccion_nombre"]}
    return {"disponible": True, "tipo_restriccion": None}


@router.get("/admin/dashboard", dependencies=[Depends(require_admin)])
def dashboard_distribucion():
    return {
        "restricciones_por_pais": query_rows(RESTRICCIONES_POR_PAIS),
        "licencias_activas_total": (query_one(LICENCIAS_ACTIVAS_TOTAL) or {}).get("n", 0),
    }
