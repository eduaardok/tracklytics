"""
migrar_cascade_delete_playlists.py — S10 día 4: activa `cascadeDelete` en
`playlists.user` y en `playlist_tracks.playlist`, colecciones ya vivas en
PocketBase.

Contexto (auditoría de limpieza de datos de prueba, día 4): con ambos campos
en `cascadeDelete: False` (valor original desde su creación), PocketBase
rechaza borrar un usuario que sea dueño de al menos una playlist ("Failed to
delete record. Make sure that the record is not part of a required relation
reference") — el mismo síntoma que el bug de `eliminar_playlist` corregido en
el día 3, un nivel más arriba en la cadena (users → playlists →
playlist_tracks). La cascada manual de `pb_playlists.eliminar()` (día 3) solo
protege el camino que pasa por ese endpoint; un borrado de usuario (por
ejemplo desde el admin de PocketBase) no la ejecuta. Activar
`cascadeDelete` a nivel de PocketBase cubre cualquier camino de borrado, no
solo el endpoint de la app.

Idempotente: si un campo ya tiene `cascadeDelete: True`, no se vuelve a
tocar. `ensure_collection()` es "crear una sola vez" y no migra colecciones
que ya existen — por eso esto vive en un script de migración aparte, mismo
patrón que `scripts/migrar_playlists_colaborativas.py`.

Uso:
    docker compose exec -T api python - < scripts/migrar_cascade_delete_playlists.py
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


def activar_cascade_delete(headers: dict, coleccion: str, campo: str) -> None:
    resp = httpx.get(f"{PB_URL}/api/collections/{coleccion}", headers=headers, timeout=30)
    resp.raise_for_status()
    data = resp.json()

    fields = data["fields"]
    target = next((f for f in fields if f["name"] == campo), None)
    if target is None:
        print(f"ERROR: campo '{campo}' no encontrado en '{coleccion}'")
        sys.exit(1)

    if target.get("cascadeDelete") is True:
        print(f"[migrar_cascade] '{coleccion}.{campo}' ya tiene cascadeDelete=True. Sin cambios.")
        return

    target["cascadeDelete"] = True
    patch = httpx.patch(
        f"{PB_URL}/api/collections/{coleccion}", json={"fields": fields}, headers=headers, timeout=30,
    )
    if patch.status_code not in (200, 204):
        print(f"ERROR activando cascadeDelete en '{coleccion}.{campo}': {patch.status_code} — {patch.text[:400]}")
        sys.exit(1)
    print(f"[migrar_cascade] '{coleccion}.{campo}' -> cascadeDelete=True.")


def main() -> None:
    token = get_token()
    headers = {"Authorization": f"Bearer {token}"}

    activar_cascade_delete(headers, "playlists", "user")
    activar_cascade_delete(headers, "playlist_tracks", "playlist")

    print("\nMigración completa.")


if __name__ == "__main__":
    main()
