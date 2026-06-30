"""Capa Gold: generación de datos sintéticos para semanas 2..N.
Usa seeds deterministas (week * 42) para reproducibilidad.

Modos de distribución (synthetic_mode):
  uniform   — distribuciones uniformes planas (comportamiento original).
  normal    — gaussianas centradas en valores musicalmente realistas.
  empirical — resamplea directo de los registros reales (semana 1) en FACT_TRACKS.
"""

from typing import Optional

import numpy as np
import pandas as pd

from utils.clickhouse_client import get_client, get_date_id, load_lookup
from utils.config import get_config

# ── Vocabulario musical para nombres de canciones ────────────────────────────

_MOODS = np.array([
    "Broken", "Burning", "Silent", "Golden", "Hollow", "Sacred", "Neon", "Faded",
    "Lost", "Wild", "Empty", "Distant", "Tender", "Aching", "Restless", "Radiant",
    "Shadowed", "Crimson", "Frozen", "Shattered", "Eternal", "Blazing", "Lonely",
    "Breathless", "Reckless", "Timeless", "Velvet", "Electric", "Bitter", "Sweet",
    "Dark", "Bright", "Fading", "Rising", "Fleeting", "Haunted", "Gentle", "Fierce",
    "Quiet", "Vivid", "Pale", "Raw", "Pure", "Deep", "Heavy", "Soft", "Cold",
    "Warm", "Free", "Bound", "Still", "Wicked", "Cosmic", "Hollow", "Savage",
    "Ancient", "Ruined", "Blissful", "Stormy", "Misty", "Sunlit", "Moonlit",
])

_SUBJECTS = np.array([
    "Heart", "Ghost", "Rain", "Sky", "Fire", "Storm", "Echo", "Shadow", "Dream",
    "Flame", "Ocean", "Mirror", "Road", "Star", "Soul", "Wave", "River", "Wind",
    "Light", "Moon", "Sun", "Night", "Dawn", "Dust", "Smoke", "Ember", "Tide",
    "Shore", "Void", "Pulse", "Beat", "Song", "Cry", "Sigh", "Breath", "Stone",
    "Crystal", "Gold", "Silver", "Iron", "Water", "Earth", "Space", "Time", "Hope",
    "Fear", "Pain", "Joy", "Love", "Peace", "Truth", "Grace", "Faith", "Voice",
    "Silence", "Memory", "Garden", "Desert", "Mountain", "Valley", "City", "Highway",
    "Horizon", "Thunder", "Lightning", "Sunrise", "Midnight", "Twilight", "Chasm",
    "Illusion", "Requiem", "Lullaby", "Anthem", "Ballad", "Rhapsody", "Elegy",
])

_VERBS_GER = np.array([
    "Falling", "Running", "Dancing", "Fading", "Breaking", "Rising", "Bleeding",
    "Holding", "Drifting", "Burning", "Chasing", "Calling", "Losing", "Finding",
    "Leaving", "Waiting", "Aching", "Screaming", "Searching", "Drowning", "Flying",
    "Fighting", "Hiding", "Waking", "Sleeping", "Dreaming", "Crying", "Laughing",
    "Singing", "Whispering", "Spinning", "Turning", "Reaching", "Letting", "Giving",
    "Taking", "Breaking", "Building", "Living", "Dying", "Wandering", "Shining",
    "Fading", "Glowing", "Trembling", "Howling", "Rushing", "Crawling", "Soaring",
    "Crashing", "Bleeding", "Healing", "Forgetting", "Remembering", "Breathing",
])

_PREPS = np.array([
    "in the", "of the", "under the", "through the", "beyond the",
    "across the", "within the", "behind the", "above the", "beneath the",
    "along the", "among the", "beside the", "between the", "against the",
])

_PATTERN_WEIGHTS = [0.35, 0.20, 0.20, 0.15, 0.10]


