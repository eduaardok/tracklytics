import uuid
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from core.database import execute, get_client, query_one, query_rows
from core.deps import get_current_user
from paquetes.seguridad import audit, pb_client
from paquetes.seguridad.deps import require_admin, require_rol_admin, roles_admin_vigentes
from paquetes.seguridad.queries import (
    ACCIONES_POR_DIA,
    AUDIT_LOG_RECIENTES,
    CATALOGO_ROLES_ADMIN,
    DISPOSITIVO_EXISTE,
    ERRORES_RECIENTES,
    ERRORES_ULTIMAS_24H,
    ESTADO_CUENTA_VIGENTE,
    LOGIN_FALLIDOS_RECIENTES,
    MI_PERFIL,
    MIS_SESIONES_ABIERTAS,
    PERMISO_VIGENTE_UNO,
    PERMISOS_POR_DEFECTO,
    PERMISOS_VIGENTES,
    ROL_ADMIN_EXISTE,
    ROLES_ADMIN_VIGENTES_DETALLE,
    SESION_ABIERTA_POR_DISPOSITIVO,
    SESION_POR_ID,
    SESIONES_ABIERTAS_TOTAL,
    TOKEN_RECUPERACION_VIGENTE,
    TRANSACCIONES_RECIENTES_USUARIO,
    ULTIMO_LOGIN_USUARIO,
    USUARIO_360_BASE,
    USUARIO_POR_ID,
    USUARIOS_BUSQUEDA,
    usuarios_admin_listado_sql,
    usuarios_admin_total_sql,
    usuarios_listado_sql,
    usuarios_listado_total_sql,
)
from paquetes.suscripciones import pb_client as susc_pb

router = APIRouter(prefix="/app/v1/seguridad", tags=["Seguridad"])

