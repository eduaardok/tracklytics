"""
migrar_visibilidad_publica.py — S10 ronda 2: agrega el campo `es_publica`
(bool, privada por defecto) a la colección `playlists` de PocketBase, para
que el dueño decida cuáles de sus playlists expone en su perfil público.

Idempotente: si el campo ya existe, no lo vuelve a agregar — mismo criterio
que `scripts/migrar_playlists_colaborativas.py`. `ensure_collection()` es
"crear una sola vez" y no migra colecciones que ya existen, por eso esto vive
en un script de migración aparte.

Uso:
    docker compose exec -T api python - < scripts/migrar_visibilidad_publica.py
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

    pl_resp = httpx.get(f"{PB_URL}/api/collections/playlists", headers=headers, timeout=30)
    pl_resp.raise_for_status()
    playlists = pl_resp.json()

    ya_tiene_campo = any(f["name"] == "es_publica" for f in playlists["fields"])
    if ya_tiene_campo:
        print("[migrar_visibilidad] Campo 'es_publica' ya existe en 'playlists'. Sin cambios.")
        return

    nuevos_fields = playlists["fields"] + [{
        "name": "es_publica",
        "type": "bool",
        "required": False,
    }]
    patch = httpx.patch(
        f"{PB_URL}/api/collections/playlists",
        json={"fields": nuevos_fields},
        headers=headers, timeout=30,
    )
    if patch.status_code not in (200, 204):
        print(f"ERROR agregando 'es_publica': {patch.status_code} — {patch.text[:400]}")
        sys.exit(1)
    print("[migrar_visibilidad] Campo 'es_publica' agregado a 'playlists'.")


if __name__ == "__main__":
    main()
