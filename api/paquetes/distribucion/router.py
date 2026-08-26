import random
import uuid
from datetime import date, datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from pydantic import BaseModel, Field, field_validator

from core.database import execute, get_client, query_one, query_rows
from core.deps import get_current_user, require_b2c_user
from paquetes.regalias.deps import require_cuenta_sello
from paquetes.seguridad import audit
from paquetes.seguridad.deps import require_rol_admin

# Autorización administrativa segmentada (change roles-gestion-usuarios): la
# gestión de sellos, licencias, restricciones geográficas y disponibilidad de
# catálogo pertenece al área de contenido. `superadmin` siempre pasa.
require_admin = require_rol_admin("admin_contenido")
# S16-P3 (verificación UX por rol): `GET /sellos` también lo consume
# RegaliasAdminPage (`/seguridad/regalias`, admin_finanzas) para poblar el
# selector de sello al registrar una liquidación — admin_finanzas quedaba
# con 403 en esa sola llamada (dropdown vacío, sin error visible en
# pantalla) pese a que la página en sí es 100% suya. Solo la LECTURA de
# sellos se abre a admin_finanzas; alta/edición de sellos sigue exclusiva
# de admin_contenido (`require_admin` de arriba, sin tocar).
require_admin_lectura_sellos = require_rol_admin("admin_contenido", "admin_finanzas")
from paquetes.distribucion.queries import (
    ALBUM_EXISTE,
    ARTISTA_EXISTE,
    CANAL_EXISTE,
    CANALES_LIST,
    LICENCIA_ESTADO_POR_ID,
    LICENCIA_ID_MAX,
    LICENCIAS_ACTIVAS_TOTAL,
    PAIS_CONFIG_POR_ID,
    PAIS_EXISTE,
    PAIS_ID_MAX,
    PAIS_ID_POR_TEXTO,
    PAISES_CONFIG_LIST,
    PAISES_LIST,
    RESTRICCIONES_DE_TRACK,
    RESTRICCIONES_POR_PAIS,
    RESTRICCION_ACTIVA_EXISTE,
    SELLO_EXISTE,
    SELLO_ID_MAX,
    SELLO_POR_ID,
    SELLOS_LIST,
    SOLICITUD_LICENCIA_ACTUAL_POR_ID,
    TIPO_RESTRICCION_EXISTE,
    TIPOS_RESTRICCION_LIST,
    TRACK_EXISTE,
    disponibilidad_lista_sql,
    disponibilidad_lista_total_sql,
    licencias_sql,
    solicitudes_licencia_sql,
)

_SOLICITUD_LICENCIA_COLS = [
    "solicitud_id", "sello_id", "paises_solicitados", "canales_solicitados",
    "fecha_inicio_propuesta", "fecha_fin_propuesta", "estado", "motivo_rechazo",
    "fecha_solicitud", "fecha_resolucion", "admin_resolutor_id",
]

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


def resolver_pais_config(texto_pais: str) -> dict | None:
    """País declarado (texto libre) -> fila completa de configuración de
    DIM_PAIS (moneda/tasa de cambio/IVA/retención) — reusado por `facturacion`
    (IVA, conversión de moneda) y `regalias` (retención fiscal) para no
    duplicar la resolución texto->país ya existente aquí (RF-DIS-007). `None`
    si no hay match — el llamador debe caer a la configuración global."""
    pais_id = resolver_pais_id(texto_pais)
    if pais_id is None:
        return None
    return query_one(PAIS_CONFIG_POR_ID, {"pais_id": pais_id})


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
    nombre: str = Field(min_length=1, max_length=150)
    # País del sello (modelo-financiero-completar-huecos, design.md decisión
    # 3) — texto libre, mismo criterio que DIM_USUARIO.pais, resuelto contra
    # DIM_PAIS vía `resolver_pais_id` para la retención fiscal de regalías.
    pais: str = Field(default="", max_length=100)