# Lockout (change roles-gestion-usuarios): 5+ intentos fallidos del mismo email
# en 15 minutos bloquean temporalmente el login.
MAX_INTENTOS_LOGIN = 5
# Vigencia de un token de recuperación de contraseña.
TOKEN_RECUPERACION_TTL_MIN = 30

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
    # Lockout (change roles-gestion-usuarios): antes de tocar PocketBase, si el
    # email acumuló >=5 intentos fallidos en los últimos 15 min, se rechaza sin
    # validar la contraseña. Los fallos se registran en FACT_AUDIT_LOG con
    # accion='login_fallido' y usuario_id=email (no hay identidad en un fallo).
    fallidos = (query_one(LOGIN_FALLIDOS_RECIENTES, {"email": body.email}) or {}).get("n", 0)
    if fallidos >= MAX_INTENTOS_LOGIN:
        raise HTTPException(
            status_code=429,
            detail="Cuenta bloqueada temporalmente, intenta en 15 minutos",
        )

    try:
        pb_resp = await pb_client.login(body.email, body.password)
    except HTTPException as exc:
        if exc.status_code == 401:
            audit.record(
                usuario_id=body.email, accion="login_fallido",
                tabla_afectada="FACT_SESION", antes=None,
                despues={"email": body.email},
            )
        raise

    record = pb_resp["record"]
    usuario_id = record["id"]
    rol = record.get("role", "user")

    # Estado de cuenta (change roles-gestion-usuarios): una cuenta suspendida o
    # dada de baja no puede iniciar sesión, aunque PocketBase valide sus
    # credenciales — el estado lo gobierna Tracklytics, no PocketBase.
    estado = (query_one(ESTADO_CUENTA_VIGENTE, {"usuario_id": usuario_id}) or {}).get("estado_cuenta") or "activa"
    if estado == "suspendido":
        raise HTTPException(status_code=403, detail="Cuenta suspendida")
    if estado == "eliminado":
        raise HTTPException(status_code=403, detail="Cuenta dada de baja")

    # Backfill: usuarios creados antes de que existiera esta capability no
    # tienen fila en DIM_USUARIO/FACT_PERMISO_USUARIO — se completa en su
    # próximo login (design.md, Migration Plan).
    fila_dim = query_one(USUARIO_POR_ID, {"usuario_id": usuario_id})
    if not fila_dim:
        _insert_dim_usuario(usuario_id, record.get("email", body.email), record.get("name", ""), record.get("pais", ""), rol)
        _sembrar_permisos_por_defecto(usuario_id, rol)
    elif fila_dim.get("rol") != rol:
        # Bugfix S11: DIM_USUARIO.rol solo se escribía una vez, al crear la
        # cuenta (aquí o en el backfill de arriba) — si el rol cambiaba
        # después en PocketBase (fuente real de autorización), el espejo
        # analítico quedaba desincronizado para siempre (caso real:
        # admin@demo.tracklytics.com, promovido a admin en PocketBase sin
        # que DIM_USUARIO se enterara). PocketBase es la fuente de verdad;
        # cada login re-sincroniza el rol del espejo si divergió.
        execute(
            "ALTER TABLE DIM_USUARIO UPDATE rol = {rol:String} WHERE usuario_id = {usuario_id:String}",
            {"rol": rol, "usuario_id": usuario_id},
        )
        _sembrar_permisos_por_defecto(usuario_id, rol)

    os_ = _infer_os(request.headers.get("user-agent", ""))
    _asegurar_dispositivo(usuario_id, body.dispositivo_id, body.tipo, os_, body.app_version)

    # Bugfix QA S10 ronda 2: antes cada login abría una fila nueva en
    # FACT_SESION sin importar si ya había una sesión abierta para el mismo
    # dispositivo — un usuario que se loguea de nuevo sin cerrar sesión antes
    # (token expirado, doble submit, recarga) acumulaba filas "abiertas" para
    # siempre, porque `logout`/cierre remoto solo resuelve la MÁS RECIENTE
    # (`SESION_ABIERTA_POR_DISPOSITIVO`, `ORDER BY fecha_inicio DESC LIMIT 1`)
    # — las anteriores quedaban huérfanas, visibles en "Mis sesiones" con
    # timestamps casi idénticos. Cierra cualquier sesión previa del mismo
    # dispositivo antes de abrir la nueva, mismo criterio que un re-login
    # reemplaza la sesión anterior.
    abierta = query_one(SESION_ABIERTA_POR_DISPOSITIVO, {"usuario_id": usuario_id, "dispositivo_id": body.dispositivo_id})
    if abierta:
        _cerrar_sesion(abierta["sesion_id"], usuario_id, body.dispositivo_id, abierta["fecha_inicio"])

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
# Sesiones multi-dispositivo (S10 Día 3): antes solo se podía abrir/cerrar la
# sesión del propio dispositivo (login/logout) — no había forma de ver ni
# cerrar remotamente una sesión abierta en otro dispositivo.
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/sesiones")
def mis_sesiones(user: dict = Depends(get_current_user)):
    return {"data": query_rows(MIS_SESIONES_ABIERTAS, {"usuario_id": user["record"]["id"]})}


@router.delete("/sesiones/{sesion_id}")
def cerrar_sesion_remota(sesion_id: str, user: dict = Depends(get_current_user)):
    sesion = query_one(SESION_POR_ID, {"sesion_id": sesion_id})
    if not sesion or sesion["fecha_fin"] is not None:
        raise HTTPException(status_code=404, detail="Sesión no encontrada o ya cerrada")
    if sesion["usuario_id"] != user["record"]["id"]:
        raise HTTPException(status_code=403, detail="Esta sesión no pertenece a este usuario")
    _cerrar_sesion(sesion_id, sesion["usuario_id"], sesion["dispositivo_id"], sesion["fecha_inicio"])
    audit.record(
        usuario_id=user["record"]["id"], accion="cerrar_sesion_remota",
        tabla_afectada="FACT_SESION", antes={"sesion_id": sesion_id}, despues=None,
    )
    return {"status": "ok"}


