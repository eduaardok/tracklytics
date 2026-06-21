from fastapi import Depends, HTTPException

from core.deps import get_current_user
from paquetes.suscripciones import pb_client


async def require_active_subscription(user: dict = Depends(get_current_user)) -> dict:
    """Gating dependency for extended/B2B features. Checks PocketBase (the
    operative system of record) in real time, not FACT_SUSCRIPCION."""
    user_id = user["record"]["id"]
    token = user["token"]
    activas = await pb_client.list_activas(token, user_id)
    if not activas:
        raise HTTPException(
            status_code=403,
            detail="Se requiere una suscripción activa para acceder a esta función",
        )
    return user
