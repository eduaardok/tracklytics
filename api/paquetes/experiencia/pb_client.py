import time

import httpx

from core.config import PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD, PB_URL

SUSCRIPCIONES_COLLECTION = "suscripciones"

# Token de superusuario cacheado en memoria, mismo patrón que
# `paquetes/partners/pb_client.py`: la gestión de plan familiar es admin-only
# y necesita leer la suscripción activa de un usuario distinto del que hace la
# request (el `viewRule` de la colección `suscripciones` es
# `usuario_o_cliente = @request.auth.id`, que un token de admin normal no
# pasa para otro usuario) — design.md, "elegibilidad de plan".
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


async def suscripcion_activa_de_usuario(usuario_id: str) -> dict | None:
    """Suscripción activa de cualquier usuario, resuelta con token de
    superusuario (no el del admin que hace la request) — necesario para que
    un admin pueda designar titular sobre la suscripción de otro usuario."""
    token = await _get_admin_token()
    filtro = f'usuario_o_cliente="{usuario_id}" && estado="activa"'
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{PB_URL}/api/collections/{SUSCRIPCIONES_COLLECTION}/records",
            params={"filter": filtro, "page": 1, "perPage": 1},
            headers={"Authorization": f"Bearer {token}"},
        )
    resp.raise_for_status()
    items = resp.json().get("items", [])
    return items[0] if items else None