@router.post("/sellos", status_code=201)
def crear_sello(body: SelloBody, admin: dict = Depends(require_admin)):
    if not body.nombre.strip():
        raise HTTPException(status_code=422, detail="El nombre del sello no puede estar vacío")
    nuevo_id = ((query_one(SELLO_ID_MAX) or {}).get("n") or 0) + 1
    get_client().insert(
        "DIM_SELLO_DISCOGRAFICO", [(nuevo_id, body.nombre, body.pais)],
        column_names=["sello_id", "nombre", "pais"],
    )
    audit.record(
        usuario_id=admin["record"]["id"], accion="crear_sello", tabla_afectada="DIM_SELLO_DISCOGRAFICO",
        antes=None, despues={"sello_id": nuevo_id, "nombre": body.nombre, "pais": body.pais},
    )
    return {"status": "ok", "sello_id": nuevo_id, "nombre": body.nombre, "pais": body.pais}


@router.put("/sellos/{sello_id}")
def editar_sello(body: SelloBody, sello_id: int = Path(..., ge=1), admin: dict = Depends(require_admin)):
    sello = query_one(SELLO_POR_ID, {"sello_id": sello_id})
    if not sello:
        raise HTTPException(status_code=404, detail="Sello no encontrado")
    if not body.nombre.strip():
        raise HTTPException(status_code=422, detail="El nombre del sello no puede estar vacío")
    execute(
        "ALTER TABLE DIM_SELLO_DISCOGRAFICO UPDATE nombre = {nombre:String}, pais = {pais:String} "
        "WHERE sello_id = {sello_id:UInt32}",
        {"nombre": body.nombre, "pais": body.pais, "sello_id": sello_id},
    )
    audit.record(
        usuario_id=admin["record"]["id"], accion="editar_sello", tabla_afectada="DIM_SELLO_DISCOGRAFICO",
        antes={"sello_id": sello_id, "nombre": sello["nombre"], "pais": sello.get("pais", "")},
        despues={"sello_id": sello_id, "nombre": body.nombre, "pais": body.pais},
    )
    return {"status": "ok", "sello_id": sello_id, "nombre": body.nombre, "pais": body.pais}


# ── Self-edit de sello (S17, brecha operativa P1): un sello puede editar su
# propia información (nombre, país) sin pasar por admin — misma lógica de
# validación que `editar_sello`, pero gateada por "es dueño de este sello"
# en vez de `require_admin`. Requiere que el usuario tenga cuenta de sello
# (DIM_CUENTA_SELLO).
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/sello/mi-perfil")
def mi_perfil_sello(cuenta: dict = Depends(require_cuenta_sello)):
    sello_id = cuenta["sello_id"]
    sello = query_one(SELLO_POR_ID, {"sello_id": sello_id})
    if not sello:
        raise HTTPException(status_code=404, detail="Sello no encontrado")
    return {"sello_id": sello_id, "nombre": sello["nombre"], "pais": sello.get("pais", "")}


@router.patch("/sello/mi-perfil")
def editar_mi_perfil(body: SelloBody, cuenta: dict = Depends(require_cuenta_sello)):
    sello_id = cuenta["sello_id"]
    sello = query_one(SELLO_POR_ID, {"sello_id": sello_id})
    if not sello:
        raise HTTPException(status_code=404, detail="Sello no encontrado")
    if not body.nombre.strip():
        raise HTTPException(status_code=422, detail="El nombre del sello no puede estar vacío")
    execute(
        "ALTER TABLE DIM_SELLO_DISCOGRAFICO UPDATE nombre = {nombre:String}, pais = {pais:String} "
        "WHERE sello_id = {sello_id:UInt32}",
        {"nombre": body.nombre, "pais": body.pais, "sello_id": sello_id},
    )
    audit.record(
        usuario_id=cuenta["usuario_id"], accion="editar_sello_self", tabla_afectada="DIM_SELLO_DISCOGRAFICO",
        antes={"sello_id": sello_id, "nombre": sello["nombre"], "pais": sello.get("pais", "")},
        despues={"sello_id": sello_id, "nombre": body.nombre, "pais": body.pais},
    )
    return {"status": "ok", "sello_id": sello_id, "nombre": body.nombre, "pais": body.pais}


@router.get("/sellos", dependencies=[Depends(require_admin_lectura_sellos)])
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


# ─────────────────────────────────────────────────────────────────────────────
# Configuración de país: moneda, tasa de cambio, IVA y retención fiscal
# (modelo-financiero-completar-huecos, CU-O97) — extensión de la misma tabla
# DIM_PAIS ya dueña de este router, no un paquete de configuración nuevo
# (design.md, decisión 4).
# ─────────────────────────────────────────────────────────────────────────────

