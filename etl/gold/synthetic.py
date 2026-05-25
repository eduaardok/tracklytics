"""Capa Gold: generación de datos sintéticos para semanas 2..N.
Usa seeds deterministas (week * 42) para reproducibilidad."""

import numpy as np
import pandas as pd

from utils.clickhouse_client import get_client, get_date_id, load_lookup
from utils.config import get_config

_CATCH_W1 = np.array([
    "Adaptive", "Advanced", "Automated", "Balanced", "Centralized", "Compatible",
    "Configurable", "Cross-platform", "Customer-focused", "Customizable", "Devolved",
    "Digitized", "Distributed", "Down-sized", "Enhanced", "Enterprise-wide", "Ergonomic",
    "Exclusive", "Expanded", "Extended", "Focused", "Front-line", "Function-based",
    "Fundamental", "Innovative", "Integrated", "Intuitive", "Managed", "Monitored",
    "Multi-layered", "Networked", "Object-based", "Open-architected", "Open-source",
    "Optimized", "Organic", "Organized", "Persistent", "Phased", "Proactive",
    "Progressive", "Quality-focused", "Re-engineered", "Reduced", "Robust", "Seamless",
    "Secured", "Sharable", "Stand-alone", "Streamlined", "Synchronised", "Synergistic",
    "Team-oriented", "Universal", "Upgradeable", "User-centric", "User-friendly",
    "Versatile", "Virtual", "Visionary",
])
_CATCH_W2 = np.array([
    "analyzing", "asynchronous", "bifurcated", "client-driven", "client-focused",
    "coherent", "composite", "context-sensitive", "dedicated", "demand-driven", "dynamic",
    "empowering", "even-keeled", "fault-tolerant", "fresh-thinking", "full-range",
    "global", "high-level", "holistic", "human-resource", "hybrid", "impactful",
    "incremental", "interactive", "leading edge", "local", "logistical", "maximized",
    "methodical", "mission-critical", "mobile", "modular", "motivating", "multi-tasking",
    "neutral", "next generation", "object-oriented", "optimal", "optimizing", "real-time",
    "reciprocal", "regional", "responsive", "scalable", "stable", "systematic",
    "transitional", "uniform", "user-facing", "value-added", "web-enabled", "zero defect",
])
_CATCH_W3 = np.array([
    "ability", "access", "adapter", "algorithm", "alliance", "analyzer", "application",
    "approach", "architecture", "array", "benchmark", "capability", "capacity",
    "challenge", "circuit", "collaboration", "complexity", "concept", "contingency",
    "core", "database", "definition", "emulation", "encoding", "encryption", "firmware",
    "flexibility", "forecast", "framework", "function", "functionalities", "groupware",
    "hardware", "hierarchy", "hub", "implementation", "infrastructure", "initiative",
    "interface", "intranet", "knowledge base", "leverage", "matrix", "methodology",
    "middleware", "migration", "model", "monitoring", "open system", "orchestration",
    "paradigm", "policy", "portal", "pricing structure", "process improvement", "product",
    "productivity", "project", "protocol", "software", "solution", "standardization",
    "strategy", "structure", "success", "support", "synergy", "system engine",
    "throughput", "toolset", "utilization", "website", "workforce",
])


def _generate_synthetic(
    week: int,
    start_id: int,
    date_id: int,
    artist_map: dict,
    album_map: dict,
    genre_map: dict,
) -> pd.DataFrame:
    rng = np.random.default_rng(week * 42)

    n          = 100_000
    artist_ids = np.array(list(artist_map.values()), dtype=np.int64)
    album_ids  = np.array(list(album_map.values()),  dtype=np.int64)
    genre_ids  = np.array(list(genre_map.values()),  dtype=np.int64)

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
    keys_arr  = rng.integers(1,       13,       n)
    modes_arr = rng.integers(1,       3,        n)
    ts_ids    = rng.choice([1, 2, 3, 4],        n)
    exp_ids   = rng.integers(1,       3,        n)
    a_ids     = rng.choice(artist_ids,          n)
    al_ids    = rng.choice(album_ids,           n)
    g_ids     = rng.choice(genre_ids,           n)

    w1 = _CATCH_W1[rng.integers(0, len(_CATCH_W1), n)]
    w2 = _CATCH_W2[rng.integers(0, len(_CATCH_W2), n)]
    w3 = _CATCH_W3[rng.integers(0, len(_CATCH_W3), n)]
    track_names = np.char.add(np.char.add(w1, " "), np.char.add(w2, np.char.add(" ", w3)))

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

    genre_map  = load_lookup(client, "DIM_GENRES",  "name", "genre_id")
    album_map  = load_lookup(client, "DIM_ALBUMS",  "name", "album_id")
    artist_map = load_lookup(client, "DIM_ARTISTS", "name", "artist_id")

    inserted = 0
    for syn_week in range(2, week + 1):
        syn_date_id = get_date_id(client, syn_week)
        syn_df      = _generate_synthetic(
            syn_week, next_id, syn_date_id, artist_map, album_map, genre_map
        )
        for start in range(0, len(syn_df), 50_000):
            client.insert_df("FACT_TRACKS", syn_df.iloc[start:start + 50_000])
        next_id  += len(syn_df)
        inserted += len(syn_df)
        print(f"[synthetic] Semana {syn_week}: {len(syn_df)} registros sintéticos")

    total = real_count + inserted
    context["ti"].xcom_push(key="inserted_count", value=total)
    print(f"[synthetic] Total insertado: {total} ({real_count} reales + {inserted} sintéticos)")
