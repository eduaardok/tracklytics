"""
pb_init.py — Inicialización automática de PocketBase para Tracklytics v2.
Idempotente: si la colección ya tiene >=EXPECTED registros, no hace nada.
Si está incompleta, carga desde CSV con ThreadPoolExecutor (20 workers).
"""

import math
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import httpx
import pandas as pd
from dotenv import load_dotenv

load_dotenv()

PB_URL     = os.getenv("POCKETBASE_URL",        "http://pocketbase:8090")
PB_EMAIL   = os.getenv("POCKETBASE_EMAIL",       "admin@tracklytics.com")
PB_PASS    = os.getenv("POCKETBASE_PASSWORD",    "tracklytics2026")
COLLECTION = os.getenv("POCKETBASE_COLLECTION", "spotify_tracks")
CSV_PATH   = os.getenv("CSV_PATH",              "/app/dataset/spotify.csv")
WORKERS    = 20
EXPECTED   = 113_550

# ── Schema ────────────────────────────────────────────────────────────────────

_TEXT   = ["track_id", "artists", "album_name", "track_name", "track_genre"]
_NUMBER = [
    "popularity", "duration_ms", "key", "mode", "time_signature",
    "danceability", "energy", "loudness", "speechiness", "acousticness",
    "instrumentalness", "liveness", "valence", "tempo",
]
_BOOL   = ["explicit"]

COLLECTION_SCHEMA = {
    "name": COLLECTION,
    "type": "base",
    "fields": (
        [{"name": f, "type": "text",   "required": False} for f in _TEXT]
      + [{"name": f, "type": "number", "required": False} for f in _NUMBER]
      + [{"name": f, "type": "bool",   "required": False} for f in _BOOL]
    ),
}

# ── Auth & helpers ─────────────────────────────────────────────────────────────