class PaisConfigBody(BaseModel):
    nombre: str = Field(min_length=1, max_length=100)
    # ISO 3166-1 alpha-2 (2 letras) — el frontend ya limita a maxLength=2.
    codigo_iso: str = Field(min_length=2, max_length=2)
    # ISO 4217 (3 letras), p.ej. "USD"/"UYU".
    moneda_codigo: str = Field(default="USD", min_length=3, max_length=3)
    # Tasa de referencia simulada y congelada respecto a USD — nunca una
    # cotización de forex real (design.md, decisión 4). Debe ser positiva:
    # una tasa 0 o negativa rompería cualquier conversión de moneda aguas
    # abajo (facturacion/regalias).
    tasa_cambio_a_usd: float = Field(default=1.0, gt=0)
    # None = usa la tasa global de la plataforma (DIM_EMPRESA), ver decisión 6.
    # Escala 0-100 (porcentaje), mismo criterio que
    # `facturacion.EmpresaConfigBody.iva_tasa_global/retencion_fiscal_pct_global`.
    iva_tasa: Optional[float] = Field(default=None, ge=0, le=100)
    retencion_fiscal_pct: Optional[float] = Field(default=None, ge=0, le=100)

    @field_validator("codigo_iso", "moneda_codigo")
    @classmethod
    def _uppercase_alpha(cls, v: str) -> str:
        v = v.strip().upper()
        if not v.isalpha():
            raise ValueError("Debe contener solo letras")
        return v


@router.get("/admin/paises", dependencies=[Depends(require_admin)])
def listar_paises_config():
    return {"data": query_rows(PAISES_CONFIG_LIST)}


@router.post("/admin/paises", status_code=201)
def crear_pais(body: PaisConfigBody, admin: dict = Depends(require_admin)):
    if not body.nombre.strip() or not body.codigo_iso.strip():
        raise HTTPException(status_code=422, detail="Nombre y código ISO son obligatorios")
    nuevo_id = ((query_one(PAIS_ID_MAX) or {}).get("n") or 0) + 1
    get_client().insert(
        "DIM_PAIS",
        [(
            nuevo_id, body.nombre.strip(), body.codigo_iso.strip().upper(), body.moneda_codigo.strip().upper(),
            body.tasa_cambio_a_usd, body.iva_tasa, body.retencion_fiscal_pct, 1,
        )],
        column_names=[
            "pais_id", "nombre", "codigo_iso", "moneda_codigo",
            "tasa_cambio_a_usd", "iva_tasa", "retencion_fiscal_pct", "activo",
        ],
    )
    audit.record(
        usuario_id=admin["record"]["id"], accion="crear_pais", tabla_afectada="DIM_PAIS",
        antes=None, despues={"pais_id": nuevo_id, "nombre": body.nombre, "moneda_codigo": body.moneda_codigo},
    )
    return {"status": "ok", "pais_id": nuevo_id, **body.model_dump()}


@router.put("/admin/paises/{pais_id}")
def editar_pais(body: PaisConfigBody, pais_id: int = Path(..., ge=1), admin: dict = Depends(require_admin)):
    pais = query_one(PAIS_CONFIG_POR_ID, {"pais_id": pais_id})
    if not pais:
        raise HTTPException(status_code=404, detail="País no encontrado")
    execute(
        "ALTER TABLE DIM_PAIS UPDATE nombre = {nombre:String}, codigo_iso = {codigo_iso:String}, "
        "moneda_codigo = {moneda_codigo:String}, tasa_cambio_a_usd = {tasa:Float32}, "
        "iva_tasa = {iva:Nullable(Float32)}, retencion_fiscal_pct = {ret:Nullable(Float32)} "
        "WHERE pais_id = {pais_id:UInt16}",
        {
            "nombre": body.nombre.strip(), "codigo_iso": body.codigo_iso.strip().upper(),
            "moneda_codigo": body.moneda_codigo.strip().upper(), "tasa": body.tasa_cambio_a_usd,
            "iva": body.iva_tasa, "ret": body.retencion_fiscal_pct, "pais_id": pais_id,
        },
    )
    audit.record(
        usuario_id=admin["record"]["id"], accion="editar_pais", tabla_afectada="DIM_PAIS",
        antes=pais, despues={"pais_id": pais_id, **body.model_dump()},
    )
    return {"status": "ok", "pais_id": pais_id, **body.model_dump()}


