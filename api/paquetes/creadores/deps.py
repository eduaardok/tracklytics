from fastapi import Depends, HTTPException

from core.database import query_one
from core.deps import get_current_user
from paquetes.creadores.queries import CUENTA_ACTUAL_POR_USUARIO
from paquetes.seguridad.deps import require_rol_admin

# Autorización administrativa segmentada (change roles-gestion-usuarios): los
# endpoints /admin/* de creadores (aprobación de cuentas de artista, revisión
# de tracks, dashboard A&R) pertenecen al área de contenido. `superadmin`
# siempre pasa.
require_admin = require_rol_admin("admin_contenido")

__all__ = ["require_admin", "require_cuenta_artista_aprobada"]


def require_cuenta_artista_aprobada(user: dict = Depends(get_current_user)) -> dict:
    """Solo un usuario con `DIM_CUENTA_ARTISTA.estado_cuenta='aprobada'` puede
    subir tracks (design.md, "Solo una cuenta de artista aprobada por usuario
    habilita la subida"). El estado vigente se resuelve con argMax, nunca
    filtrando la tabla cruda (ver queries.py)."""
    usuario_id = user["record"]["id"]
    cuenta = query_one(CUENTA_ACTUAL_POR_USUARIO, {"usuario_id": usuario_id})
    if not cuenta or cuenta["estado_cuenta"] != "aprobada":
        raise HTTPException(
            status_code=403,
            detail="Se requiere una cuenta de artista aprobada para subir tracks",
        )
    return cuenta
