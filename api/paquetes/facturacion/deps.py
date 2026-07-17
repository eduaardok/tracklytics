from fastapi import Depends, HTTPException

from core.deps import get_current_user
from paquetes.seguridad.deps import require_rol_admin
from paquetes.suscripciones import pb_client

# Autorización administrativa segmentada (change roles-gestion-usuarios): el
# dashboard y la edición de datos de empresa de facturación pertenecen al área
# financiera. `superadmin` siempre pasa. Re-exportado para que
# facturacion/router.py tenga un único punto de import.
require_admin = require_rol_admin("admin_finanzas")

__all__ = ["require_admin", "require_suscripcion_activa"]


async def require_suscripcion_activa(user: dict = Depends(get_current_user)) -> dict:
    """Resuelve la suscripción activa del usuario autenticado contra PocketBase
    (design.md, "Referencia a la suscripción como String (id de PocketBase)").
    Sin suscripción activa, no hay transacción posible (RN: Rechazo de pago sin
    suscripción activa)."""
    token = user["token"]
    usuario_id = user["record"]["id"]
    activas = await pb_client.list_activas(token, usuario_id)
    if not activas:
        raise HTTPException(
            status_code=403,
            detail="No existe una suscripción activa para procesar el pago",
        )
    return activas[0]