@router.post("/admin/paises/{pais_id}/desactivar")
def desactivar_pais(pais_id: int = Path(..., ge=1), admin: dict = Depends(require_admin)):
    pais = query_one(PAIS_CONFIG_POR_ID, {"pais_id": pais_id})
    if not pais:
        raise HTTPException(status_code=404, detail="País no encontrado")
    execute("ALTER TABLE DIM_PAIS UPDATE activo = 0 WHERE pais_id = {pais_id:UInt16}", {"pais_id": pais_id})
    audit.record(
        usuario_id=admin["record"]["id"], accion="desactivar_pais", tabla_afectada="DIM_PAIS",
        antes={"pais_id": pais_id, "activo": 1}, despues={"pais_id": pais_id, "activo": 0},
    )
    return {"status": "ok", "pais_id": pais_id, "activo": False}


@router.post("/admin/paises/{pais_id}/activar")
def activar_pais(pais_id: int = Path(..., ge=1), admin: dict = Depends(require_admin)):
    pais = query_one(PAIS_CONFIG_POR_ID, {"pais_id": pais_id})
    if not pais:
        raise HTTPException(status_code=404, detail="País no encontrado")
    execute("ALTER TABLE DIM_PAIS UPDATE activo = 1 WHERE pais_id = {pais_id:UInt16}", {"pais_id": pais_id})
    audit.record(
        usuario_id=admin["record"]["id"], accion="activar_pais", tabla_afectada="DIM_PAIS",
        antes={"pais_id": pais_id, "activo": 0}, despues={"pais_id": pais_id, "activo": 1},
    )
    return {"status": "ok", "pais_id": pais_id, "activo": True}


@router.get("/canales", dependencies=[Depends(require_admin)])
def listar_canales():
    return {"data": query_rows(CANALES_LIST)}


@router.get("/tipos-restriccion", dependencies=[Depends(require_admin)])
def listar_tipos_restriccion():
    return {"data": query_rows(TIPOS_RESTRICCION_LIST)}


class AsignarSelloBody(BaseModel):
    sello_id: int = Field(ge=1)


@router.put("/artistas/{artist_id}/sello")
def asignar_sello_artista(
    body: AsignarSelloBody, artist_id: int = Path(..., ge=1), admin: dict = Depends(require_admin),
):
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
def asignar_sello_album(
    body: AsignarSelloBody, album_id: int = Path(..., ge=1), admin: dict = Depends(require_admin),
):
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
    sello_id: int = Field(ge=1)
    pais_id: int = Field(ge=1)
    fecha_inicio: date
    fecha_fin: date | None = None

    @field_validator("fecha_fin")
    @classmethod
    def _fecha_fin_posterior(cls, v: date | None, info) -> date | None:
        inicio = info.data.get("fecha_inicio")
        if v is not None and inicio is not None and v <= inicio:
            raise ValueError("fecha_fin debe ser posterior a fecha_inicio")
        return v


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


class RevocarLicenciaBody(BaseModel):
    motivo: str = Field(min_length=1, max_length=500)


@router.post("/licencias/{licencia_id}/revocar")
def revocar_licencia(
    body: RevocarLicenciaBody, licencia_id: int = Path(..., ge=1), admin: dict = Depends(require_admin),
):
    """Revoca una licencia ya activa (change p1-ciclos-vida): la marca como
    `revocada`, registra motivo y fecha. Una licencia revocada deja de contar
    como activa para la disponibilidad (LICENCIAS_ACTIVAS_TOTAL filtra
    `estado = 'activa'`)."""
    fila = query_one(LICENCIA_ESTADO_POR_ID, {"licencia_id": licencia_id})
    if not fila:
        raise HTTPException(status_code=404, detail="Licencia no encontrada")
    if fila["estado"] == "revocada":
        raise HTTPException(status_code=409, detail="La licencia ya está revocada")
    if not body.motivo.strip():
        raise HTTPException(status_code=422, detail="Debe indicar un motivo de revocación")
    execute(
        "ALTER TABLE DIM_LICENCIA UPDATE estado = 'revocada', motivo_revocacion = {motivo:String}, "
        "fecha_revocacion = now() WHERE licencia_id = {id:UInt32}",
        {"motivo": body.motivo.strip(), "id": licencia_id},
    )
    audit.record(
        usuario_id=admin["record"]["id"], accion="revocar_licencia", tabla_afectada="DIM_LICENCIA",
        antes={"licencia_id": licencia_id, "estado": fila["estado"]},
        despues={"licencia_id": licencia_id, "estado": "revocada", "motivo": body.motivo.strip()},
    )
    return {"status": "ok", "licencia_id": licencia_id, "estado": "revocada"}


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
# 2b. Solicitudes de licencia (RF-DIS-003/004): un sello ya no queda a merced
# de que el admin cree licencias unilateralmente — el flujo pasa primero por
# `pendiente`, y el admin aprueba o rechaza (mismo idioma que la aprobación de
# cuenta de artista en `creadores/router.py::resolver_cuenta`). Todavía no
# existe login de "sello" (solo admin/user/analyst vía PocketBase): por ahora
# el admin crea la solicitud en nombre del sello (`require_admin`, igual que
# `crear_licencia`), pero cada fila guarda `sello_id`, así que un futuro login
# de sello puede filtrar "mis solicitudes" sin migrar el modelo.
# ─────────────────────────────────────────────────────────────────────────────

