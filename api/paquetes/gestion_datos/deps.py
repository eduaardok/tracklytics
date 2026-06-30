from fastapi import Depends, HTTPException

from core.deps import get_current_user


def require_lead_data_engineer(user: dict = Depends(get_current_user)) -> dict:
    """Gating de toda la capability `ingesta` (Context: "El Lead Data
    Engineer es el único actor de esta capability"). Mapeado a role=admin,
    el mismo rol de staff interno usado por el resto del proyecto."""
    role = user.get("record", {}).get("role", "")
    if role != "admin":
        raise HTTPException(
            status_code=403,
            detail="La gestión de ingesta es exclusiva de Lead Data Engineer",
        )
    return user
