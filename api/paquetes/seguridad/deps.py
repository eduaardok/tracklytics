from datetime import datetime, timezone

from fastapi import Depends, HTTPException

from core.database import get_client, query_one, query_rows
from core.deps import get_current_user
from paquetes.seguridad.queries import (
    PERMISO_VIGENTE_UNO,
    ROLES_ADMIN_VIGENTES,
)


def roles_admin_vigentes(usuario_id: str) -> set[str]:
    """Roles administrativos vigentes de un usuario, resueltos contra
    BRIDGE_USUARIO_ROL_ADMIN (revocación = borrado lógico, argMax por fecha).
    No se cachea: es un check de autorización que debe reflejar de inmediato
    una asignación/revocación/suspensión recién hecha (ver design.md, decisión
    3 y la verificación por rol)."""
    rows = query_rows(ROLES_ADMIN_VIGENTES, {"usuario_id": usuario_id})
    return {r["rol_admin"] for r in rows}


def _asegurar_superadmin(usuario_id: str) -> None:
    """Auto-backfill: una cuenta con role==admin en PocketBase queda reflejada
    con `superadmin` en BRIDGE_USUARIO_ROL_ADMIN (design.md, decisión 2). Mismo
    patrón best-effort que el backfill de DIM_USUARIO en el login: si ya lo
    tenía, no duplica; si falla, no bloquea el request."""
    try:
        if "superadmin" in roles_admin_vigentes(usuario_id):
            return
        get_client().insert(
            "BRIDGE_USUARIO_ROL_ADMIN",
            [(usuario_id, "superadmin", "sistema", 0, datetime.now(timezone.utc))],
            column_names=["usuario_id", "rol_admin", "asignado_por", "revocado", "fecha"],
        )
    except Exception:
        pass


def require_rol_admin(*roles_permitidos: str):
    """Autorización administrativa segmentada por área de negocio (change
    roles-gestion-usuarios). Reemplaza al `require_admin` monolítico en los
    endpoints /admin/* de cada capability. `superadmin` siempre pasa; los demás
    roles se verifican por intersección con los roles vigentes del usuario en
    BRIDGE_USUARIO_ROL_ADMIN. Una cuenta con role==admin en PocketBase se
    mapea a `superadmin` de forma automática (auto-backfill)."""

    permitidos = set(roles_permitidos)

    def _dep(user: dict = Depends(get_current_user)) -> dict:
        usuario_id = user["record"]["id"]
        # Backward compatibility: las cuentas admin de PocketBase conservan
        # acceso total sin migración manual.
        if user.get("record", {}).get("role", "") == "admin":
            _asegurar_superadmin(usuario_id)
            return user

        roles = roles_admin_vigentes(usuario_id)
        if "superadmin" in roles:
            return user
        if permitidos & roles:
            return user
        raise HTTPException(
            status_code=403,
            detail="Esta operación requiere un rol administrativo distinto",
        )

    return _dep


# Alias delgado conservado por compatibilidad: los endpoints transversales de
# `seguridad` (auditoría, errores, permisos, gestión de usuarios) y cualquier
# import externo de `require_admin` siguen exigiendo el rol total `superadmin`.
require_admin = require_rol_admin("superadmin")


def require_permiso(recurso: str, accion: str):
    """Autorización granular (recurso/acción): consulta el estado vigente de un
    permiso en FACT_PERMISO_USUARIO vía argMax. Convive con `require_rol_admin`
    (design.md, Non-Goals) — se aplica únicamente a endpoints propios de
    `seguridad`, no reemplaza el gating de producto de otras capabilities."""

    def _dep(user: dict = Depends(get_current_user)) -> dict:
        role = user.get("record", {}).get("role", "")
        if role == "admin":
            return user

        usuario_id = user["record"]["id"]
        row = query_one(PERMISO_VIGENTE_UNO, {
            "usuario_id": usuario_id, "recurso": recurso, "accion": accion,
        })
        if not row or not row.get("permitido"):
            raise HTTPException(
                status_code=403,
                detail=f"Permiso insuficiente: se requiere '{accion}' sobre '{recurso}'",
            )
        return user

    return _dep
