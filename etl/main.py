"""
=============================================================================
TRACKLYTICS — Pipeline ETL Principal
=============================================================================
Sprint 0 → Sprint 1 | Mayo 2026

Orden de carga (respeta dependencias FK del schema):
  1. genres         — track_genre
  2. artists        — artists (split ";")
  3. albums         — album_name
  4. tracks         — track_id, track_name, popularity, duration_ms, explicit
  5. audio_features — 12 columnas de audio
  6. track_artists  — track_id + artists  (N:M)
  7. track_genres   — track_id + genre    (N:M)
  8. album_artists  — album_name + artists (N:M)
  9. genre_trends   — agregado por track_genre
 10. artist_stats   — agregado por artists
 11. etl_logs       — resultado del proceso

Reglas técnicas:
  RT-01 — Todo movimiento de datos desde Python.
  RT-05 — PostgreSQL como única fuente principal.
  DD-07 — INSERT ... ON CONFLICT DO NOTHING (idempotente).
=============================================================================
"""

import os
import sys
import logging
from datetime import datetime

import pandas as pd
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

# =============================================================================
# CONFIGURACIÓN DE LOGGING
# =============================================================================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
    ],
)
log = logging.getLogger("tracklytics.etl")

# =============================================================================
# CONFIGURACIÓN DE ENTORNO
# =============================================================================
load_dotenv()

DB_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://tracklytics:tracklytics@localhost:5432/tracklytics"
)
DATASET_PATH = os.getenv("DATASET_PATH", "dataset/spotify.csv")

# =============================================================================
# CONTADORES GLOBALES DEL PIPELINE
# =============================================================================
records_read = 0
records_inserted = 0
records_rejected = 0


# =============================================================================
# FASE 1 — EXTRACCIÓN Y LIMPIEZA
# =============================================================================

def extract(path: str) -> pd.DataFrame:
    """
    Lee el CSV, elimina la columna residual 'Unnamed: 0' y descarta
    los registros con nulos en campos obligatorios.
    """
    global records_read, records_rejected

    log.info(f"Leyendo dataset desde: {path}")
    df = pd.read_csv(path)

    # Eliminar columna residual del export
    if "Unnamed: 0" in df.columns:
        df = df.drop(columns=["Unnamed: 0"])

    records_read = len(df)
    log.info(f"Filas leídas: {records_read}")

    # Descartar registros con nulos en campos críticos de negocio
    critical_cols = ["artists", "album_name", "track_name"]
    before = len(df)
    df = df.dropna(subset=critical_cols)
    dropped = before - len(df)

    if dropped > 0:
        records_rejected += dropped
        log.warning(f"Registros descartados por nulos críticos: {dropped}")

    log.info(f"Filas después de limpieza: {len(df)}")
    return df


# =============================================================================
# FASE 2 — TRANSFORMACIÓN
# =============================================================================

