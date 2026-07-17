from fastapi import Depends, HTTPException

from core.database import query_one
from core.deps import get_current_user
from paquetes.regalias.queries import CUENTA_SELLO_POR_USUARIO
from paquetes.seguridad.deps import require_rol_admin

# Autorización administrativa segmentada (change roles-gestion-usuarios): los
# endpoints /admin/* de regalías (productores, contratos, liquidación, cuentas
# de sello, retiros) pertenecen al área financiera. `superadmin` siempre pasa;
# el `admin` monolítico previo quedó mapeado a `superadmin`, así que ninguna
# cuenta admin existente pierde acceso.
require_admin = require_rol_admin("admin_finanzas")

__all__ = ["require_admin", "require_cuenta_sello"]


def require_cuenta_sello(user: dict = Depends(get_current_user)) -> dict:
    """Análogo a `require_cuenta_artista_aprobada` (creadores) — pero una
    cuenta de sello no tiene estado pendiente/rechazada: existe o no existe,
    porque solo admin la crea (ver design.md, Decisión 3)."""
    usuario_id = user["record"]["id"]
    cuenta = query_one(CUENTA_SELLO_POR_USUARIO, {"usuario_id": usuario_id})
    if not cuenta:
        raise HTTPException(
            status_code=403,
            detail="Se requiere una cuenta de sello asociada a este usuario",
        )
    return cuenta
