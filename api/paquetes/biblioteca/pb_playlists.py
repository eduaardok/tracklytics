import time

import httpx

from core.config import PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD, PB_URL

PLAYLISTS_COLLECTION = "playlists"
PLAYLIST_TRACKS_COLLECTION = "playlist_tracks"


# Todas las llamadas reenvían el token propio del usuario (no una cuenta de
# servicio): las reglas de la colección en PocketBase (`user = @request.auth.id`,
# `playlist.user = @request.auth.id`, ver pb_init.py) ya limitan cada operación
# a sus propias playlists, así que no hace falta reverificar ownership aquí.

# Token de superusuario cacheado en memoria, mismo patrón que
# `paquetes/experiencia/pb_client.py`/`paquetes/partners/pb_client.py`: hace
# falta para resolver_colaboradores() (ver más abajo) — `users.viewRule` es
# `id = @request.auth.id`, así que con el token propio del dueño de la
# playlist, PocketBase deniega silenciosamente el `expand` de cualquier
# colaborador que no sea el propio caller (no es un error visible, el
# `expand` simplemente viene vacío) — hallazgo real al verificar en vivo el
# panel de colaboradores (S10 día 4).
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


async def resolver_colaboradores(colaborador_ids: list[str]) -> list[dict]:
    if not colaborador_ids:
        return []
    token = await _get_admin_token()
    filtro = " || ".join(f'id="{cid}"' for cid in colaborador_ids)
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{PB_URL}/api/collections/users/records",
            params={"filter": filtro, "page": 1, "perPage": len(colaborador_ids)},
            headers={"Authorization": f"Bearer {token}"},
        )
    resp.raise_for_status()
    return resp.json().get("items", [])

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
    # Sin `expand=colaboradores`: con el token propio del caller, PocketBase
    # deniega en silencio el expand de cualquier colaborador que no sea el
    # propio caller (`users.viewRule = id = @request.auth.id`) — la
    # resolución de nombre/email de colaboradores se hace aparte, con token
    # de superusuario, en resolver_colaboradores().
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


async def actualizar_visibilidad(token: str, playlist_id: str, es_publica: bool) -> dict:
    async with httpx.AsyncClient(timeout=5) as client:
        resp = await client.patch(
            f"{PB_URL}/api/collections/{PLAYLISTS_COLLECTION}/records/{playlist_id}",
            json={"es_publica": es_publica},
            headers={"Authorization": f"Bearer {token}"},
        )
    resp.raise_for_status()
    return resp.json()


async def listar_publicas(user_id: str) -> list[dict]:
    # Token de superusuario (no el del caller, que puede ser anónimo — perfil
    # público es visible sin sesión): mismo patrón que resolver_colaboradores().
    token = await _get_admin_token()
    filtro = f'user="{user_id}" && es_publica=true'
    async with httpx.AsyncClient(timeout=5) as client:
        resp = await client.get(
            f"{PB_URL}/api/collections/{PLAYLISTS_COLLECTION}/records",
            params={"filter": filtro, "page": 1, "perPage": 200},
            headers={"Authorization": f"Bearer {token}"},
        )
    resp.raise_for_status()
    return resp.json().get("items", [])


async def eliminar(token: str, playlist_id: str) -> None:
    # `playlist` en playlist_tracks es una relation `required` con cascadeDelete=False
    # (pb_init.py): PocketBase rechaza con 400 borrar la playlist mientras existan
    # tracks que la referencien ("Make sure that the record is not part of a
    # required relation reference"). Cascada manual: primero los tracks, luego la
    # playlist — bug preexistente (Día 1/2), no introducido por playlists colaborativas.
    tracks = await listar_tracks(token, playlist_id)
    async with httpx.AsyncClient(timeout=5) as client:
        for t in tracks:
            del_resp = await client.delete(
                f"{PB_URL}/api/collections/{PLAYLIST_TRACKS_COLLECTION}/records/{t['id']}",
                headers={"Authorization": f"Bearer {token}"},
            )
            del_resp.raise_for_status()
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


async def listar_tracks_admin(playlist_id: str) -> list[dict]:
    # Variante con token de superusuario de listar_tracks() — necesaria para
    # el perfil público (S10 ronda 2): el visitante puede ser anónimo o un
    # usuario sin relación con la playlist, así que no hay token propio con
    # el que listRule de `playlist_tracks` conceda acceso.
    token = await _get_admin_token()
    return await listar_tracks(token, playlist_id)


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


async def reordenar(token: str, playlist_id: str, fact_ids_en_orden: list[int]) -> None:
    tracks = await listar_tracks(token, playlist_id)
    record_id_por_fact_id = {t["fact_id"]: t["id"] for t in tracks}
    async with httpx.AsyncClient(timeout=5) as client:
        # `position` es un campo numérico `required` en PocketBase, que trata 0
        # como "vacío" (falla con validation_required) — arranca en 1, mismo
        # criterio que agregar_track() (position=len(items)+1).
        for nueva_pos, fact_id in enumerate(fact_ids_en_orden, start=1):
            record_id = record_id_por_fact_id.get(fact_id)
            if record_id is None:
                continue
            resp = await client.patch(
                f"{PB_URL}/api/collections/{PLAYLIST_TRACKS_COLLECTION}/records/{record_id}",
                json={"position": nueva_pos},
                headers={"Authorization": f"Bearer {token}"},
            )
            resp.raise_for_status()


async def agregar_colaborador(token: str, playlist_id: str, usuario_id: str) -> dict:
    # `+field` es el modifier de PocketBase v0.23+ para anexar a una relación
    # multi sin fetch-then-merge (evita una condición de carrera con otro
    # colaborador agregándose al mismo tiempo).
    async with httpx.AsyncClient(timeout=5) as client:
        resp = await client.patch(
            f"{PB_URL}/api/collections/{PLAYLISTS_COLLECTION}/records/{playlist_id}",
            json={"colaboradores+": usuario_id},
            headers={"Authorization": f"Bearer {token}"},
        )
    resp.raise_for_status()
    return resp.json()


async def quitar_colaborador(token: str, playlist_id: str, usuario_id: str) -> dict:
    async with httpx.AsyncClient(timeout=5) as client:
        resp = await client.patch(
            f"{PB_URL}/api/collections/{PLAYLISTS_COLLECTION}/records/{playlist_id}",
            json={"colaboradores-": usuario_id},
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