class SolicitudLicenciaBody(BaseModel):
    sello_id: int = Field(ge=1)
    # Acotado a un tamaño razonable de catálogo de países/canales — el
    # catálogo real (DIM_PAIS/DIM_CANAL_DISTRIBUCION) es de bajo volumen.
    paises_solicitados: list[int] = Field(min_length=1, max_length=300)
    canales_solicitados: list[int] = Field(min_length=1, max_length=50)
    fecha_inicio_propuesta: date
    fecha_fin_propuesta: date | None = None

    @field_validator("fecha_fin_propuesta")
    @classmethod
    def _fecha_fin_posterior(cls, v: date | None, info) -> date | None:
        inicio = info.data.get("fecha_inicio_propuesta")
        if v is not None and inicio is not None and v <= inicio:
            raise ValueError("fecha_fin_propuesta debe ser posterior a fecha_inicio_propuesta")
        return v


class RechazarSolicitudBody(BaseModel):
    motivo: str = Field(min_length=1, max_length=500)


@router.post("/solicitudes-licencia", status_code=201)
def crear_solicitud_licencia(body: SolicitudLicenciaBody, admin: dict = Depends(require_admin)):
    if not body.paises_solicitados:
        raise HTTPException(status_code=422, detail="Debe incluir al menos un país solicitado")
    if not body.canales_solicitados:
        raise HTTPException(status_code=422, detail="Debe incluir al menos un canal solicitado")
    if query_one(SELLO_EXISTE, {"sello_id": body.sello_id})["n"] == 0:
        raise HTTPException(status_code=404, detail="Sello no encontrado")
    for pais_id in body.paises_solicitados:
        if query_one(PAIS_EXISTE, {"pais_id": pais_id})["n"] == 0:
            raise HTTPException(status_code=404, detail=f"País no encontrado: {pais_id}")
    for canal_id in body.canales_solicitados:
        if query_one(CANAL_EXISTE, {"canal_id": canal_id})["n"] == 0:
            raise HTTPException(status_code=404, detail=f"Canal de distribución no encontrado: {canal_id}")

    solicitud_id = str(uuid.uuid4())
    ahora = datetime.now(timezone.utc)
    get_client().insert(
        "SOLICITUD_LICENCIA",
        [(
            solicitud_id, body.sello_id, body.paises_solicitados, body.canales_solicitados,
            body.fecha_inicio_propuesta, body.fecha_fin_propuesta, "pendiente", None,
            ahora, None, None,
        )],
        column_names=_SOLICITUD_LICENCIA_COLS,
    )
    audit.record(
        usuario_id=admin["record"]["id"], accion="crear_solicitud_licencia", tabla_afectada="SOLICITUD_LICENCIA",
        antes=None,
        despues={
            "solicitud_id": solicitud_id, "sello_id": body.sello_id,
            "paises_solicitados": body.paises_solicitados, "canales_solicitados": body.canales_solicitados,
            "fecha_inicio_propuesta": str(body.fecha_inicio_propuesta),
            "fecha_fin_propuesta": str(body.fecha_fin_propuesta) if body.fecha_fin_propuesta else None,
        },
    )
    return {"status": "ok", "solicitud_id": solicitud_id, "estado": "pendiente"}


