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