def _build_track_names(rng: np.random.Generator, n: int) -> np.ndarray:
    """Genera nombres de canciones usando 5 plantillas aleatorias."""
    patterns = rng.choice(5, n, p=_PATTERN_WEIGHTS)

    mood1 = _MOODS[rng.integers(0, len(_MOODS), n)]
    subj1 = _SUBJECTS[rng.integers(0, len(_SUBJECTS), n)]
    subj2 = _SUBJECTS[rng.integers(0, len(_SUBJECTS), n)]
    subj1p = np.char.add(subj1, "s")
    verb1 = _VERBS_GER[rng.integers(0, len(_VERBS_GER), n)]
    prep1 = _PREPS[rng.integers(0, len(_PREPS), n)]

    # Plantilla 0 (35%): "Burning Sky"
    p0 = np.char.add(np.char.add(mood1, " "), subj1)
    # Plantilla 1 (20%): "Fading in the Rain"
    p1 = np.char.add(np.char.add(np.char.add(verb1, " "), prep1), np.char.add(" ", subj1))
    # Plantilla 2 (20%): "Heart of the Shadow"
    p2 = np.char.add(np.char.add(np.char.add(subj1, " "), prep1), np.char.add(" ", subj2))
    # Plantilla 3 (15%): "Silent Echoes"
    p3 = np.char.add(np.char.add(mood1, " "), subj1p)
    # Plantilla 4 (10%): "Echoes"
    p4 = subj1

    return np.where(patterns == 0, p0,
           np.where(patterns == 1, p1,
           np.where(patterns == 2, p2,
           np.where(patterns == 3, p3, p4))))


def _load_empirical(client) -> dict | None:
    """Carga los valores numéricos de los tracks reales para resampleo."""
    df = client.query_df("""
        SELECT popularity, tempo, energy, danceability, loudness,
               speechiness, acousticness, instrumentalness, liveness,
               valence, duration_ms
        FROM FACT_TRACKS
        WHERE is_synthetic = 0
    """)
    if df.empty:
        return None
    return {col: df[col].to_numpy() for col in df.columns}


def _generate_synthetic(
    week: int,
    start_id: int,
    date_id: int,
    artist_map: dict,
    album_map: dict,
    genre_map: dict,
    mode: str = "uniform",
    empirical: Optional[dict] = None,
) -> pd.DataFrame:
    rng = np.random.default_rng(week * 42)

    n          = 100_000
    artist_ids = np.array(list(artist_map.values()), dtype=np.int64)
    album_ids  = np.array(list(album_map.values()),  dtype=np.int64)
    genre_ids  = np.array(list(genre_map.values()),  dtype=np.int64)

    if mode == "empirical" and empirical is not None:
        pops      = rng.choice(empirical["popularity"],       n).astype(np.int32)
        tempos    = rng.choice(empirical["tempo"],            n).astype(np.float32)
        energies  = rng.choice(empirical["energy"],          n).astype(np.float32)
        dance     = rng.choice(empirical["danceability"],    n).astype(np.float32)
        loud      = rng.choice(empirical["loudness"],        n).astype(np.float32)
        speech    = rng.choice(empirical["speechiness"],     n).astype(np.float32)
        acoust    = rng.choice(empirical["acousticness"],    n).astype(np.float32)
        instrum   = rng.choice(empirical["instrumentalness"], n).astype(np.float32)
        livenes   = rng.choice(empirical["liveness"],        n).astype(np.float32)
        valence   = rng.choice(empirical["valence"],         n).astype(np.float32)
        durations = rng.choice(empirical["duration_ms"],     n).astype(np.int64)

    elif mode == "normal":
        def _norm_float(mu, sigma, lo, hi):
            return np.clip(rng.normal(mu, sigma, n), lo, hi).astype(np.float32)

        def _norm_int(mu, sigma, lo, hi):
            return np.clip(rng.normal(mu, sigma, n), lo, hi).round().astype(np.int64)

        pops      = np.clip(rng.normal(45,       25,      n), 0,       100   ).round().astype(np.int32)
        tempos    = _norm_float(122,    28,      60,      200  )
        energies  = _norm_float(0.62,   0.22,    0,       1    )
        dance     = _norm_float(0.58,   0.18,    0,       1    )
        loud      = _norm_float(-8,     5,       -20,     0    )
        speech    = _norm_float(0.10,   0.10,    0,       1    )
        acoust    = _norm_float(0.33,   0.28,    0,       1    )
        instrum   = _norm_float(0.18,   0.28,    0,       1    )
        livenes   = _norm_float(0.19,   0.15,    0,       1    )
        valence   = _norm_float(0.50,   0.25,    0,       1    )
        durations = _norm_int(225_000,  60_000,  120_000, 600_000)

    else:  # uniform (default)
        pops      = rng.integers(0,       101,      n, dtype=np.int32)
        tempos    = rng.uniform(60,       200,      n).astype(np.float32)
        energies  = rng.uniform(0,        1,        n).astype(np.float32)
        dance     = rng.uniform(0,        1,        n).astype(np.float32)
        loud      = rng.uniform(-20,      0,        n).astype(np.float32)
        speech    = rng.uniform(0,        1,        n).astype(np.float32)
        acoust    = rng.uniform(0,        1,        n).astype(np.float32)
        instrum   = rng.uniform(0,        1,        n).astype(np.float32)
        livenes   = rng.uniform(0,        1,        n).astype(np.float32)
        valence   = rng.uniform(0,        1,        n).astype(np.float32)
        durations = rng.integers(120_000, 420_001,  n)

    keys_arr  = rng.integers(1, 13,       n)
    modes_arr = rng.integers(1, 3,        n)
    ts_ids    = rng.choice([1, 2, 3, 4],  n)
    exp_ids   = rng.integers(1, 3,        n)
    a_ids     = rng.choice(artist_ids,    n)
    al_ids    = rng.choice(album_ids,     n)
    g_ids     = rng.choice(genre_ids,     n)

    track_names = _build_track_names(rng, n)

    return pd.DataFrame({
        "fact_id":             np.arange(start_id, start_id + n, dtype=np.int64),
        "track_id":            [f"syn_{week}_{i:06d}" for i in range(n)],
        "track_name":          track_names,
        "artist_id":           a_ids,
        "album_id":            al_ids,
        "genre_id":            g_ids,
        "date_id":             date_id,
        "key_id":              keys_arr,
        "mode_id":             modes_arr,
        "time_signature_id":   ts_ids,
        "explicit_id":         exp_ids,
        "popularity_range_id": np.where(pops <= 33, 1, np.where(pops <= 66, 2, 3)),
        "tempo_range_id":      np.where(tempos < 90, 1, np.where(tempos < 120, 2,
                               np.where(tempos < 150, 3, 4))),
        "energy_level_id":     np.where(energies <= 0.33, 1, np.where(energies <= 0.66, 2, 3)),
        "popularity":          pops,
        "duration_ms":         durations,
        "danceability":        dance,
        "energy":              energies,
        "loudness":            loud,
        "speechiness":         speech,
        "acousticness":        acoust,
        "instrumentalness":    instrum,
        "liveness":            livenes,
        "valence":             valence,
        "tempo":               tempos,
        "load_week":           week,
        "is_synthetic":        True,
    })