@router.get("/solicitudes-licencia", dependencies=[Depends(require_admin)])
def listar_solicitudes_licencia(estado: str | None = Query(None)):
    where, params = "", {}
    if estado:
        where = "WHERE s.estado = {estado:String}"
        params["estado"] = estado
    return {"data": query_rows(solicitudes_licencia_sql(where), params)}


@router.get("/sellos/{sello_id}/solicitudes-licencia", dependencies=[Depends(require_admin)])
def listar_solicitudes_licencia_de_sello(sello_id: int):
    if query_one(SELLO_EXISTE, {"sello_id": sello_id})["n"] == 0:
        raise HTTPException(status_code=404, detail="Sello no encontrado")
    return {"data": query_rows(solicitudes_licencia_sql("WHERE s.sello_id = {sello_id:UInt32}"), {"sello_id": sello_id})}


def _resolver_solicitud_pendiente(solicitud_id: str) -> dict:
    solicitud = query_one(SOLICITUD_LICENCIA_ACTUAL_POR_ID, {"solicitud_id": solicitud_id})
    if not solicitud:
        raise HTTPException(status_code=404, detail="Solicitud de licencia no encontrada")
    if solicitud["estado"] != "pendiente":
        raise HTTPException(
            status_code=409,
            detail=f"La solicitud ya fue resuelta (estado actual: {solicitud['estado']})",
        )
    return solicitud


@router.post("/solicitudes-licencia/{solicitud_id}/aprobar")
def aprobar_solicitud_licencia(
    solicitud_id: str = Path(..., min_length=1, max_length=64), admin: dict = Depends(require_admin),
):
    solicitud = _resolver_solicitud_pendiente(solicitud_id)
    admin_id = admin["record"]["id"]

    siguiente_id = ((query_one(LICENCIA_ID_MAX) or {}).get("n") or 0) + 1
    licencia_ids: list[int] = []
    for pais_id in solicitud["paises_solicitados"]:
        get_client().insert(
            "DIM_LICENCIA",
            [(siguiente_id, solicitud["sello_id"], pais_id, solicitud["fecha_inicio_propuesta"], solicitud["fecha_fin_propuesta"], "activa")],
            column_names=["licencia_id", "sello_id", "pais_id", "fecha_inicio", "fecha_fin", "estado"],
        )
        licencia_ids.append(siguiente_id)
        siguiente_id += 1

    get_client().insert(
        "SOLICITUD_LICENCIA",
        [(
            solicitud_id, solicitud["sello_id"], solicitud["paises_solicitados"], solicitud["canales_solicitados"],
            solicitud["fecha_inicio_propuesta"], solicitud["fecha_fin_propuesta"], "aprobada", None,
            solicitud["fecha_solicitud"], datetime.now(timezone.utc), admin_id,
        )],
        column_names=_SOLICITUD_LICENCIA_COLS,
    )
    audit.record(
        usuario_id=admin_id, accion="aprobar_solicitud_licencia", tabla_afectada="SOLICITUD_LICENCIA",
        antes={"solicitud_id": solicitud_id, "estado": "pendiente"},
        despues={"solicitud_id": solicitud_id, "estado": "aprobada", "licencia_ids": licencia_ids},
    )
    return {"status": "ok", "solicitud_id": solicitud_id, "estado": "aprobada", "licencia_ids": licencia_ids}


@router.post("/solicitudes-licencia/{solicitud_id}/rechazar")
def rechazar_solicitud_licencia(
    body: RechazarSolicitudBody,
    solicitud_id: str = Path(..., min_length=1, max_length=64),
    admin: dict = Depends(require_admin),
):
    if not body.motivo.strip():
        raise HTTPException(status_code=422, detail="El motivo de rechazo no puede estar vacío")
    solicitud = _resolver_solicitud_pendiente(solicitud_id)
    admin_id = admin["record"]["id"]

    get_client().insert(
        "SOLICITUD_LICENCIA",
        [(
            solicitud_id, solicitud["sello_id"], solicitud["paises_solicitados"], solicitud["canales_solicitados"],
            solicitud["fecha_inicio_propuesta"], solicitud["fecha_fin_propuesta"], "rechazada", body.motivo,
            solicitud["fecha_solicitud"], datetime.now(timezone.utc), admin_id,
        )],
        column_names=_SOLICITUD_LICENCIA_COLS,
    )
    audit.record(
        usuario_id=admin_id, accion="rechazar_solicitud_licencia", tabla_afectada="SOLICITUD_LICENCIA",
        antes={"solicitud_id": solicitud_id, "estado": "pendiente"},
        despues={"solicitud_id": solicitud_id, "estado": "rechazada", "motivo_rechazo": body.motivo},
    )
    return {"status": "ok", "solicitud_id": solicitud_id, "estado": "rechazada"}


