import secrets
import time

import httpx
from fastapi import HTTPException

from core.config import PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD, PB_URL

COLLECTION = "users"

# Token de superusuario cacheado en memoria (mismo patrón que
# partners/pb_client.py): la recuperación de contraseña necesita cambiar el
# password de un usuario sin su `oldPassword`, algo que solo un superusuario
# puede hacer. Nunca se expone al frontend.
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


async def buscar_por_email(email: str) -> dict | None:
    """Resuelve un usuario por correo con token de superusuario. Usado por la
    recuperación de contraseña — el llamador responde siempre genérico, sin
    revelar si el correo existe."""
    token = await _get_admin_token()
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{PB_URL}/api/collections/{COLLECTION}/records",
            params={"filter": f'email="{email}"', "page": 1, "perPage": 1},
            headers={"Authorization": f"Bearer {token}"},
        )
    resp.raise_for_status()
    items = resp.json().get("items", [])
    return items[0] if items else None


async def admin_cambiar_password(usuario_id: str, nueva_password: str) -> None:
    """Cambia la contraseña de un usuario con token de superusuario, sin exigir
    `oldPassword` — es el paso final del restablecimiento por token (el token
    de un solo uso ya validó la identidad). Nunca se llama directamente desde
    el frontend."""
    token = await _get_admin_token()
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.patch(
            f"{PB_URL}/api/collections/{COLLECTION}/records/{usuario_id}",
            headers={"Authorization": f"Bearer {token}"},
            json={"password": nueva_password, "passwordConfirm": nueva_password},
        )
    resp.raise_for_status()


async def revocar_tokens(usuario_id: str) -> None:
    """Cierre de sesión REAL (S13, hallazgo: "cerrar sesión" en el panel de
    admin solo escribía en FACT_SESION — un reporte, no la autenticación de
    verdad — y el usuario cerrado seguía navegando con su token intacto).
    PocketBase firma cada token con el `tokenKey` oculto del registro;
    rotarlo invalida TODOS los tokens ya emitidos para ese usuario de una vez
    (verificado empíricamente: token viejo -> 401, login normal con la misma
    contraseña -> sigue funcionando). Efecto de todo-o-nada por diseño
    (decisión del usuario): cerrar cualquier sesión de una cuenta cierra
    TODOS sus dispositivos, no uno solo — la alternativa (revocar por
    dispositivo) exige guardar y verificar un hash de token en cada request
    autenticado de la app, no solo en este panel."""
    token = await _get_admin_token()
    nuevo_token_key = secrets.token_hex(24)  # 48 chars, mínimo exigido por PocketBase: 30
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.patch(
            f"{PB_URL}/api/collections/{COLLECTION}/records/{usuario_id}",
            headers={"Authorization": f"Bearer {token}"},
            json={"tokenKey": nuevo_token_key},
        )
    resp.raise_for_status()


async def crear_usuario(email: str, password: str, nombre: str, pais: str, rol: str) -> dict:
    async with httpx.AsyncClient(timeout=5) as client:
        resp = await client.post(
            f"{PB_URL}/api/collections/{COLLECTION}/records",
            json={
                "email": email,
                "password": password,
                "passwordConfirm": password,
                "name": nombre,
                "pais": pais,
                "role": rol,
            },
        )
    if resp.status_code == 400:
        # PocketBase reporta un correo duplicado (u otra validación) con 400.
        raise HTTPException(status_code=400, detail="No se pudo registrar el usuario: correo inválido o ya registrado")
    resp.raise_for_status()
    return resp.json()


async def actualizar_usuario(token: str, usuario_id: str, campos: dict) -> dict:
    async with httpx.AsyncClient(timeout=5) as client:
        resp = await client.patch(
            f"{PB_URL}/api/collections/{COLLECTION}/records/{usuario_id}",
            headers={"Authorization": f"Bearer {token}"},
            json=campos,
        )
    resp.raise_for_status()
    return resp.json()


async def login(email: str, password: str) -> dict:
    async with httpx.AsyncClient(timeout=5) as client:
        resp = await client.post(
            f"{PB_URL}/api/collections/{COLLECTION}/auth-with-password",
            json={"identity": email, "password": password},
        )
    if not resp.is_success:
        # RN: error de autenticación genérico, sin indicar cuál campo falló.
        raise HTTPException(status_code=401, detail="Correo o contraseña incorrectos")
    return resp.json()
