from fastapi import Depends, HTTPException

from core.deps import get_current_user
from paquetes.suscripciones import pb_client


async def require_b2b_panel_access(user: dict = Depends(get_current_user)) -> dict:
    """Gating para los paneles analíticos B2B (RN-ANA-003 / CA-ANA-003).

    Staff interno (role=admin, Data Analyst/BI Lead) accede sin suscripción.
    Cliente B2B (role=analyst) requiere una suscripción activa, verificada
    contra PocketBase vía la capability `suscripciones` (no se redefine su
    lógica, solo se reutiliza pb_client.list_activas).
    """
    role = user.get("record", {}).get("role", "")
    if role == "admin":
        return user

    if role != "analyst":
        raise HTTPException(
            status_code=403,
            detail="Los paneles analíticos son exclusivos de Cliente B2B",
        )

    token = user["token"]
    user_id = user["record"]["id"]
    activas = await pb_client.list_activas(token, user_id)
    if not activas:
        raise HTTPException(
            status_code=403,
            detail="Se requiere una suscripción activa para acceder a los paneles analíticos",
        )
    return user


def require_staff(user: dict = Depends(get_current_user)) -> dict:
    """Gating para el reporte diario operativo (CU-O16): exclusivo de
    Data Analyst/BI Lead (role=admin), no de Cliente B2B."""
    role = user.get("record", {}).get("role", "")
    if role != "admin":
        raise HTTPException(
            status_code=403,
            detail="El reporte diario operativo es exclusivo de Data Analyst/BI Lead",
        )
    return user