def run_synthetic(**context):
    """Genera e inserta 100 000 registros sintéticos por cada semana 2..N."""
    cfg        = get_config()
    week       = context["ti"].xcom_pull(task_ids="task_bronze", key="week_number")
    next_id    = context["ti"].xcom_pull(task_ids="task_gold",   key="next_id")
    real_count = context["ti"].xcom_pull(task_ids="task_gold",   key="real_count") or 0
    client     = get_client(cfg)

    conf = (context.get("dag_run") and context["dag_run"].conf) or {}
    mode = conf.get("synthetic_mode", "uniform")
    if mode not in ("uniform", "normal", "empirical"):
        mode = "uniform"

    genre_map  = load_lookup(client, "DIM_GENRES",  "name", "genre_id")
    album_map  = load_lookup(client, "DIM_ALBUMS",  "name", "album_id")
    artist_map = load_lookup(client, "DIM_ARTISTS", "name", "artist_id")

    empirical = None
    if mode == "empirical":
        empirical = _load_empirical(client)
        if empirical is None:
            print("[synthetic] WARN: no hay datos reales para modo empirical — usando uniform.")
            mode = "uniform"

    print(f"[synthetic] Modo de distribución: {mode}")

    inserted = 0
    for syn_week in range(2, week + 1):
        syn_date_id = get_date_id(client, syn_week)
        syn_df      = _generate_synthetic(
            syn_week, next_id, syn_date_id, artist_map, album_map, genre_map,
            mode=mode, empirical=empirical,
        )
        for start in range(0, len(syn_df), 50_000):
            client.insert_df("FACT_TRACKS", syn_df.iloc[start:start + 50_000])
        next_id  += len(syn_df)
        inserted += len(syn_df)
        print(f"[synthetic] Semana {syn_week}: {len(syn_df)} registros sintéticos ({mode})")

    total = real_count + inserted
    context["ti"].xcom_push(key="inserted_count", value=total)
    print(f"[synthetic] Total insertado: {total} ({real_count} reales + {inserted} sintéticos)")