def get_token() -> str:
    resp = httpx.post(
        f"{PB_URL}/api/collections/_superusers/auth-with-password",
        json={"identity": PB_EMAIL, "password": PB_PASS},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["token"]


def collection_count(token: str) -> int | None:
    """Returns total record count, or None if the collection does not exist."""
    resp = httpx.get(
        f"{PB_URL}/api/collections/{COLLECTION}/records",
        params={"page": 1, "perPage": 1, "skipTotal": "false"},
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    )
    if resp.status_code == 404:
        return None
    resp.raise_for_status()
    return resp.json().get("totalItems", 0)


def create_collection(token: str) -> None:
    resp = httpx.post(
        f"{PB_URL}/api/collections",
        json=COLLECTION_SCHEMA,
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    )
    if resp.status_code not in (200, 201):
        raise RuntimeError(f"{resp.status_code} — {resp.text[:300]}")
    print(f"[pb-init] Colección '{COLLECTION}' creada ({len(COLLECTION_SCHEMA['fields'])} campos).")


def ensure_users_text_field(token: str, field_name: str) -> None:
    """Adds a text field to the built-in users auth collection if not present.

    Generalized from the original 'role'-only helper: la capability `seguridad`
    también necesita 'pais' en la colección users para poblar DIM_USUARIO.
    """
    resp = httpx.get(
        f"{PB_URL}/api/collections/users",
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    )
    if resp.status_code != 200:
        print(f"[pb-init] WARNING: no se pudo obtener la colección users ({resp.status_code}).")
        return

    collection = resp.json()
    fields = collection.get("fields", [])

    if any(f.get("name") == field_name for f in fields):
        print(f"[pb-init] Campo '{field_name}' ya existe en users. Sin cambios.")
        return

    updated_fields = fields + [{"name": field_name, "type": "text", "required": False}]
    patch = httpx.patch(
        f"{PB_URL}/api/collections/users",
        json={"fields": updated_fields},
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    )
    if patch.status_code in (200, 204):
        print(f"[pb-init] Campo '{field_name}' agregado a la colección users.")
    else:
        print(f"[pb-init] WARNING: no se pudo agregar '{field_name}': {patch.status_code} — {patch.text[:200]}")


def ensure_collection_field(token: str, collection_name: str, field: dict) -> None:
    """Adds a field to an existing base collection if not already present
    (monetizacion-retencion-mejoras) — generalización de
    `ensure_users_text_field` para colecciones base distintas de `users`:
    `ensure_collection` solo crea la colección si no existe, nunca agrega
    campos nuevos a una que ya existía antes de este cambio."""
    resp = httpx.get(
        f"{PB_URL}/api/collections/{collection_name}",
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    )
    if resp.status_code != 200:
        print(f"[pb-init] WARNING: no se pudo obtener la colección {collection_name} ({resp.status_code}).")
        return

    collection = resp.json()
    fields = collection.get("fields", [])
    field_name = field["name"]

    if any(f.get("name") == field_name for f in fields):
        print(f"[pb-init] Campo '{field_name}' ya existe en {collection_name}. Sin cambios.")
        return

    patch = httpx.patch(
        f"{PB_URL}/api/collections/{collection_name}",
        json={"fields": fields + [field]},
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    )
    if patch.status_code in (200, 204):
        print(f"[pb-init] Campo '{field_name}' agregado a la colección {collection_name}.")
    else:
        print(f"[pb-init] WARNING: no se pudo agregar '{field_name}' a {collection_name}: {patch.status_code} — {patch.text[:200]}")


def get_collection_id(token: str, name: str) -> str | None:
    """Returns the real PocketBase id of a collection, or None if it does not exist."""
    resp = httpx.get(
        f"{PB_URL}/api/collections/{name}",
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    )
    if resp.status_code == 404:
        return None
    resp.raise_for_status()
    return resp.json()["id"]


def ensure_collection(token: str, schema: dict) -> None:
    """Creates collection from schema if it does not already exist (idempotent)."""
    name = schema["name"]
    resp = httpx.get(
        f"{PB_URL}/api/collections/{name}",
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    )
    if resp.status_code == 200:
        print(f"[pb-init] Colección '{name}' ya existe. Sin cambios.")
        return
    if resp.status_code != 404:
        resp.raise_for_status()

    create_resp = httpx.post(
        f"{PB_URL}/api/collections",
        json=schema,
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    )
    if create_resp.status_code not in (200, 201):
        raise RuntimeError(
            f"Error creando '{name}': {create_resp.status_code} — {create_resp.text[:400]}"
        )
    print(f"[pb-init] Colección '{name}' creada ({len(schema['fields'])} campos).")


def ensure_collection_rules(token: str, name: str, rules: dict) -> None:
    """Applies API access rules to a collection only when they differ (idempotent)."""
    resp = httpx.get(
        f"{PB_URL}/api/collections/{name}",
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    )
    resp.raise_for_status()
    current = resp.json()

    rule_keys = ("listRule", "viewRule", "createRule", "updateRule", "deleteRule")
    diff = {k: v for k, v in rules.items() if k in rule_keys and current.get(k) != v}

    if not diff:
        print(f"[pb-init] Reglas de '{name}' ya están configuradas. Sin cambios.")
        return

    patch = httpx.patch(
        f"{PB_URL}/api/collections/{name}",
        json=diff,
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    )
    if patch.status_code not in (200, 204):
        raise RuntimeError(
            f"Error aplicando reglas a '{name}': {patch.status_code} — {patch.text[:300]}"
        )
    print(f"[pb-init] Reglas de '{name}' actualizadas: {', '.join(diff)}.")

# ── Transformación ─────────────────────────────────────────────────────────────

def clean_row(row: dict) -> dict:
    return {
        "track_id":          str(row.get("track_id",          ""))[:255],
        "artists":           str(row.get("artists",           ""))[:500],
        "album_name":        str(row.get("album_name",        ""))[:255],
        "track_name":        str(row.get("track_name",        ""))[:255],
        "track_genre":       str(row.get("track_genre",       ""))[:100],
        "popularity":        int(row.get("popularity",        0)),
        "duration_ms":       int(row.get("duration_ms",       0)),
        "key":               int(row.get("key",               0)),
        "mode":              int(row.get("mode",              0)),
        "time_signature":    int(row.get("time_signature",    4)),
        "danceability":      float(row.get("danceability",    0.0)),
        "energy":            float(row.get("energy",          0.0)),
        "loudness":          float(row.get("loudness",        0.0)),
        "speechiness":       float(row.get("speechiness",     0.0)),
        "acousticness":      float(row.get("acousticness",    0.0)),
        "instrumentalness":  float(row.get("instrumentalness",0.0)),
        "liveness":          float(row.get("liveness",        0.0)),
        "valence":           float(row.get("valence",         0.0)),
        "tempo":             float(row.get("tempo",           0.0)),
        "explicit":          bool(row.get("explicit",         False)),
    }

# ── Inserción paralela ─────────────────────────────────────────────────────────

def insert_chunk(records: list[dict], token: str, chunk_id: int, n_chunks: int) -> tuple[int, int]:
    """Inserta un bloque de registros con una sola conexión HTTP persistente."""
    ok = errors = 0
    url     = f"{PB_URL}/api/collections/{COLLECTION}/records"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    with httpx.Client(timeout=20) as client:
        for record in records:
            try:
                r = client.post(url, json=record, headers=headers)
                if r.status_code in (200, 201):
                    ok += 1
                else:
                    errors += 1
            except Exception:
                errors += 1

    print(f"  [chunk {chunk_id:02d}/{n_chunks}] {ok:,} ok · {errors} errores")
    return ok, errors

# ── Main ───────────────────────────────────────────────────────────────────────

def main() -> None:
    print(f"[pb-init] Conectando a {PB_URL} ...")

    try:
        token = get_token()
    except Exception as exc:
        print(f"[pb-init] ERROR de autenticación: {exc}")
        sys.exit(1)
    print("[pb-init] Autenticado.")

    ensure_users_text_field(token, "role")
    ensure_users_text_field(token, "pais")

    # ── Colecciones auxiliares (playlists / playlist_tracks) ──────────────────
    users_id = get_collection_id(token, "users")
    if users_id is None:
        print("[pb-init] ERROR: colección 'users' no encontrada — PocketBase no inicializado correctamente.")
        sys.exit(1)

    # `colaboradores` (S10 Día 3, CU-O nuevo de playlists colaborativas): un
    # colaborador puede ver la playlist y agregar/quitar tracks, pero nunca
    # renombrarla ni eliminarla — eso sigue siendo exclusivo de `user`
    # (updateRule/deleteRule sin ampliar). En una instalación ya existente,
    # este campo/reglas se agregan con `scripts/migrar_playlists_colaborativas.py`
    # (`ensure_collection()` no migra colecciones ya creadas).
    playlists_schema = {
        "name": "playlists",
        "type": "base",
        "fields": [
            {"name": "name", "type": "text",     "required": True},
            # cascadeDelete=True (auditoría S10 día 4): si se borra el usuario dueño,
            # sus playlists no deben quedar huérfanas ni bloquear el borrado del
            # usuario — mismo hallazgo que el fix de eliminar_playlist del día 3,
            # un nivel más arriba en la cadena (users → playlists → playlist_tracks).
            {"name": "user", "type": "relation", "required": True,
             "collectionId": users_id, "cascadeDelete": True, "maxSelect": 1},
            {"name": "colaboradores", "type": "relation", "required": False,
             "collectionId": users_id, "cascadeDelete": False, "maxSelect": 50},
            # `es_publica` (S10 ronda 2, perfiles públicos): privada por defecto
            # (`bool` sin `required` en PocketBase ya nace en `false`) — el dueño
            # decide explícitamente cuáles de sus playlists expone en su perfil
            # público. En una instalación ya existente se agrega con
            # `scripts/migrar_visibilidad_publica.py`.
            {"name": "es_publica", "type": "bool", "required": False},
        ],
    }
    try:
        ensure_collection(token, playlists_schema)
    except RuntimeError as exc:
        print(f"[pb-init] ERROR: {exc}")
        sys.exit(1)

    try:
        ensure_collection_rules(token, "playlists", {
            "listRule":   "user = @request.auth.id || colaboradores.id ?= @request.auth.id",
            "viewRule":   "user = @request.auth.id || colaboradores.id ?= @request.auth.id",
            "createRule": '@request.auth.id != "" && user = @request.auth.id',
            "updateRule": "user = @request.auth.id",
            "deleteRule": "user = @request.auth.id",
        })
    except RuntimeError as exc:
        print(f"[pb-init] ERROR: {exc}")
        sys.exit(1)

    playlists_id = get_collection_id(token, "playlists")
    if playlists_id is None:
        print("[pb-init] ERROR: colección 'playlists' no encontrada tras creación.")
        sys.exit(1)

    playlist_tracks_schema = {
        "name": "playlist_tracks",
        "type": "base",
        "fields": [
            # cascadeDelete=True (auditoría S10 día 4): antes False, compensado
            # únicamente con la cascada manual de pb_playlists.eliminar() (día 3)
            # — que solo corre si el borrado pasa por ese endpoint. Con
            # cascadeDelete=True, PocketBase también limpia estos tracks cuando la
            # playlist se borra por cualquier otra vía (p. ej. cascada de `users.
            # playlists.user` arriba, o borrado directo desde el admin de PocketBase).
            {"name": "playlist", "type": "relation", "required": True,
             "collectionId": playlists_id, "cascadeDelete": True, "maxSelect": 1},
            {"name": "fact_id",  "type": "number",   "required": True},
            {"name": "position", "type": "number",   "required": True},
        ],
    }
    try:
        ensure_collection(token, playlist_tracks_schema)
    except RuntimeError as exc:
        print(f"[pb-init] ERROR: {exc}")
        sys.exit(1)

    try:
        ensure_collection_rules(token, "playlist_tracks", {
            "listRule":   "playlist.user = @request.auth.id || playlist.colaboradores.id ?= @request.auth.id",
            "viewRule":   "playlist.user = @request.auth.id || playlist.colaboradores.id ?= @request.auth.id",
            "createRule": "playlist.user = @request.auth.id || playlist.colaboradores.id ?= @request.auth.id",
            # `updateRule` amplío a colaboradores: reordenar (PATCH position) es
            # una extensión natural de agregar/quitar tracks, ya colaborativo.
            "updateRule": "playlist.user = @request.auth.id || playlist.colaboradores.id ?= @request.auth.id",
            "deleteRule": "playlist.user = @request.auth.id || playlist.colaboradores.id ?= @request.auth.id",
        })
    except RuntimeError as exc:
        print(f"[pb-init] ERROR: {exc}")
        sys.exit(1)

    # ── Colección: suscripciones ──────────────────────────────────────────────
    suscripciones_schema = {
        "name": "suscripciones",
        "type": "base",
        "fields": [
            {"name": "usuario_o_cliente", "type": "relation", "required": True,
             "collectionId": users_id, "cascadeDelete": False, "maxSelect": 1},
            {"name": "tipo_plan", "type": "text",   "required": True},
            # required=False: PocketBase trata 0 como "vacío" en campos number
            # requeridos, y el plan free legítimamente tiene monto=0.
            {"name": "monto",     "type": "number", "required": False},
            {"name": "moneda",    "type": "text",   "required": True},
            {"name": "estado",    "type": "text",   "required": True},
            # fecha_inicio (RF-SUS-003): PocketBase no agrega created/updated
            # automáticamente en colecciones base; hay que declararlos.
            {"name": "created", "type": "autodate", "onCreate": True, "onUpdate": False},
            # Período de prueba gratuito (monetizacion-retencion-mejoras):
            # `metodo_pago_id` se guarda para poder cobrar automáticamente al
            # expirar el trial sin volver a pedirlo (ver design.md, decisión 6).
            {"name": "en_prueba",       "type": "bool", "required": False},
            {"name": "fecha_fin_trial", "type": "date", "required": False},
            {"name": "metodo_pago_id",  "type": "text", "required": False},
            # Dunning (modelo-financiero-completar-huecos): contador de
            # intentos de cobro fallidos consecutivos — `estado` pasa a
            # `pago_pendiente` (texto libre, no un enum cerrado en PocketBase)
            # mientras no se agote en 3 intentos (ver design.md, decisión 2).
            {"name": "intentos_fallidos", "type": "number", "required": False},
        ],
    }
    try:
        ensure_collection(token, suscripciones_schema)
    except RuntimeError as exc:
        print(f"[pb-init] ERROR: {exc}")
        sys.exit(1)

    # `ensure_collection` es create-only — si la colección ya existía antes de
    # este cambio (monetizacion-retencion-mejoras), los 3 campos de trial no
    # se agregan solos; hay que empujarlos explícitamente, igual que 'role'/
    # 'pais' en users.
    ensure_collection_field(token, "suscripciones", {"name": "en_prueba", "type": "bool", "required": False})
    ensure_collection_field(token, "suscripciones", {"name": "fecha_fin_trial", "type": "date", "required": False})
    ensure_collection_field(token, "suscripciones", {"name": "metodo_pago_id", "type": "text", "required": False})
    ensure_collection_field(token, "suscripciones", {"name": "intentos_fallidos", "type": "number", "required": False})

    try:
        # No se define deleteRule: las suscripciones no se eliminan, solo se
        # cancelan (campo `estado`), preservando el rastro auditable (RNF-SUS-002).
        ensure_collection_rules(token, "suscripciones", {
            "listRule":   "usuario_o_cliente = @request.auth.id",
            "viewRule":   "usuario_o_cliente = @request.auth.id",
            "createRule": '@request.auth.id != "" && usuario_o_cliente = @request.auth.id',
            "updateRule": "usuario_o_cliente = @request.auth.id",
        })
    except RuntimeError as exc:
        print(f"[pb-init] ERROR: {exc}")
        sys.exit(1)

    # ── Colección: partners ────────────────────────────────────────────────────
    # Directorio de partners/API keys para la capability `partners`. El alta y
    # gestión de partners es responsabilidad de CU-T03 (administración táctica
    # de partners), que no está implementada en este repo — esta colección es
    # el mínimo sustrato de almacenamiento para que `partners` tenga algo que
    # consumir. Deliberadamente sin reglas (ningún listRule/viewRule/etc.): solo
    # el superusuario de PocketBase puede gestionarla, ya que no existe un
    # "usuario partner" autenticado vía PocketBase — la API key se valida desde
    # FastAPI usando credenciales de superusuario, no una sesión de partner.
    partners_schema = {
        "name": "partners",
        "type": "base",
        "fields": [
            {"name": "nombre",           "type": "text", "required": True},
            {"name": "api_key",          "type": "text", "required": True},
            {"name": "tier",             "type": "text", "required": True},
            {"name": "estado",           "type": "text", "required": True},
            {"name": "fecha_expiracion", "type": "date", "required": False},
            {"name": "created", "type": "autodate", "onCreate": True, "onUpdate": False},
        ],
    }
    try:
        ensure_collection(token, partners_schema)
    except RuntimeError as exc:
        print(f"[pb-init] ERROR: {exc}")
        sys.exit(1)

    # ── Verificar colección ───────────────────────────────────────────────────
    count = collection_count(token)

    if count is None:
        print(f"[pb-init] Colección '{COLLECTION}' no existe. Creando...")
        try:
            create_collection(token)
        except RuntimeError as exc:
            print(f"[pb-init] ERROR creando colección: {exc}")
            sys.exit(1)
        count = 0

    if count == EXPECTED:
        print(f"[pb-init] Colección completa ({count:,} registros). Nada que hacer.")
        sys.exit(0)

    if count > EXPECTED:
        print(f"[pb-init] ADVERTENCIA: la colección tiene {count:,} registros (esperado {EXPECTED:,}).")
        print("[pb-init] Hay registros duplicados. Haz: docker compose down -v && docker compose up -d")
        sys.exit(1)

    if count > 0:
        print(f"[pb-init] Colección incompleta ({count:,}/{EXPECTED:,} registros).")
        print("[pb-init] Para reset limpio: docker compose down -v && docker compose up -d")

    # ── Cargar CSV ────────────────────────────────────────────────────────────
    if not os.path.exists(CSV_PATH):
        print(f"[pb-init] ERROR: CSV no encontrado en {CSV_PATH}")
        sys.exit(1)

    print(f"[pb-init] Leyendo {CSV_PATH} ...")
    df = pd.read_csv(CSV_PATH)
    if "Unnamed: 0" in df.columns:
        df = df.drop(columns=["Unnamed: 0"])
    df = df.drop_duplicates()
    df = df.iloc[:EXPECTED]   # limita a exactamente EXPECTED filas
    total = len(df)
    print(f"[pb-init] {total:,} registros tras dedup. Cargando con {WORKERS} workers en paralelo...")

    records    = [clean_row(row.to_dict()) for _, row in df.iterrows()]
    chunk_size = math.ceil(total / WORKERS)
    chunks     = [records[i : i + chunk_size] for i in range(0, total, chunk_size)]
    n_chunks   = len(chunks)

    t0 = time.time()
    total_ok = total_errors = 0

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {
            pool.submit(insert_chunk, chunk, token, i + 1, n_chunks): i
            for i, chunk in enumerate(chunks)
        }
        for future in as_completed(futures):
            ok, errors   = future.result()
            total_ok    += ok
            total_errors += errors

    elapsed = time.time() - t0
    rate    = total_ok / elapsed if elapsed > 0 else 0
    print(f"\n[pb-init] {total_ok:,} insertados · {total_errors} errores · "
          f"{elapsed / 60:.1f} min · {rate:.0f} reg/s")

    if total_errors > total * 0.05:
        print("[pb-init] ADVERTENCIA: más del 5% de errores. Revisa los logs.")
        sys.exit(1)

    print("[pb-init] Listo.")


if __name__ == "__main__":
    main()
