from fastapi import Depends, HTTPException

from core.database import query_one
from core.deps import get_current_user
from paquetes.seguridad.queries import PERMISO_VIGENTE_UNO


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    """Gating de los endpoints administrativos de `seguridad` (gestión de
    permisos, auditoría, errores de sistema) — exclusivo de role=admin."""
    role = user.get("record", {}).get("role", "")
    if role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Esta operación es exclusiva de administradores",
        )
    return user


def require_permiso(recurso: str, accion: str):
    """Autorización granular nueva (design.md, "Autorización granular nueva,
    adopción progresiva"): consulta el estado vigente de un permiso en
    FACT_PERMISO_USUARIO vía argMax. Se aplica únicamente a endpoints propios
    de `seguridad` — no reemplaza require_b2c_user/require_b2b_panel_access/
    require_staff en otras capabilities."""

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