@router.get("/admin/dashboard")
def dashboard_seguridad(admin: dict = Depends(require_admin)):
    return {
        "acciones_por_dia":       query_rows(ACCIONES_POR_DIA),
        "errores_24h":            (query_one(ERRORES_ULTIMAS_24H) or {}).get("n", 0),
        "sesiones_abiertas_total": (query_one(SESIONES_ABIERTAS_TOTAL) or {}).get("n", 0),
    }


class ActualizarPerfilBody(BaseModel):
    nombre: str | None = None
    pais: str | None = None
    # Perfiles públicos/privados (S10 ronda 2): solo vive en DIM_USUARIO, no
    # tiene contraparte en PocketBase (a diferencia de nombre/pais) — no hay
    # ninguna regla de acceso de PocketBase que dependa de este flag.
    perfil_publico: bool | None = None


@router.get("/perfil")
def mi_perfil(user: dict = Depends(get_current_user)):
    fila = query_one(MI_PERFIL, {"usuario_id": user["record"]["id"]})
    if not fila:
        raise HTTPException(status_code=404, detail="Perfil no encontrado")
    return {**fila, "perfil_publico": bool(fila["perfil_publico"])}


@router.patch("/perfil")
async def actualizar_perfil(body: ActualizarPerfilBody, user: dict = Depends(get_current_user)):
    """Autoservicio (a diferencia de /permisos, esto es exclusivamente sobre
    el propio usuario): antes no existía forma de corregir el país declarado
    tras el registro, ni de persistir el nombre editado en profile.html (solo
    se guardaba en localStorage) — auditoría 2026-07-09."""
    usuario_id = user["record"]["id"]
    pb_campos = {k: v for k, v in {"name": body.nombre, "pais": body.pais}.items() if v is not None}
    if not pb_campos and body.perfil_publico is None:
        raise HTTPException(status_code=422, detail="No se proporcionaron campos para actualizar")

    if pb_campos:
        await pb_client.actualizar_usuario(user["token"], usuario_id, pb_campos)

    ch_campos = {k: v for k, v in {"nombre": body.nombre, "pais": body.pais}.items() if v is not None}
    assignments, params = [], {"usuario_id": usuario_id}
    for k, v in ch_campos.items():
        assignments.append(f"{k} = {{{k}:String}}")
        params[k] = v
    if body.perfil_publico is not None:
        assignments.append("perfil_publico = {perfil_publico:UInt8}")
        params["perfil_publico"] = int(body.perfil_publico)
    if assignments:
        execute(
            f"ALTER TABLE DIM_USUARIO UPDATE {', '.join(assignments)} WHERE usuario_id = {{usuario_id:String}}",
            params,
        )

    resultado = dict(ch_campos)
    if body.perfil_publico is not None:
        resultado["perfil_publico"] = body.perfil_publico
    return {"status": "ok", **resultado}


class CambiarPasswordBody(BaseModel):
    password_actual:           str
    password_nueva:            str
    password_nueva_confirmar:  str


@router.patch("/password")
async def cambiar_password(body: CambiarPasswordBody, user: dict = Depends(get_current_user)):
    """Autoservicio, exclusivamente sobre la propia contraseña — no reinventa
    hashing en Python, delega en el propio update de PocketBase (`oldPassword`
    + `password` + `passwordConfirm` sobre el registro del propio usuario, el
    mismo mecanismo nativo que ya usa `pb_client.actualizar_usuario`). El
    `updateRule` de `users` en pb_init.py (`id = @request.auth.id`) ya limita
    esto al propio usuario; PocketBase valida `oldPassword` server-side antes
    de aceptar el cambio."""
    if body.password_nueva != body.password_nueva_confirmar:
        raise HTTPException(status_code=422, detail="Las contraseñas nuevas no coinciden")
    if len(body.password_nueva) < 8:
        raise HTTPException(status_code=422, detail="La nueva contraseña debe tener al menos 8 caracteres")

    usuario_id = user["record"]["id"]
    try:
        await pb_client.actualizar_usuario(user["token"], usuario_id, {
            "oldPassword":     body.password_actual,
            "password":        body.password_nueva,
            "passwordConfirm": body.password_nueva_confirmar,
        })
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 400:
            raise HTTPException(status_code=400, detail="La contraseña actual no es correcta") from exc
        raise

    audit.record(
        usuario_id=usuario_id, accion="cambiar_password",
        tabla_afectada="DIM_USUARIO", antes=None, despues={"usuario_id": usuario_id},
    )
    return {"status": "ok"}


