import httpx
from fastapi import Depends, Header, HTTPException

from core.config import PB_URL
from core.database import get_client


def get_db():
    return get_client()


async def get_current_user(authorization: str = Header(None)) -> dict:
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
        return resp.json()
    except httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail=f"Auth service unavailable: {exc}")


def verify_analytics_access(user: dict = Depends(get_current_user)) -> dict:
    role = user.get("record", {}).get("role", "")
    if role not in ("admin", "analyst"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    return user
