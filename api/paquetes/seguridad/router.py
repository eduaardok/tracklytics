import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from core.database import get_client, query_one, query_rows
from core.deps import get_current_user
from paquetes.seguridad import audit, pb_client
from paquetes.seguridad.deps import require_admin
from paquetes.seguridad.queries import (
    AUDIT_LOG_RECIENTES,
    DISPOSITIVO_EXISTE,
    ERRORES_RECIENTES,
    PERMISO_VIGENTE_UNO,
    PERMISOS_POR_DEFECTO,
    PERMISOS_VIGENTES,
    SESION_ABIERTA_POR_DISPOSITIVO,
    USUARIO_EXISTE_EN_DIM,
)

router = APIRouter(prefix="/app/v1/seguridad", tags=["Seguridad"])

ROLES_AUTO_REGISTRABLES = ("user", "analyst")  # admin no es autoasignable (CU-O01)


# ─────────────────────────────────────────────────────────────────────────────
# Helpers de escritura a ClickHouse
# ─────────────────────────────────────────────────────────────────────────────

def _insert_dim_usuario(usuario_id: str, email: str, nombre: str, pais: str, rol: str) -> None:
    get_client().insert(
        "DIM_USUARIO",
        [(usuario_id, email, nombre, pais or "", datetime.now(timezone.utc), rol)],
        column_names=["usuario_id", "email", "nombre", "pais", "fecha_registro", "rol"],
    )


def _sembrar_permisos_por_defecto(usuario_id: str, rol: str) -> None:
    permisos = PERMISOS_POR_DEFECTO.get(rol, [])
    if not permisos:
        return
    get_client().insert(
        "FACT_PERMISO_USUARIO",
        [(usuario_id, recurso, accion, True, "sistema") for recurso, accion in permisos],
        column_names=["usuario_id", "recurso", "accion", "permitido", "asignado_por"],
    )


def _infer_os(user_agent: str) -> str:
    ua = user_agent.lower()
    if "windows" in ua:
        return "windows"
    if "android" in ua:
        return "android"
    if "iphone" in ua or "ipad" in ua or "ios" in ua:
        return "ios"
    if "mac os" in ua or "macintosh" in ua:
        return "macos"
    if "linux" in ua:
        return "linux"
    return "desconocido"


def _asegurar_dispositivo(usuario_id: str, dispositivo_id: str, tipo: str, os_: str, app_version: str) -> None:
    if query_one(DISPOSITIVO_EXISTE, {"usuario_id": usuario_id, "dispositivo_id": dispositivo_id}):
        return
    get_client().insert(
        "DIM_DISPOSITIVO",
        [(dispositivo_id, usuario_id, tipo, os_, app_version)],
        column_names=["dispositivo_id", "usuario_id", "tipo", "os", "app_version"],
    )


def _abrir_sesion(sesion_id: str, usuario_id: str, dispositivo_id: str) -> None:
    get_client().insert(
        "FACT_SESION",
        [(sesion_id, usuario_id, dispositivo_id, datetime.now(timezone.utc), None, None, 0)],
        column_names=["sesion_id", "usuario_id", "dispositivo_id", "fecha_inicio", "fecha_fin", "duracion", "fecha_fin_version"],
    )


def _cerrar_sesion(sesion_id: str, usuario_id: str, dispositivo_id: str, fecha_inicio: datetime) -> float:
    ahora = datetime.now(timezone.utc)
    fi = fecha_inicio if fecha_inicio.tzinfo else fecha_inicio.replace(tzinfo=timezone.utc)
    duracion = (ahora - fi).total_seconds()
    get_client().insert(
        "FACT_SESION",
        [(sesion_id, usuario_id, dispositivo_id, fecha_inicio, ahora, duracion, 1)],
        column_names=["sesion_id", "usuario_id", "dispositivo_id", "fecha_inicio", "fecha_fin", "duracion", "fecha_fin_version"],
    )
    return duracion


# ─────────────────────────────────────────────────────────────────────────────
# 1. Registro, login, logout (CU-O01)
# ─────────────────────────────────────────────────────────────────────────────

class RegistroBody(BaseModel):
    email: str
    password: str
    nombre: str
    pais: str = ""
    rol: str = "user"


class LoginBody(BaseModel):
    email: str
    password: str
    dispositivo_id: str
    tipo: str = "web"
    app_version: str = "web-1.0"


class LogoutBody(BaseModel):
    dispositivo_id: str


