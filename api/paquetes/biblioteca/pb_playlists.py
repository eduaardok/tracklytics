import httpx

from core.config import PB_URL

PLAYLISTS_COLLECTION = "playlists"
PLAYLIST_TRACKS_COLLECTION = "playlist_tracks"


# Todas las llamadas reenvían el token propio del usuario (no una cuenta de
# servicio): las reglas de la colección en PocketBase (`user = @request.auth.id`,
# `playlist.user = @request.auth.id`, ver pb_init.py) ya limitan cada operación
# a sus propias playlists, así que no hace falta reverificar ownership aquí.

async def listar(token: str, user_id: str) -> list[dict]:
    filtro = f'user="{user_id}"'
    async with httpx.AsyncClient(timeout=5) as client:
        resp = await client.get(
            f"{PB_URL}/api/collections/{PLAYLISTS_COLLECTION}/records",
            # Sin `sort`: el schema de `playlists` en pb_init.py no define un
            # campo `created` (a diferencia de otras colecciones del proyecto,
            # que sí lo agregan explícitamente como autodate — PocketBase no lo
            # agrega solo). Pedir sort=-created devuelve 400 Bad Request.
            # Retrofittear el campo no alcanza tampoco: ensure_collection() es
            # "crear una sola vez" y no migra colecciones que ya existen.
            params={"filter": filtro, "page": 1, "perPage": 200},
            headers={"Authorization": f"Bearer {token}"},
        )
    resp.raise_for_status()
    return resp.json().get("items", [])


async def obtener(token: str, playlist_id: str) -> dict:
    async with httpx.AsyncClient(timeout=5) as client:
        resp = await client.get(
            f"{PB_URL}/api/collections/{PLAYLISTS_COLLECTION}/records/{playlist_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
    if resp.status_code == 404:
        return {}
    resp.raise_for_status()
    return resp.json()


async def crear(token: str, user_id: str, name: str) -> dict:
    async with httpx.AsyncClient(timeout=5) as client:
        resp = await client.post(
            f"{PB_URL}/api/collections/{PLAYLISTS_COLLECTION}/records",
            json={"name": name, "user": user_id},
            headers={"Authorization": f"Bearer {token}"},
        )
    resp.raise_for_status()
    return resp.json()


async def renombrar(token: str, playlist_id: str, name: str) -> dict:
    async with httpx.AsyncClient(timeout=5) as client:
        resp = await client.patch(
            f"{PB_URL}/api/collections/{PLAYLISTS_COLLECTION}/records/{playlist_id}",
            json={"name": name},
            headers={"Authorization": f"Bearer {token}"},
        )
    resp.raise_for_status()
    return resp.json()


async def eliminar(token: str, playlist_id: str) -> None:
    async with httpx.AsyncClient(timeout=5) as client:
        resp = await client.delete(
            f"{PB_URL}/api/collections/{PLAYLISTS_COLLECTION}/records/{playlist_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
    resp.raise_for_status()


async def listar_tracks(token: str, playlist_id: str) -> list[dict]:
    filtro = f'playlist="{playlist_id}"'
    async with httpx.AsyncClient(timeout=5) as client:
        resp = await client.get(
            f"{PB_URL}/api/collections/{PLAYLIST_TRACKS_COLLECTION}/records",
            params={"filter": filtro, "page": 1, "perPage": 500, "sort": "position"},
            headers={"Authorization": f"Bearer {token}"},
        )
    resp.raise_for_status()
    return resp.json().get("items", [])


async def listar_tracks_de_usuario(token: str, user_id: str) -> list[dict]:
    # Un solo request para contar tracks por playlist en /playlists (evita N+1
    # por playlist) — el filtro atraviesa la relación igual que en listRule.
    filtro = f'playlist.user="{user_id}"'
    async with httpx.AsyncClient(timeout=5) as client:
        resp = await client.get(
            f"{PB_URL}/api/collections/{PLAYLIST_TRACKS_COLLECTION}/records",
            params={"filter": filtro, "page": 1, "perPage": 500},
            headers={"Authorization": f"Bearer {token}"},
        )
    resp.raise_for_status()
    return resp.json().get("items", [])


async def agregar_track(token: str, playlist_id: str, fact_id: int, position: int) -> dict:
    async with httpx.AsyncClient(timeout=5) as client:
        resp = await client.post(
            f"{PB_URL}/api/collections/{PLAYLIST_TRACKS_COLLECTION}/records",
            json={"playlist": playlist_id, "fact_id": fact_id, "position": position},
            headers={"Authorization": f"Bearer {token}"},
        )
    resp.raise_for_status()
    return resp.json()


async def quitar_track_por_fact_id(token: str, playlist_id: str, fact_id: int) -> None:
    filtro = f'playlist="{playlist_id}" && fact_id={fact_id}'
    async with httpx.AsyncClient(timeout=5) as client:
        resp = await client.get(
            f"{PB_URL}/api/collections/{PLAYLIST_TRACKS_COLLECTION}/records",
            params={"filter": filtro, "page": 1, "perPage": 1},
            headers={"Authorization": f"Bearer {token}"},
        )
        resp.raise_for_status()
        items = resp.json().get("items", [])
        if not items:
            return
        del_resp = await client.delete(
            f"{PB_URL}/api/collections/{PLAYLIST_TRACKS_COLLECTION}/records/{items[0]['id']}",
            headers={"Authorization": f"Bearer {token}"},
        )
    del_resp.raise_for_status()
