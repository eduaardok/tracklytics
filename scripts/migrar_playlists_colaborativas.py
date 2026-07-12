"""
migrar_playlists_colaborativas.py — S10 Día 3: agrega el campo
`colaboradores` (relation multi a `users`) a la colección `playlists` de
PocketBase, y amplía las reglas de acceso de `playlists`/`playlist_tracks`
para que un colaborador pueda ver/agregar/quitar tracks (no renombrar ni
eliminar la playlist — eso sigue siendo exclusivo del owner).

Idempotente: si el campo ya existe, no lo vuelve a agregar; las reglas se
actualizan solo si difieren (mismo criterio que `ensure_collection_rules`,
pb_init.py). `ensure_collection()` es "crear una sola vez" y no migra
colecciones que ya existen — por eso esto vive en un script de migración
aparte, mismo precedente que `scripts/migrar_sellos.py`.

Uso:
    docker compose exec -T api python - < scripts/migrar_playlists_colaborativas.py
"""

import os
import sys

import httpx

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

PB_URL   = os.getenv("POCKETBASE_URL", "http://pocketbase:8090")
PB_EMAIL = os.getenv("POCKETBASE_EMAIL", "admin@tracklytics.com")
PB_PASS  = os.getenv("POCKETBASE_PASSWORD", "tracklytics2026")


def get_token() -> str:
    resp = httpx.post(
        f"{PB_URL}/api/collections/_superusers/auth-with-password",
        json={"identity": PB_EMAIL, "password": PB_PASS},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["token"]


def main() -> None:
    token = get_token()
    headers = {"Authorization": f"Bearer {token}"}

    users_resp = httpx.get(f"{PB_URL}/api/collections/users", headers=headers, timeout=30)
    users_resp.raise_for_status()
    users_id = users_resp.json()["id"]

    pl_resp = httpx.get(f"{PB_URL}/api/collections/playlists", headers=headers, timeout=30)
    pl_resp.raise_for_status()
    playlists = pl_resp.json()

    ya_tiene_campo = any(f["name"] == "colaboradores" for f in playlists["fields"])
    if ya_tiene_campo:
        print("[migrar_playlists] Campo 'colaboradores' ya existe en 'playlists'. Sin cambios de schema.")
    else:
        nuevos_fields = playlists["fields"] + [{
            "name": "colaboradores",
            "type": "relation",
            "required": False,
            "collectionId": users_id,
            "cascadeDelete": False,
            "maxSelect": 50,
        }]
        patch = httpx.patch(
            f"{PB_URL}/api/collections/playlists",
            json={"fields": nuevos_fields},
            headers=headers, timeout=30,
        )
        if patch.status_code not in (200, 204):
            print(f"ERROR agregando 'colaboradores': {patch.status_code} — {patch.text[:400]}")
            sys.exit(1)
        print("[migrar_playlists] Campo 'colaboradores' agregado a 'playlists'.")

    # Reglas: el owner sigue siendo el único que puede renombrar/eliminar la
    # playlist (updateRule/deleteRule sin tocar) — un colaborador solo puede
    # ver la playlist y sus tracks, nunca la playlist misma.
    reglas_playlists = {
        "listRule": 'user = @request.auth.id || colaboradores.id ?= @request.auth.id',
        "viewRule": 'user = @request.auth.id || colaboradores.id ?= @request.auth.id',
    }
    current_rules = {k: playlists.get(k) for k in reglas_playlists}
    if current_rules != reglas_playlists:
        patch = httpx.patch(
            f"{PB_URL}/api/collections/playlists", json=reglas_playlists, headers=headers, timeout=30,
        )
        if patch.status_code not in (200, 204):
            print(f"ERROR actualizando reglas de 'playlists': {patch.status_code} — {patch.text[:400]}")
            sys.exit(1)
        print("[migrar_playlists] Reglas de 'playlists' actualizadas (colaboradores pueden ver).")
    else:
        print("[migrar_playlists] Reglas de 'playlists' ya estaban al día.")

    pt_resp = httpx.get(f"{PB_URL}/api/collections/playlist_tracks", headers=headers, timeout=30)
    pt_resp.raise_for_status()
    playlist_tracks = pt_resp.json()

    # Un colaborador SÍ puede agregar/quitar/reordenar tracks — createRule/
    # updateRule/deleteRule amplían al owner O a un colaborador de esa playlist.
    # (updateRule cubre el PATCH de `position` que usa el reorder.)
    reglas_pt = {
        "listRule":   "playlist.user = @request.auth.id || playlist.colaboradores.id ?= @request.auth.id",
        "viewRule":   "playlist.user = @request.auth.id || playlist.colaboradores.id ?= @request.auth.id",
        "createRule": "playlist.user = @request.auth.id || playlist.colaboradores.id ?= @request.auth.id",
        "updateRule": "playlist.user = @request.auth.id || playlist.colaboradores.id ?= @request.auth.id",
        "deleteRule": "playlist.user = @request.auth.id || playlist.colaboradores.id ?= @request.auth.id",
    }
    current_pt_rules = {k: playlist_tracks.get(k) for k in reglas_pt}
    if current_pt_rules != reglas_pt:
        patch = httpx.patch(
            f"{PB_URL}/api/collections/playlist_tracks", json=reglas_pt, headers=headers, timeout=30,
        )
        if patch.status_code not in (200, 204):
            print(f"ERROR actualizando reglas de 'playlist_tracks': {patch.status_code} — {patch.text[:400]}")
            sys.exit(1)
        print("[migrar_playlists] Reglas de 'playlist_tracks' actualizadas (colaboradores pueden agregar/quitar).")
    else:
        print("[migrar_playlists] Reglas de 'playlist_tracks' ya estaban al día.")

    print("\nMigración completa.")


if __name__ == "__main__":
    main()
