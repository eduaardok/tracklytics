import asyncio

from core.database import execute, get_client, query_one
from paquetes.creadores.queries import (
    ALBUM_ID_MAX, ALBUM_ID_POR_NOMBRE, ARTIST_ID_MAX, ARTIST_ID_POR_NOMBRE,
    FACT_ID_MAX, LOAD_WEEK_MAX, PERFIL_AUDIO_GLOBAL, PERFIL_AUDIO_POR_GENERO,
)

MIN_MUESTRA_GENERO = 30  # mismo umbral que etl/gold/enriquecimiento.py

# Valores neutros fijos para los 13 atributos de audio de un track subido por
# un artista (design.md, Non-Goals: no hay análisis de audio real/DSP en este
# alcance). `popularity` también arranca en 0 (un track nuevo no tiene
# streams todavía — un hecho real, no un relleno). Insertados en
# STG_ARTIST_UPLOADS al subir el track (router.py); leídos de vuelta aquí al
# promover.
NEUTRAL_AUDIO_DEFAULTS = {
    "danceability":     0.5,
    "energy":           0.5,
    "key":              0,
    "loudness":         -10.0,
    "mode":             1,
    "speechiness":      0.05,
    "acousticness":     0.3,
    "instrumentalness": 0.0,
    "liveness":         0.1,
    "valence":          0.5,
    "tempo":            120.0,
    "time_signature":   4,
}
POPULARITY_INICIAL = 0

# Reservado para tracks `user_uploaded`: muy por encima del techo documentado
# de FACT_TRACKS (~1.6M filas al final del semestre) para que la promoción
# nunca colisione con el rango 1..~1.6M que asignan `run_gold`/`run_synthetic`
# (design.md, "Preservación de tracks `user_uploaded` frente a una recarga
# completa").
FACT_ID_FLOOR_USER_UPLOADED = 10_000_000

# Mismo mapeo ya usado en etl/gold/loader.py — no se inventa un segundo
# criterio de bucketing para time_signature.
_TS_MAP = {1: 1, 3: 2, 4: 3, 5: 4}

_promocion_lock = asyncio.Lock()


def perfil_audio_por_genero(genre_id: int) -> dict:
    """Perfil de audio de partida para un track subido, calibrado contra el
    género elegido en vez de un valor neutro fijo (spec `creadores`, requirement
    de subida de track). Si el género no tiene una muestra mínima de tracks
    reales, usa el perfil general del catálogo como respaldo."""
    fila = query_one(PERFIL_AUDIO_POR_GENERO, {"genre_id": genre_id})
    if fila and (fila.get("n") or 0) >= MIN_MUESTRA_GENERO:
        return {k: fila[k] for k in NEUTRAL_AUDIO_DEFAULTS if k in fila}

    respaldo = query_one(PERFIL_AUDIO_GLOBAL) or {}
    perfil = dict(NEUTRAL_AUDIO_DEFAULTS)
    perfil.update({k: v for k, v in respaldo.items() if v is not None})
    return perfil


def _resolver_artist_id(nombre_artistico: str) -> int:
    row = query_one(ARTIST_ID_POR_NOMBRE, {"name": nombre_artistico})
    if row:
        return row["artist_id"]
    nuevo_id = (query_one(ARTIST_ID_MAX) or {}).get("n") or 0
    nuevo_id += 1
    get_client().insert(
        "DIM_ARTISTS",
        [(nuevo_id, nombre_artistico, "", 0, "Independiente", True, 0)],
        column_names=["artist_id", "name", "country", "debut_year", "artist_type", "active", "sello_id"],
    )
    return nuevo_id


def _resolver_album_id(album_name: str, track_name: str) -> int:
    nombre_album = album_name or track_name
    album_type = "Studio" if album_name else "Single"
    row = query_one(ALBUM_ID_POR_NOMBRE, {"name": nombre_album})
    if row:
        return row["album_id"]
    nuevo_id = (query_one(ALBUM_ID_MAX) or {}).get("n") or 0
    nuevo_id += 1
    get_client().insert(
        "DIM_ALBUMS",
        [(nuevo_id, nombre_album, 0, album_type, 1, "", 0)],
        column_names=["album_id", "name", "release_year", "album_type", "total_tracks_listed", "language", "sello_id"],
    )
    return nuevo_id