# ─────────────────────────────────────────────────────────────────────────────
# 2. Gestión de permisos granulares por rol (CU-O17)
# ─────────────────────────────────────────────────────────────────────────────

class PermisoBody(BaseModel):
    usuario_id: str
    recurso: str
    accion: str
    permitido: bool


@router.get("/usuarios/buscar")
def buscar_usuarios(
    q:             str = Query(""),
    limit:         int = Query(20, ge=1, le=200),
    page:          int = Query(1, ge=1),
    rol:           str | None = Query(None),
    fecha_desde:   str | None = Query(None),
    fecha_hasta:   str | None = Query(None),
    admin: dict = Depends(require_admin),
):
    if not q.strip():
        # Panel "Permisos" (CU-O17, más "pro"): sin término de búsqueda, lista
        # la tabla completa de usuarios paginada en vez de devolver [] — antes
        # esta ruta solo servía para autocompletar, sin una vista de listado
        # (auditoría 2026-07-09). Filtrable por rol/rango de fecha de registro
        # sin escribir nada (S10 ronda 2) — ver usuarios_listado_sql en
        # queries.py para por qué no hay filtro de plan.
        clauses, params = [], {}
        if rol:
            clauses.append("rol = {rol:String}")
            params["rol"] = rol
        if fecha_desde:
            clauses.append("fecha_registro >= {fecha_desde:String}")
            params["fecha_desde"] = fecha_desde
        if fecha_hasta:
            clauses.append("fecha_registro <= {fecha_hasta:String}")
            params["fecha_hasta"] = fecha_hasta
        where  = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        offset = (page - 1) * limit
        rows   = query_rows(usuarios_listado_sql(where), {**params, "limit": limit, "offset": offset})
        total  = query_one(usuarios_listado_total_sql(where), params)["n"]
        return {"data": rows, "total": total, "page": page, "limit": limit}
    pattern = f"%{q.strip()}%"
    rows = query_rows(USUARIOS_BUSQUEDA, {"pattern": pattern, "limit": limit})
    return {"data": rows, "total": len(rows), "page": 1, "limit": limit}


# Recursos/acciones ya usados en el sistema (PERMISOS_POR_DEFECTO) — sirve de
# catálogo para el selector del panel de permisos en vez de dejar `recurso`
# como texto totalmente libre.
_RECURSOS_CONOCIDOS = sorted({r for perms in PERMISOS_POR_DEFECTO.values() for r, _ in perms})
_ACCIONES_CONOCIDAS = sorted({a for perms in PERMISOS_POR_DEFECTO.values() for _, a in perms})


@router.get("/permisos/catalogo")
def catalogo_permisos(admin: dict = Depends(require_admin)):
    return {"recursos": _RECURSOS_CONOCIDOS, "acciones": _ACCIONES_CONOCIDAS}


@router.get("/permisos/{usuario_id}")
def consultar_permisos(usuario_id: str, admin: dict = Depends(require_admin)):
    usuario = query_one(USUARIO_POR_ID, {"usuario_id": usuario_id})
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return {"usuario": usuario, "data": query_rows(PERMISOS_VIGENTES, {"usuario_id": usuario_id})}


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