# ─────────────────────────────────────────────────────────────────────────────
# 3. Restricciones de reproducción (CU-O41/CU-O42, RF-DIS-005/006)
# ─────────────────────────────────────────────────────────────────────────────

class RestriccionBody(BaseModel):
    fact_id_track: int = Field(ge=1)
    pais_id: int = Field(ge=1)
    canal_id: int = Field(ge=1)
    tipo_restriccion_id: int = Field(ge=1)


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
def desactivar_restriccion(
    fact_id_track: int = Path(..., ge=1),
    pais_id: int = Path(..., ge=1),
    canal_id: int = Path(..., ge=1),
    admin: dict = Depends(require_admin),
):
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

@router.get("/disponibilidad")
def listar_disponibilidad(
    user: dict = Depends(require_b2c_user),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    estado: Literal["todos", "disponible", "bloqueado"] = "todos",
    search: Optional[str] = Query(None),
    pais_id: Optional[int] = Query(None),
):
    """CU-O80: lista navegable del catálogo con su estado de disponibilidad
    para un país, en vez de exigir buscar un track puntual (ver `/disponibilidad/{fact_id_track}` abajo, que se mantiene sin cambios)."""
    if pais_id is not None:
        if query_one(PAIS_EXISTE, {"pais_id": pais_id})["n"] == 0:
            raise HTTPException(status_code=404, detail="País no encontrado")
        resolved_pais_id = pais_id
    else:
        resolved_pais_id = resolver_pais_id(user["record"].get("pais", ""))

    offset = (page - 1) * limit

    if resolved_pais_id is None:
        # País no reconocido: fail-open, mismo criterio que el endpoint
        # puntual (design.md, Decisión 5) — todo se muestra disponible, así
        # que filtrar por "bloqueado" no puede devolver ninguna fila real.
        if estado == "bloqueado":
            return {"data": [], "page": page, "limit": limit, "total": 0, "pais_id": None}

        where_parts = []
        params: dict = {"limit": limit, "offset": offset}
        if search and search.strip():
            where_parts.append(
                "(position(lower(f.track_name), lower({search:String})) > 0 "
                "OR position(lower(a.name), lower({search:String})) > 0)"
            )
            params["search"] = search.strip()
        where = f"WHERE {' AND '.join(where_parts)}" if where_parts else ""
        rows = query_rows(
            f"""
            SELECT f.fact_id AS fact_id_track, f.track_name AS track_name,
                   a.name AS artist_name, 1 AS disponible, NULL AS tipo_restriccion
            FROM FACT_TRACKS f JOIN DIM_ARTISTS a ON f.artist_id = a.artist_id
            {where} ORDER BY f.fact_id LIMIT {{limit:UInt32}} OFFSET {{offset:UInt32}}
            """,
            params,
        )
        total = query_one(
            f"SELECT count() AS n FROM FACT_TRACKS f JOIN DIM_ARTISTS a ON f.artist_id = a.artist_id {where}",
            params,
        )["n"]
        return {"data": rows, "page": page, "limit": limit, "total": total, "pais_id": None}

    where_parts = []
    params = {"pais_id": resolved_pais_id, "canal_id": CANAL_STREAMING_ID, "limit": limit, "offset": offset}
    if estado == "disponible":
        where_parts.append("b.tipo_restriccion_id = 0")
    elif estado == "bloqueado":
        where_parts.append("b.tipo_restriccion_id != 0")
    if search and search.strip():
        where_parts.append(
            "(position(lower(f.track_name), lower({search:String})) > 0 "
            "OR position(lower(a.name), lower({search:String})) > 0)"
        )
        params["search"] = search.strip()
    where = f"WHERE {' AND '.join(where_parts)}" if where_parts else ""

    rows = query_rows(disponibilidad_lista_sql(where), params)
    total = query_one(disponibilidad_lista_total_sql(where), params)["n"]
    return {"data": rows, "page": page, "limit": limit, "total": total, "pais_id": resolved_pais_id}


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
