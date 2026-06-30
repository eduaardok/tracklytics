import time

import httpx

from core.config import PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD, PB_URL

COLLECTION = "partners"

# Token de superusuario cacheado en memoria: la colección `partners` es
# admin-only (no hay sesión de "usuario partner" en PocketBase), así que
# FastAPI se autentica una sola vez y reutiliza el token mientras dure.
_admin_token: str | None = None
_admin_token_exp: float = 0.0
_ADMIN_TOKEN_TTL = 3600  # segundos


async def _get_admin_token() -> str:
    global _admin_token, _admin_token_exp
    if _admin_token and time.time() < _admin_token_exp:
        return _admin_token

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            f"{PB_URL}/api/collections/_superusers/auth-with-password",
            json={"identity": PB_ADMIN_EMAIL, "password": PB_ADMIN_PASSWORD},
        )
    resp.raise_for_status()
    _admin_token = resp.json()["token"]
    _admin_token_exp = time.time() + _ADMIN_TOKEN_TTL
    return _admin_token


async def find_by_api_key(api_key: str) -> dict | None:
    """Busca un partner por su api_key exacta. El llamador es responsable de
    validar el formato de `api_key` antes de invocar esto (ver deps.py) —
    aquí se asume ya validado, no se hace escaping adicional del filtro."""
    token = await _get_admin_token()
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{PB_URL}/api/collections/{COLLECTION}/records",
            params={"filter": f'api_key="{api_key}"', "page": 1, "perPage": 1},
            headers={"Authorization": f"Bearer {token}"},
        )
    if resp.status_code == 401:
        # Token de superusuario posiblemente revocado/expirado antes de tiempo;
        # reintenta una vez con un token fresco.
        global _admin_token
        _admin_token = None
        token = await _get_admin_token()
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{PB_URL}/api/collections/{COLLECTION}/records",
                params={"filter": f'api_key="{api_key}"', "page": 1, "perPage": 1},
                headers={"Authorization": f"Bearer {token}"},
            )
    resp.raise_for_status()
    items = resp.json().get("items", [])
    return items[0] if items else None