def transform(df: pd.DataFrame) -> dict[str, pd.DataFrame]:
    """
    Construye los DataFrames listos para carga por cada tabla del schema.
    Retorna un dict con clave = nombre de tabla.
    """
    global records_rejected

    log.info("Iniciando transformaciones...")

    # ── Validaciones de rango ────────────────────────────────────────────────
    before = len(df)

    # popularity: 0–100
    invalid_pop = ~df["popularity"].between(0, 100)

    # duration_ms: > 0
    invalid_dur = df["duration_ms"] <= 0

    # mode: solo 0 o 1
    invalid_mode = ~df["mode"].isin([0, 1])

    # columnas flotantes de audio: 0.0–1.0
    float_cols = [
        "danceability", "energy", "speechiness",
        "acousticness", "instrumentalness", "liveness", "valence",
    ]
    invalid_floats = pd.Series(False, index=df.index)
    for col in float_cols:
        invalid_floats |= ~df[col].between(0.0, 1.0)

    # musical_key: 0–11
    invalid_key = ~df["key"].between(0, 11)

    # time_signature: 1, 3, 4 o 5
    invalid_ts = ~df["time_signature"].isin([1, 3, 4, 5])

    invalid_mask = (
        invalid_pop | invalid_dur | invalid_mode |
        invalid_floats | invalid_key | invalid_ts
    )

    rejected = invalid_mask.sum()
    if rejected > 0:
        records_rejected += rejected
        log.warning(f"Registros rechazados por validaciones de rango: {rejected}")

    df = df[~invalid_mask].copy()
    log.info(f"Filas válidas para carga: {len(df)}")

    # Renombrar key → musical_key (DD-06)
    df = df.rename(columns={"key": "musical_key"})

    # ── 1. genres ─────────────────────────────────────────────────────────────
    genres_df = (
        df[["track_genre"]]
        .drop_duplicates()
        .rename(columns={"track_genre": "name"})
        .sort_values("name")
        .reset_index(drop=True)
    )
    log.info(f"  genres:       {len(genres_df):>6} filas")

    # ── 2. artists ────────────────────────────────────────────────────────────
    artists_list = []
    for artists_str in df["artists"]:
        for artist in artists_str.split(";"):
            clean = artist.strip()
            if clean:
                artists_list.append(clean)

    artists_df = (
        pd.DataFrame({"name": artists_list})
        .drop_duplicates()
        .sort_values("name")
        .reset_index(drop=True)
    )
    log.info(f"  artists:      {len(artists_df):>6} filas")

    # ── 3. albums ─────────────────────────────────────────────────────────────
    albums_df = (
        df[["album_name"]]
        .drop_duplicates()
        .rename(columns={"album_name": "name"})
        .sort_values("name")
        .reset_index(drop=True)
    )
    log.info(f"  albums:       {len(albums_df):>6} filas")

    # ── 4. tracks (deduplicar por track_id) ───────────────────────────────────
    tracks_df = (
        df[["track_id", "track_name", "album_name", "popularity", "duration_ms", "explicit"]]
        .drop_duplicates(subset=["track_id"])
        .reset_index(drop=True)
    )
    log.info(f"  tracks:       {len(tracks_df):>6} filas")

    # ── 5. audio_features (deduplicar por track_id) ───────────────────────────
    audio_cols = [
        "track_id", "danceability", "energy", "musical_key", "loudness",
        "mode", "speechiness", "acousticness", "instrumentalness",
        "liveness", "valence", "tempo", "time_signature",
    ]
    audio_features_df = (
        df[audio_cols]
        .drop_duplicates(subset=["track_id"])
        .reset_index(drop=True)
    )
    log.info(f"  audio_features:{len(audio_features_df):>5} filas")

    # ── 6. track_artists ──────────────────────────────────────────────────────
    ta_rows = []
    for _, row in df.iterrows():
        for artist in row["artists"].split(";"):
            clean = artist.strip()
            if clean:
                ta_rows.append({"track_id": row["track_id"], "artist_name": clean})

    track_artists_df = (
        pd.DataFrame(ta_rows)
        .drop_duplicates()
        .reset_index(drop=True)
    )
    log.info(f"  track_artists:{len(track_artists_df):>6} filas")

    # ── 7. track_genres ───────────────────────────────────────────────────────
    track_genres_df = (
        df[["track_id", "track_genre"]]
        .rename(columns={"track_genre": "genre_name"})
        .drop_duplicates()
        .reset_index(drop=True)
    )
    log.info(f"  track_genres: {len(track_genres_df):>6} filas")

    # ── 8. album_artists ──────────────────────────────────────────────────────
    aa_rows = []
    for _, row in df.iterrows():
        for artist in row["artists"].split(";"):
            clean = artist.strip()
            if clean:
                aa_rows.append({"album_name": row["album_name"], "artist_name": clean})

    album_artists_df = (
        pd.DataFrame(aa_rows)
        .drop_duplicates()
        .reset_index(drop=True)
    )
    log.info(f"  album_artists:{len(album_artists_df):>6} filas")

    # ── 9. genre_trends ───────────────────────────────────────────────────────
    genre_trends_df = (
        df.groupby("track_genre")
        .agg(
            avg_popularity=("popularity", "mean"),
            avg_danceability=("danceability", "mean"),
            avg_energy=("energy", "mean"),
            avg_valence=("valence", "mean"),
            track_count=("track_id", "nunique"),
        )
        .reset_index()
        .rename(columns={"track_genre": "genre_name"})
    )
    genre_trends_df = genre_trends_df.round({
        "avg_popularity": 2,
        "avg_danceability": 4,
        "avg_energy": 4,
        "avg_valence": 4,
    })
    log.info(f"  genre_trends: {len(genre_trends_df):>6} filas")

    # ── 10. artist_stats ──────────────────────────────────────────────────────
    # Expandir artistas para calcular stats por artista individual
    artist_rows = []
    for _, row in df.drop_duplicates(subset=["track_id"]).iterrows():
        for artist in row["artists"].split(";"):
            clean = artist.strip()
            if clean:
                artist_rows.append({
                    "artist_name": clean,
                    "popularity": row["popularity"],
                    "explicit": int(row["explicit"]),
                })

    artist_expanded_df = pd.DataFrame(artist_rows)
    artist_stats_df = (
        artist_expanded_df
        .groupby("artist_name")
        .agg(
            avg_popularity=("popularity", "mean"),
            track_count=("popularity", "count"),
            explicit_count=("explicit", "sum"),
        )
        .reset_index()
        .round({"avg_popularity": 2})
    )
    log.info(f"  artist_stats: {len(artist_stats_df):>6} filas")

    return {
        "genres": genres_df,
        "artists": artists_df,
        "albums": albums_df,
        "tracks": tracks_df,
        "audio_features": audio_features_df,
        "track_artists": track_artists_df,
        "track_genres": track_genres_df,
        "album_artists": album_artists_df,
        "genre_trends": genre_trends_df,
        "artist_stats": artist_stats_df,
    }


