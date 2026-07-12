from fastapi import Depends, HTTPException

from core.deps import get_current_user
from paquetes.suscripciones import pb_client


def require_active_subscription(plan_minimo: str = "free"):
    """Gating dependency para funciones extendidas/B2B. Checa PocketBase (el
    sistema de registro operativo) en tiempo real, no FACT_SUSCRIPCION.

    `plan_minimo`:
      - `"free"` (default): cualquier suscripción activa alcanza — incluye el
        plan free, que también queda `estado="activa"` en PocketBase. Esto
        preserva el comportamiento original de este dependency.
      - `"premium"`: exige que el plan activo sea exactamente `premium` — el
        defecto de diseño encontrado en la auditoría 2026-07-10 (ningún
        router lo usaba, y tal como estaba escrito no distinguía free de
        premium) se corrige aquí en vez de descartar el dependency, ver
        design.md del change `2026-07-11-regalias-publicidad`, Decisión 7.
    """
    async def _dep(user: dict = Depends(get_current_user)) -> dict:
        user_id = user["record"]["id"]
        token = user["token"]
        activas = await pb_client.list_activas(token, user_id)
        if plan_minimo == "premium":
            activas = [a for a in activas if a.get("tipo_plan") == "premium"]
        if not activas:
            raise HTTPException(
                status_code=403,
                detail=f"Se requiere un plan {plan_minimo} activo para acceder a esta función",
            )
        return user
    return _dep