# ─────────────────────────────────────────────────────────────────────────────
# 5. Recuperación de contraseña simulada (change roles-gestion-usuarios)
#    Token de un solo uso, sin envío de correo real (patrón de simulación del
#    proyecto). El endpoint nunca revela si el correo existe.
# ─────────────────────────────────────────────────────────────────────────────

class RecuperarBody(BaseModel):
    email: str


class RestablecerBody(BaseModel):
    token: str
    nueva_password: str


_MENSAJE_RECUPERACION = "Si el email existe, recibirás instrucciones"


@router.post("/auth/recuperar")
async def recuperar_password(body: RecuperarBody):
    usuario = await pb_client.buscar_por_email(body.email)
    if usuario:
        token = str(uuid.uuid4())
        expira = datetime.now(timezone.utc) + timedelta(minutes=TOKEN_RECUPERACION_TTL_MIN)
        get_client().insert(
            "FACT_TOKEN_RECUPERACION",
            [(token, usuario["id"], expira, 0, datetime.now(timezone.utc))],
            column_names=["token", "usuario_id", "expira_en", "usado", "created_at"],
        )
        audit.record(
            usuario_id=usuario["id"], accion="solicitar_recuperacion_password",
            tabla_afectada="FACT_TOKEN_RECUPERACION", antes=None,
            despues={"email": body.email},
        )
    # Respuesta genérica idéntica exista o no el correo — no filtra qué correos
    # están registrados.
    return {"status": "ok", "mensaje": _MENSAJE_RECUPERACION}


@router.post("/auth/restablecer")
async def restablecer_password(body: RestablecerBody):
    if len(body.nueva_password) < 8:
        raise HTTPException(status_code=422, detail="La nueva contraseña debe tener al menos 8 caracteres")

    fila = query_one(TOKEN_RECUPERACION_VIGENTE, {"token": body.token})
    if not fila:
        raise HTTPException(status_code=400, detail="Token inválido")
    if fila.get("usado"):
        raise HTTPException(status_code=400, detail="Token ya utilizado")
    expira = fila["expira_en"]
    expira = expira if expira.tzinfo else expira.replace(tzinfo=timezone.utc)
    if expira < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Token expirado")

    usuario_id = fila["usuario_id"]
    await pb_client.admin_cambiar_password(usuario_id, body.nueva_password)

    # Marca el token como usado: fila nueva con usado=1 y created_at mayor —
    # resuelto por argMax en TOKEN_RECUPERACION_VIGENTE (no se muta la fila).
    get_client().insert(
        "FACT_TOKEN_RECUPERACION",
        [(body.token, usuario_id, fila["expira_en"], 1, datetime.now(timezone.utc))],
        column_names=["token", "usuario_id", "expira_en", "usado", "created_at"],
    )
    audit.record(
        usuario_id=usuario_id, accion="restablecer_password",
        tabla_afectada="FACT_TOKEN_RECUPERACION", antes=None,
        despues={"token_usado": True},
    )
    return {"status": "ok"}


# ─────────────────────────────────────────────────────────────────────────────
# 6. Baja de cuenta propia (change roles-gestion-usuarios)
#    Marca estado_cuenta='eliminado', cierra sesiones y cancela la suscripción
#    activa. No borra datos históricos de ClickHouse (retención analítica).
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/perfil/baja")
async def baja_cuenta(user: dict = Depends(get_current_user)):
    usuario_id = user["record"]["id"]

    # Cancela la suscripción activa si la tiene (con el token del propio usuario).
    try:
        activas = await susc_pb.list_activas(user["token"], usuario_id)
        for sub in activas:
            await susc_pb.cancelar(user["token"], sub["id"])
    except Exception:
        pass  # la baja no debe fallar si la cancelación de suscripción falla

    # Cierra todas las sesiones abiertas del usuario.
    for s in query_rows(MIS_SESIONES_ABIERTAS, {"usuario_id": usuario_id}):
        _cerrar_sesion(s["sesion_id"], usuario_id, s["dispositivo_id"], s["fecha_inicio"])

    execute(
        "ALTER TABLE DIM_USUARIO UPDATE estado_cuenta = 'eliminado' WHERE usuario_id = {usuario_id:String}",
        {"usuario_id": usuario_id},
    )
    audit.record(
        usuario_id=usuario_id, accion="baja_cuenta_propia",
        tabla_afectada="DIM_USUARIO", antes={"estado_cuenta": "activa"},
        despues={"estado_cuenta": "eliminado"},
    )
    return {"status": "ok", "mensaje": "Cuenta dada de baja"}