# =============================================================================
# FASE 3 — CARGA
# =============================================================================

def load(engine, tables: dict[str, pd.DataFrame]) -> None:
    """
    Inserta los DataFrames en PostgreSQL respetando el orden de FK.
    Estrategia: INSERT ... ON CONFLICT DO NOTHING (DD-07, idempotente).
    """
    global records_inserted

    with engine.begin() as conn:

        # ── 1. genres ─────────────────────────────────────────────────────────
        log.info("Cargando: genres")
        for _, row in tables["genres"].iterrows():
            result = conn.execute(
                text("INSERT INTO genres (name) VALUES (:name) ON CONFLICT (name) DO NOTHING"),
                {"name": row["name"]},
            )
            records_inserted += result.rowcount

        # Construir mapa name → genre_id para lookups posteriores
        genre_map: dict[str, int] = {
            row.name: row.genre_id
            for row in conn.execute(text("SELECT genre_id, name FROM genres")).fetchall()
        }

        # ── 2. artists ────────────────────────────────────────────────────────
        log.info("Cargando: artists")
        for _, row in tables["artists"].iterrows():
            result = conn.execute(
                text("INSERT INTO artists (name) VALUES (:name) ON CONFLICT (name) DO NOTHING"),
                {"name": row["name"]},
            )
            records_inserted += result.rowcount

        artist_map: dict[str, int] = {
            row.name: row.artist_id
            for row in conn.execute(text("SELECT artist_id, name FROM artists")).fetchall()
        }

        # ── 3. albums ─────────────────────────────────────────────────────────
        log.info("Cargando: albums")
        for _, row in tables["albums"].iterrows():
            result = conn.execute(
                text("INSERT INTO albums (name) VALUES (:name) ON CONFLICT (name) DO NOTHING"),
                {"name": row["name"]},
            )
            records_inserted += result.rowcount

        album_map: dict[str, int] = {
            row.name: row.album_id
            for row in conn.execute(text("SELECT album_id, name FROM albums")).fetchall()
        }

        # ── 4. tracks ─────────────────────────────────────────────────────────
        log.info("Cargando: tracks")
        for _, row in tables["tracks"].iterrows():
            album_id = album_map.get(row["album_name"])
            if album_id is None:
                log.warning(f"  album no encontrado para track {row['track_id']} — skipping")
                continue

            result = conn.execute(
                text("""
                    INSERT INTO tracks (track_id, track_name, album_id, popularity, duration_ms, explicit)
                    VALUES (:track_id, :track_name, :album_id, :popularity, :duration_ms, :explicit)
                    ON CONFLICT (track_id) DO NOTHING
                """),
                {
                    "track_id": row["track_id"],
                    "track_name": row["track_name"],
                    "album_id": album_id,
                    "popularity": int(row["popularity"]),
                    "duration_ms": int(row["duration_ms"]),
                    "explicit": bool(row["explicit"]),
                },
            )
            records_inserted += result.rowcount

        # ── 5. audio_features ─────────────────────────────────────────────────
        log.info("Cargando: audio_features")
        for _, row in tables["audio_features"].iterrows():
            result = conn.execute(
                text("""
                    INSERT INTO audio_features (
                        track_id, danceability, energy, musical_key, loudness, mode,
                        speechiness, acousticness, instrumentalness, liveness,
                        valence, tempo, time_signature
                    ) VALUES (
                        :track_id, :danceability, :energy, :musical_key, :loudness, :mode,
                        :speechiness, :acousticness, :instrumentalness, :liveness,
                        :valence, :tempo, :time_signature
                    ) ON CONFLICT (track_id) DO NOTHING
                """),
                {
                    "track_id": row["track_id"],
                    "danceability": float(row["danceability"]),
                    "energy": float(row["energy"]),
                    "musical_key": int(row["musical_key"]),
                    "loudness": float(row["loudness"]),
                    "mode": int(row["mode"]),
                    "speechiness": float(row["speechiness"]),
                    "acousticness": float(row["acousticness"]),
                    "instrumentalness": float(row["instrumentalness"]),
                    "liveness": float(row["liveness"]),
                    "valence": float(row["valence"]),
                    "tempo": float(row["tempo"]),
                    "time_signature": int(row["time_signature"]),
                },
            )
            records_inserted += result.rowcount

        # ── 6. track_artists ──────────────────────────────────────────────────
        log.info("Cargando: track_artists")
        for _, row in tables["track_artists"].iterrows():
            artist_id = artist_map.get(row["artist_name"])
            if artist_id is None:
                continue
            result = conn.execute(
                text("""
                    INSERT INTO track_artists (track_id, artist_id)
                    VALUES (:track_id, :artist_id)
                    ON CONFLICT (track_id, artist_id) DO NOTHING
                """),
                {"track_id": row["track_id"], "artist_id": artist_id},
            )
            records_inserted += result.rowcount

        # ── 7. track_genres ───────────────────────────────────────────────────
        log.info("Cargando: track_genres")
        for _, row in tables["track_genres"].iterrows():
            genre_id = genre_map.get(row["genre_name"])
            if genre_id is None:
                continue
            result = conn.execute(
                text("""
                    INSERT INTO track_genres (track_id, genre_id)
                    VALUES (:track_id, :genre_id)
                    ON CONFLICT (track_id, genre_id) DO NOTHING
                """),
                {"track_id": row["track_id"], "genre_id": genre_id},
            )
            records_inserted += result.rowcount

        # ── 8. album_artists ──────────────────────────────────────────────────
        log.info("Cargando: album_artists")
        for _, row in tables["album_artists"].iterrows():
            album_id = album_map.get(row["album_name"])
            artist_id = artist_map.get(row["artist_name"])
            if album_id is None or artist_id is None:
                continue
            result = conn.execute(
                text("""
                    INSERT INTO album_artists (album_id, artist_id)
                    VALUES (:album_id, :artist_id)
                    ON CONFLICT (album_id, artist_id) DO NOTHING
                """),
                {"album_id": album_id, "artist_id": artist_id},
            )
            records_inserted += result.rowcount

        # ── 9. genre_trends ───────────────────────────────────────────────────
        log.info("Cargando: genre_trends")
        now = datetime.utcnow()
        for _, row in tables["genre_trends"].iterrows():
            genre_id = genre_map.get(row["genre_name"])
            if genre_id is None:
                continue
            result = conn.execute(
                text("""
                    INSERT INTO genre_trends (
                        genre_id, avg_popularity, avg_danceability,
                        avg_energy, avg_valence, track_count, calculated_at
                    ) VALUES (
                        :genre_id, :avg_popularity, :avg_danceability,
                        :avg_energy, :avg_valence, :track_count, :calculated_at
                    ) ON CONFLICT (genre_id) DO UPDATE SET
                        avg_popularity   = EXCLUDED.avg_popularity,
                        avg_danceability = EXCLUDED.avg_danceability,
                        avg_energy       = EXCLUDED.avg_energy,
                        avg_valence      = EXCLUDED.avg_valence,
                        track_count      = EXCLUDED.track_count,
                        calculated_at    = EXCLUDED.calculated_at
                """),
                {
                    "genre_id": genre_id,
                    "avg_popularity": float(row["avg_popularity"]),
                    "avg_danceability": float(row["avg_danceability"]),
                    "avg_energy": float(row["avg_energy"]),
                    "avg_valence": float(row["avg_valence"]),
                    "track_count": int(row["track_count"]),
                    "calculated_at": now,
                },
            )
            records_inserted += result.rowcount

        # ── 10. artist_stats ──────────────────────────────────────────────────
        log.info("Cargando: artist_stats")
        for _, row in tables["artist_stats"].iterrows():
            artist_id = artist_map.get(row["artist_name"])
            if artist_id is None:
                continue
            result = conn.execute(
                text("""
                    INSERT INTO artist_stats (
                        artist_id, avg_popularity, track_count, explicit_count, calculated_at
                    ) VALUES (
                        :artist_id, :avg_popularity, :track_count, :explicit_count, :calculated_at
                    ) ON CONFLICT (artist_id) DO UPDATE SET
                        avg_popularity = EXCLUDED.avg_popularity,
                        track_count    = EXCLUDED.track_count,
                        explicit_count = EXCLUDED.explicit_count,
                        calculated_at  = EXCLUDED.calculated_at
                """),
                {
                    "artist_id": artist_id,
                    "avg_popularity": float(row["avg_popularity"]),
                    "track_count": int(row["track_count"]),
                    "explicit_count": int(row["explicit_count"]),
                    "calculated_at": now,
                },
            )
            records_inserted += result.rowcount

    log.info(f"Carga finalizada. Registros insertados: {records_inserted}")


