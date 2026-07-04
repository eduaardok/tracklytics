"""etl/gold/playlists_sync.py — RF-EXP-006: reflejo analítico de playlists de
usuario (BRIDGE_TRACK_PLAYLIST_USUARIO), sincronizado desde PocketBase
(colecciones `playlists`/`playlist_tracks` — fuente de verdad operativa,
nunca se escribe de vuelta desde aquí). Full refresh (truncate + reload) en
cada corrida: el volumen esperado (playlists de usuarios de un proyecto
académico) no justifica un upsert incremental (design.md de `experiencia`,
"BRIDGE_TRACK_PLAYLIST_USUARIO — frecuencia de sincronización")."""

import os

import httpx
import pandas as pd

from utils.clickhouse_client import get_client
from utils.config import get_config
from utils.pocketbase_client import get_token


def _fetch_collection(pb_url: str, token: str, collection: str) -> list[dict]:
    headers  = {"Authorization": f"Bearer {token}"}
    base_url = f"{pb_url}/api/collections/{collection}/records"
    items, page = [], 1
    while True:
        resp = httpx.get(base_url, params={"page": page, "perPage": 500}, headers=headers, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        items.extend(data.get("items", []))
        if page >= data.get("totalPages", 1):
            break
        page += 1
    return items


def run_playlists_sync(**context):
    cfg    = get_config()
    client = get_client(cfg)
    token  = get_token(cfg)

    playlists       = _fetch_collection(cfg["pb_url"], token, "playlists")
    playlist_tracks = _fetch_collection(cfg["pb_url"], token, "playlist_tracks")
    playlist_owner  = {p["id"]: p["user"] for p in playlists}

    rows = [
        (int(it["fact_id"]), playlist_owner[it["playlist"]], it["playlist"], it.get("created") or it.get("updated"))
        for it in playlist_tracks
        if it.get("playlist") in playlist_owner
    ]

    # Stage intermedio en Parquet (RT-01) — mismo contrato "todo movimiento de
    # datos pasa por un artefacto Parquet" del resto del pipeline, aunque el
    # volumen de esta tabla sea bajo comparado con la ingesta de catálogo.
    parquet_dir  = cfg["parquet_dir"]
    os.makedirs(parquet_dir, exist_ok=True)
    parquet_path = os.path.join(parquet_dir, "playlists_sync.parquet")

    df = pd.DataFrame(rows, columns=["fact_id_track", "usuario_id", "playlist_id", "fecha_agregado"])
    if len(df):
        df["fact_id_track"]  = df["fact_id_track"].astype("int64")
        df["usuario_id"]     = df["usuario_id"].astype(str)
        df["playlist_id"]    = df["playlist_id"].astype(str)
        df["fecha_agregado"] = pd.to_datetime(df["fecha_agregado"], errors="coerce").fillna(pd.Timestamp.utcnow())
    df.to_parquet(parquet_path)

    df = pd.read_parquet(parquet_path)
    client.command("TRUNCATE TABLE BRIDGE_TRACK_PLAYLIST_USUARIO")
    if len(df):
        client.insert_df("BRIDGE_TRACK_PLAYLIST_USUARIO", df)
    os.remove(parquet_path)

    print(f"[playlists_sync] {len(df)} filas sincronizadas en BRIDGE_TRACK_PLAYLIST_USUARIO "
          f"({len(playlists)} playlists, {len(playlist_tracks)} playlist_tracks leídos de PocketBase).")
    if "ti" in context:
        context["ti"].xcom_push(key="rows_synced", value=len(df))