# ─────────────────────────────────────────────────────────────────────────────
# 7. Gestión administrativa de usuarios (change roles-gestion-usuarios)
#    Panel transversal exclusivo de `superadmin`: listado, vista 360°, roles
#    administrativos y suspensión/reactivación de cuentas.
# ─────────────────────────────────────────────────────────────────────────────

class AsignarRolAdminBody(BaseModel):
    rol_admin: str


@router.get("/admin/roles-admin")
def catalogo_roles_admin(admin: dict = Depends(require_admin)):
    """Catálogo cerrado de roles administrativos (DIM_ROL_ADMINISTRATIVO)."""
    return {"data": query_rows(CATALOGO_ROLES_ADMIN)}


@router.get("/admin/usuarios")
def listar_usuarios_admin(
    limit:        int = Query(20, ge=1, le=200),
    page:         int = Query(1, ge=1),
    rol:          str | None = Query(None),
    estado:       str | None = Query(None),
    fecha_desde:  str | None = Query(None),
    fecha_hasta:  str | None = Query(None),
    admin: dict = Depends(require_admin),
):
    """Listado paginado con estado_cuenta, filtrable por rol, estado de cuenta
    y rango de fecha de registro. El filtro de estado se aplica sobre el estado
    vigente (resuelto por argMax dentro del HAVING)."""
    clauses, params = [], {}
    if rol:
        clauses.append("rol = {rol:String}")
        params["rol"] = rol
    if fecha_desde:
        clauses.append("fecha_registro >= {fecha_desde:String}")
        params["fecha_desde"] = fecha_desde
    if fecha_hasta:
        clauses.append("fecha_registro <= {fecha_hasta:String}")
        params["fecha_hasta"] = fecha_hasta
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    having = "HAVING estado_cuenta = {estado:String}" if estado else ""
    if estado:
        params["estado"] = estado
    offset = (page - 1) * limit
    rows = query_rows(usuarios_admin_listado_sql(where, having), {**params, "limit": limit, "offset": offset})
    total = query_one(usuarios_admin_total_sql(where, having), params)["n"]
    return {"data": rows, "total": total, "page": page, "limit": limit}


@router.get("/admin/usuarios/{usuario_id}")
async def usuario_360(usuario_id: str, admin: dict = Depends(require_admin)):
    """Vista 360°: perfil + estado + roles admin + suscripción activa +
    transacciones recientes + sesiones activas + permisos vigentes + último
    login. Consolida DIM_USUARIO, BRIDGE_USUARIO_ROL_ADMIN, FACT_SESION,
    FACT_TRANSACCION_PAGO y FACT_PERMISO_USUARIO."""
    base = query_one(USUARIO_360_BASE, {"usuario_id": usuario_id})
    if not base:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    try:
        suscripcion = await susc_pb.list_activas_admin(usuario_id)
    except Exception:
        suscripcion = []

    ultimo = (query_one(ULTIMO_LOGIN_USUARIO, {"usuario_id": usuario_id}) or {}).get("ultimo_login")
    return {
        "perfil":         {**base, "perfil_publico": bool(base["perfil_publico"])},
        "roles_admin":    query_rows(ROLES_ADMIN_VIGENTES_DETALLE, {"usuario_id": usuario_id}),
        "suscripcion_activa": suscripcion[0] if suscripcion else None,
        "transacciones":  query_rows(TRANSACCIONES_RECIENTES_USUARIO, {"usuario_id": usuario_id, "limit": 10}),
        "sesiones_activas": query_rows(MIS_SESIONES_ABIERTAS, {"usuario_id": usuario_id}),
        "permisos":       query_rows(PERMISOS_VIGENTES, {"usuario_id": usuario_id}),
        "ultimo_login":   ultimo,
    }