def _popularity_range_id(popularity: int) -> int:
    return 1 if popularity <= 33 else 2 if popularity <= 66 else 3


def _tempo_range_id(tempo: float) -> int:
    return 1 if tempo < 90 else 2 if tempo < 120 else 3 if tempo < 150 else 4


def _energy_level_id(energy: float) -> int:
    return 1 if energy <= 0.33 else 2 if energy <= 0.66 else 3


async def promover_a_fact_tracks(staging_row: dict, nombre_artistico: str) -> int:
    """Promueve un registro de STG_ARTIST_UPLOADS ya aprobado a FACT_TRACKS con
    `source_type='user_uploaded'` (design.md, "Promoción a FACT_TRACKS").
    `staging_row` es la fila de STG_ARTIST_UPLOADS (incluye los valores
    neutros de audio ya guardados en la subida).

    Multi-género (S16): una fila de STG_ARTIST_UPLOADS con N géneros promueve
    a N filas de FACT_TRACKS que comparten el mismo `track_id` (=
    `staging_id`) — mismo modelo N:M que ya usa el resto del catálogo
    (track_id repetido, una fila por género; ver `TRACKS_TOP`/takedown
    administrativo en `catalogo`). Devuelve el `fact_id` de la primera fila
    (el género "principal") — el resto se ocultan/consultan siempre por
    `track_id`, nunca por `fact_id` individual (ver `retirar_track`,
    router.py), así que un solo id de referencia alcanza para notificaciones/
    auditoría."""
    artist_id = _resolver_artist_id(nombre_artistico)
    album_id = _resolver_album_id(staging_row["album_name"], staging_row["track_name"])
    genre_ids = staging_row.get("genre_ids") or [staging_row["genre_id"]]

    key = staging_row["key"]
    mode = staging_row["mode"]
    time_signature = staging_row["time_signature"]
    explicit = staging_row["explicit"]
    tempo = staging_row["tempo"]
    energy = staging_row["energy"]

    key_id = key + 1
    mode_id = mode + 1
    time_signature_id = _TS_MAP.get(time_signature, 3)
    explicit_id = explicit + 1
    popularity_range_id = _popularity_range_id(POPULARITY_INICIAL)
    tempo_range_id = _tempo_range_id(tempo)
    energy_level_id = _energy_level_id(energy)

    async with _promocion_lock:
        load_week = (query_one(LOAD_WEEK_MAX) or {}).get("n") or 1
        max_fact_id = (query_one(FACT_ID_MAX) or {}).get("n") or 0
        primer_fact_id = max(max_fact_id, FACT_ID_FLOOR_USER_UPLOADED - 1) + 1

        filas = [
            (
                primer_fact_id + i, staging_row["staging_id"], staging_row["track_name"],
                artist_id, album_id, genre_id, load_week,
                key_id, mode_id, time_signature_id, explicit_id,
                popularity_range_id, tempo_range_id, energy_level_id,
                POPULARITY_INICIAL, staging_row["duration_ms"],
                staging_row["danceability"], energy, staging_row["loudness"],
                staging_row["speechiness"], staging_row["acousticness"],
                staging_row["instrumentalness"], staging_row["liveness"],
                staging_row["valence"], tempo, load_week, "user_uploaded",
                staging_row.get("imagen_url"),
            )
            for i, genre_id in enumerate(genre_ids)
        ]
        get_client().insert(
            "FACT_TRACKS",
            filas,
            column_names=[
                "fact_id", "track_id", "track_name",
                "artist_id", "album_id", "genre_id", "date_id",
                "key_id", "mode_id", "time_signature_id", "explicit_id",
                "popularity_range_id", "tempo_range_id", "energy_level_id",
                "popularity", "duration_ms",
                "danceability", "energy", "loudness",
                "speechiness", "acousticness",
                "instrumentalness", "liveness",
                "valence", "tempo", "load_week", "source_type",
                "imagen_url",
            ],
        )
        return primer_fact_id
