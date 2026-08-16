import httpx
from fastapi import Depends, Header, HTTPException, Request

from core.config import PB_URL
from core.database import get_client, query_one

# Estado de cuenta vigente (change roles-gestion-usuarios): PocketBase no conoce
# `estado_cuenta` — vive solo en el espejo DIM_USUARIO de ClickHouse. Se resuelve
# con argMax sobre actualizado_en por si el ReplacingMergeTree aún no fusionó
# partes duplicadas. Inline (no import de `paquetes`) para no invertir la capa.
_ESTADO_CUENTA_SQL = """
SELECT argMax(estado_cuenta, actualizado_en) AS estado_cuenta
FROM DIM_USUARIO WHERE usuario_id = {usuario_id:String}
"""


def get_db():
    return get_client()


def _rechazar_si_cuenta_inactiva(usuario_id: str) -> None:
    """Rechaza con 403 una cuenta suspendida o eliminada, aunque su token de
    PocketBase siga siendo válido — el estado lo gobierna Tracklytics, no
    PocketBase (design.md, decisión 4). Best-effort ante fallo de lectura: no
    bloquea el acceso si ClickHouse no responde (fail-open, mismo criterio que
    el resto de correlaciones best-effort de esta capa)."""
    try:
        fila = query_one(_ESTADO_CUENTA_SQL, {"usuario_id": usuario_id})
    except Exception:
        return
    estado = (fila or {}).get("estado_cuenta") or "activa"
    if estado == "suspendido":
        raise HTTPException(status_code=403, detail="Cuenta suspendida")
    if estado == "eliminado":
        raise HTTPException(status_code=403, detail="Cuenta dada de baja")


async def get_current_user(request: Request, authorization: str = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")
    token = authorization.removeprefix("Bearer ").strip()
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.post(
                f"{PB_URL}/api/collections/users/auth-refresh",
                headers={"Authorization": f"Bearer {token}"},
            )
        if not resp.is_success:
            raise HTTPException(status_code=401, detail="Invalid token")
        user = resp.json()
        # Correlación best-effort para FACT_ERROR_SISTEMA (capability
        # `seguridad`, CU-O19): si el exception handler global se dispara para
        # esta request, ya puede asociar el error a un usuario resuelto.
        usuario_id = user.get("record", {}).get("id")
        request.state.usuario_id = usuario_id
        if usuario_id:
            _rechazar_si_cuenta_inactiva(usuario_id)
        return user
    except httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail=f"Auth service unavailable: {exc}")


async def get_current_user_optional(
    request: Request, authorization: str = Header(None)
) -> dict | None:
    """Sesión opcional: devuelve el usuario si llega un token válido y `None` si
    no llega token o si no es válido, sin lanzar 401 nunca.

    Lo usa la búsqueda unificada (`catalogo`), que es pública pero necesita saber
    quién pregunta para incluir sus playlists privadas además de las públicas
    (design.md, Decisión 9). Un token inválido degrada a anónimo en vez de
    romper la búsqueda: el resultado sigue siendo correcto, solo más pequeño.
    """
    if not authorization or not authorization.startswith("Bearer "):
        return None
    try:
        return await get_current_user(request, authorization)
    except HTTPException as exc:
        # Una cuenta suspendida o dada de baja (403) sí debe seguir bloqueada:
        # solo el fallo de autenticación degrada a anónimo.
        if exc.status_code == 401:
            return None
        raise


def verify_analytics_access(user: dict = Depends(get_current_user)) -> dict:
    """FASE 8 (Prompt 10): además de `role` crudo ('admin'/'analyst'), acepta
    superadmin vigente en BRIDGE_USUARIO_ROL_ADMIN — mismo fallback que
    `_es_staff_interno` (paquetes/analitica/deps.py) y `require_rol_admin`
    (paquetes/seguridad/deps.py). Sin esto, cuentas admin asignadas por el
    BRIDGE (ej. `superadmin@demo.tracklytics.com`, `role` crudo "user") caían
    en 403 "Insufficient permissions" en el único consumidor de este guard
    (`GET /experiencia/playlists/top-tracks`) — reportado como "no carga".
    Import local (no a nivel de módulo) para evitar el ciclo
    `core.deps` -> `paquetes.seguridad.deps` -> `core.deps`."""
    role = user.get("record", {}).get("role", "")
    if role in ("admin", "analyst"):
        return user
    usuario_id = user.get("record", {}).get("id", "")
    if usuario_id:
        from paquetes.seguridad.deps import roles_admin_vigentes
        if "superadmin" in roles_admin_vigentes(usuario_id):
            return user
    raise HTTPException(status_code=403, detail="Insufficient permissions")


def require_b2c_user(user: dict = Depends(get_current_user)) -> dict:
    """Gating compartido por `biblioteca` (RN-CAT-004) y `social` (RN-SOC-001):
    ambas restringen su escritura a Usuario B2C, bloqueando a Cliente B2B."""
    role = user.get("record", {}).get("role", "")
    if role == "analyst":
        raise HTTPException(status_code=403, detail="Esta acción es exclusiva de Usuario B2C")
    return user