@router.post("/admin/usuarios/{usuario_id}/rol-admin")
def asignar_rol_admin(usuario_id: str, body: AsignarRolAdminBody, admin: dict = Depends(require_admin)):
    if not query_one(USUARIO_POR_ID, {"usuario_id": usuario_id}):
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if not query_one(ROL_ADMIN_EXISTE, {"rol_admin": body.rol_admin}):
        raise HTTPException(status_code=422, detail=f"Rol administrativo desconocido: {body.rol_admin}")

    admin_id = admin["record"]["id"]
    get_client().insert(
        "BRIDGE_USUARIO_ROL_ADMIN",
        [(usuario_id, body.rol_admin, admin_id, 0, datetime.now(timezone.utc))],
        column_names=["usuario_id", "rol_admin", "asignado_por", "revocado", "fecha"],
    )
    audit.record(
        usuario_id=admin_id, accion="asignar_rol_admin",
        tabla_afectada="BRIDGE_USUARIO_ROL_ADMIN", antes=None,
        despues={"usuario_id": usuario_id, "rol_admin": body.rol_admin},
    )
    return {"status": "ok"}


@router.delete("/admin/usuarios/{usuario_id}/rol-admin/{rol_admin}")
def revocar_rol_admin(usuario_id: str, rol_admin: str, admin: dict = Depends(require_admin)):
    admin_id = admin["record"]["id"]
    # Revocación = borrado lógico (fila nueva con revocado=1 y fecha mayor).
    get_client().insert(
        "BRIDGE_USUARIO_ROL_ADMIN",
        [(usuario_id, rol_admin, admin_id, 1, datetime.now(timezone.utc))],
        column_names=["usuario_id", "rol_admin", "asignado_por", "revocado", "fecha"],
    )
    audit.record(
        usuario_id=admin_id, accion="revocar_rol_admin",
        tabla_afectada="BRIDGE_USUARIO_ROL_ADMIN",
        antes={"usuario_id": usuario_id, "rol_admin": rol_admin}, despues=None,
    )
    return {"status": "ok"}


def _cambiar_estado_cuenta(usuario_id: str, nuevo_estado: str, admin_id: str, accion: str) -> None:
    if not query_one(USUARIO_POR_ID, {"usuario_id": usuario_id}):
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    execute(
        "ALTER TABLE DIM_USUARIO UPDATE estado_cuenta = {estado:String} WHERE usuario_id = {usuario_id:String}",
        {"estado": nuevo_estado, "usuario_id": usuario_id},
    )
    audit.record(
        usuario_id=admin_id, accion=accion,
        tabla_afectada="DIM_USUARIO", antes=None,
        despues={"usuario_id": usuario_id, "estado_cuenta": nuevo_estado},
    )


@router.post("/admin/usuarios/{usuario_id}/suspender")
def suspender_usuario(usuario_id: str, admin: dict = Depends(require_admin)):
    _cambiar_estado_cuenta(usuario_id, "suspendido", admin["record"]["id"], "suspender_cuenta")
    return {"status": "ok", "estado_cuenta": "suspendido"}


@router.post("/admin/usuarios/{usuario_id}/reactivar")
def reactivar_usuario(usuario_id: str, admin: dict = Depends(require_admin)):
    _cambiar_estado_cuenta(usuario_id, "activa", admin["record"]["id"], "reactivar_cuenta")
    return {"status": "ok", "estado_cuenta": "activa"}
