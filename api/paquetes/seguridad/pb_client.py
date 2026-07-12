import httpx
from fastapi import HTTPException

from core.config import PB_URL

COLLECTION = "users"


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