# =============================================================================
# REGISTRO ETL
# =============================================================================

def register_etl_log(engine, status: str, notes: str = "") -> None:
    """Inserta una fila en etl_logs al finalizar el pipeline."""
    with engine.begin() as conn:
        conn.execute(
            text("""
                INSERT INTO etl_logs (
                    run_timestamp, records_read, records_inserted, records_rejected, status, notes
                ) VALUES (
                    :run_timestamp, :records_read, :records_inserted, :records_rejected, :status, :notes
                )
            """),
            {
                "run_timestamp": datetime.utcnow(),
                "records_read": int(records_read),
                "records_inserted": int(records_inserted),
                "records_rejected": int(records_rejected),
                "status": status,
                "notes": notes,
            },
        )
    log.info(
        f"ETL log registrado — status: {status} | "
        f"leídos: {records_read} | "
        f"insertados: {records_inserted} | "
        f"rechazados: {records_rejected}"
    )


# =============================================================================
# MAIN
# =============================================================================

def main() -> None:
    log.info("=" * 60)
    log.info("TRACKLYTICS — Pipeline ETL")
    log.info("=" * 60)

    engine = create_engine(DB_URL, echo=False)
    status = "failed"
    notes = ""

    try:
        # Fase 1: Extracción y limpieza
        df = extract(DATASET_PATH)

        # Fase 2: Transformación
        tables = transform(df)

        # Fase 3: Carga
        load(engine, tables)

        status = "success"
        log.info("Pipeline completado exitosamente.")

    except FileNotFoundError as e:
        notes = f"Dataset no encontrado: {e}"
        log.error(notes)

    except Exception as e:
        notes = f"Error inesperado: {e}"
        log.exception(notes)

    finally:
        try:
            register_etl_log(engine, status, notes)
        except Exception as log_err:
            log.error(f"No se pudo registrar el log ETL: {log_err}")

    if status != "success":
        sys.exit(1)


if __name__ == "__main__":
    main()