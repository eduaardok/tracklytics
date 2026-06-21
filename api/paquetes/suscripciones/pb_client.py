import httpx

from core.config import PB_URL

COLLECTION = "suscripciones"


async def list_activas(token: str, user_id: str) -> list[dict]:
    filtro = f'usuario_o_cliente="{user_id}" && estado="activa"'
    async with httpx.AsyncClient(timeout=5) as client:
        resp = await client.get(
            f"{PB_URL}/api/collections/{COLLECTION}/records",
            params={"filter": filtro, "page": 1, "perPage": 10},
            headers={"Authorization": f"Bearer {token}"},
        )
    resp.raise_for_status()
    return resp.json().get("items", [])


async def crear(token: str, user_id: str, tipo_plan: str, monto: float, moneda: str) -> dict:
    async with httpx.AsyncClient(timeout=5) as client:
        resp = await client.post(
            f"{PB_URL}/api/collections/{COLLECTION}/records",
            json={
                "usuario_o_cliente": user_id,
                "tipo_plan": tipo_plan,
                "monto": monto,
                "moneda": moneda,
                "estado": "activa",
            },
            headers={"Authorization": f"Bearer {token}"},
        )
    resp.raise_for_status()
    return resp.json()


async def cancelar(token: str, record_id: str) -> dict:
    async with httpx.AsyncClient(timeout=5) as client:
        resp = await client.patch(
            f"{PB_URL}/api/collections/{COLLECTION}/records/{record_id}",
            json={"estado": "cancelada"},
            headers={"Authorization": f"Bearer {token}"},
        )
    resp.raise_for_status()
    return resp.json()