@router.post("/auth/registro", status_code=201)
async def registro(body: RegistroBody):
    if body.rol not in ROLES_AUTO_REGISTRABLES:
        raise HTTPException(
            status_code=422,
            detail=f"Rol inválido para autoregistro: debe ser uno de {ROLES_AUTO_REGISTRABLES}",
        )

    pb_record = await pb_client.crear_usuario(body.email, body.password, body.nombre, body.pais, body.rol)
    usuario_id = pb_record["id"]

    _insert_dim_usuario(usuario_id, body.email, body.nombre, body.pais, body.rol)
    _sembrar_permisos_por_defecto(usuario_id, body.rol)
    audit.record(
        usuario_id=usuario_id,
        accion="registro_usuario",
        tabla_afectada="DIM_USUARIO",
        antes=None,
        despues={"email": body.email, "nombre": body.nombre, "pais": body.pais, "rol": body.rol},
    )

    return {"status": "ok", "usuario_id": usuario_id, "email": body.email, "rol": body.rol}


@router.post("/auth/login")
async def login(body: LoginBody, request: Request):
    pb_resp = await pb_client.login(body.email, body.password)
    record = pb_resp["record"]
    usuario_id = record["id"]
    rol = record.get("role", "user")

    # Backfill: usuarios creados antes de que existiera esta capability no
    # tienen fila en DIM_USUARIO/FACT_PERMISO_USUARIO — se completa en su
    # próximo login (design.md, Migration Plan).
    if not query_one(USUARIO_EXISTE_EN_DIM, {"usuario_id": usuario_id}):
        _insert_dim_usuario(usuario_id, record.get("email", body.email), record.get("name", ""), record.get("pais", ""), rol)
        _sembrar_permisos_por_defecto(usuario_id, rol)

    os_ = _infer_os(request.headers.get("user-agent", ""))
    _asegurar_dispositivo(usuario_id, body.dispositivo_id, body.tipo, os_, body.app_version)

    sesion_id = str(uuid.uuid4())
    _abrir_sesion(sesion_id, usuario_id, body.dispositivo_id)

    # Pass-through: el token/record devuelto es el mismo que emite PocketBase,
    # sin intermediación (design.md, "El token que valida analitica...").
    return pb_resp


@router.post("/auth/logout")
async def logout(body: LogoutBody, user: dict = Depends(get_current_user)):
    usuario_id = user["record"]["id"]
    abierta = query_one(SESION_ABIERTA_POR_DISPOSITIVO, {"usuario_id": usuario_id, "dispositivo_id": body.dispositivo_id})
    if abierta:
        _cerrar_sesion(abierta["sesion_id"], usuario_id, body.dispositivo_id, abierta["fecha_inicio"])
    return {"status": "ok"}


# ─────────────────────────────────────────────────────────────────────────────
# 2. Gestión de permisos granulares por rol (CU-O17)
# ─────────────────────────────────────────────────────────────────────────────

class PermisoBody(BaseModel):
    usuario_id: str
    recurso: str
    accion: str
    permitido: bool


@router.get("/permisos/{usuario_id}")
def consultar_permisos(usuario_id: str, admin: dict = Depends(require_admin)):
    return {"data": query_rows(PERMISOS_VIGENTES, {"usuario_id": usuario_id})}


@router.post("/permisos")
def asignar_permiso(body: PermisoBody, admin: dict = Depends(require_admin)):
    previo = query_one(PERMISO_VIGENTE_UNO, {
        "usuario_id": body.usuario_id, "recurso": body.recurso, "accion": body.accion,
    })
    admin_id = admin["record"]["id"]

    get_client().insert(
        "FACT_PERMISO_USUARIO",
        [(body.usuario_id, body.recurso, body.accion, body.permitido, admin_id)],
        column_names=["usuario_id", "recurso", "accion", "permitido", "asignado_por"],
    )
    audit.record(
        usuario_id=admin_id,
        accion="otorgar_permiso" if body.permitido else "revocar_permiso",
        tabla_afectada="FACT_PERMISO_USUARIO",
        antes={"usuario_id": body.usuario_id, "recurso": body.recurso, "accion": body.accion,
               "permitido": previo.get("permitido") if previo else None},
        despues={"usuario_id": body.usuario_id, "recurso": body.recurso, "accion": body.accion,
                 "permitido": body.permitido},
    )
    return {"status": "ok"}


# ─────────────────────────────────────────────────────────────────────────────
# 3. Auditoría de operaciones sensibles (CU-O18)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/auditoria")
def consultar_auditoria(limit: int = Query(50, ge=1, le=500), admin: dict = Depends(require_admin)):
    return {"data": query_rows(AUDIT_LOG_RECIENTES, {"limit": limit})}


# ─────────────────────────────────────────────────────────────────────────────
# 4. Registro y consulta de errores de sistema (CU-O19)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/errores")
def consultar_errores(limit: int = Query(50, ge=1, le=500), admin: dict = Depends(require_admin)):
    return {"data": query_rows(ERRORES_RECIENTES, {"limit": limit})}
