"""Callable de Airflow: genera datos de referencia en FACT_ENGAGEMENT_USUARIO."""

from datetime import datetime, timedelta

import numpy as np
import pandas as pd

from utils.clickhouse_client import get_client, scalar
from utils.config import get_config

WEEK1_START = datetime(2026, 5, 14)
N_USERS     = 200
N_EVENTS    = 50_000


def _week_bounds(week: int) -> tuple[datetime, datetime]:
    start = WEEK1_START + timedelta(weeks=week - 1)
    return start, start + timedelta(days=7)


def run_engagement_referencia(**context):
    """Genera ~50 000 eventos de referencia por semana en FACT_ENGAGEMENT_USUARIO."""
    week   = context["params"]["week_number"]
    cfg    = get_config()
    client = get_client(cfg)

    week_start, week_end = _week_bounds(week)

    # ── Idempotencia: saltar si la semana ya fue cargada ──────────────────────
    existing = scalar(
        client,
        "SELECT count() FROM FACT_ENGAGEMENT_USUARIO"
        " WHERE source = 'referencia'"
        "   AND event_timestamp >= {ws:DateTime}"
        "   AND event_timestamp <  {we:DateTime}",
        {"ws": week_start, "we": week_end},
    )
    if existing:
        print(f"[engagement] Semana {week}: {existing} filas ya existen. Saltando.")
        return

    # ── Cargar fact_ids con popularidad como pesos ────────────────────────────
    rows     = client.query("SELECT fact_id, popularity FROM FACT_TRACKS").result_rows
    fact_ids = np.array([r[0] for r in rows], dtype=np.int64)
    pops     = np.array([r[1] for r in rows], dtype=np.float64)
    # +1 para evitar peso cero en tracks con popularity=0
    weights  = (pops + 1.0) / (pops + 1.0).sum()

    # ── Generación ─────────────────────────────────────────────────────────────
    rng      = np.random.default_rng(week * 73)
    user_ids = np.array([f"ref_user_{i:04d}" for i in range(N_USERS)])

    n_repro   = int(N_EVENTS * 0.70)               # 35 000
    n_fav_add = int(N_EVENTS * 0.20)               # 10 000
    n_fav_rem = N_EVENTS - n_repro - n_fav_add     #  5 000

    half_week = 3 * 24 * 3600   # primeros 3 días (segundos)
    full_week = 7 * 24 * 3600   # semana completa  (segundos)

    # Reproduccion — timestamps en toda la semana
    repro_users = rng.choice(user_ids, n_repro)
    repro_facts = rng.choice(fact_ids, n_repro, p=weights)
    repro_secs  = rng.integers(0, full_week, n_repro)

    # Favorito_add — primera mitad de la semana
    fadd_users = rng.choice(user_ids, n_fav_add)
    fadd_facts = rng.choice(fact_ids, n_fav_add, p=weights)
    fadd_secs  = rng.integers(0, half_week, n_fav_add)

    # Favorito_remove — segunda mitad, solo sobre pares (user, fact) del add
    add_pairs    = list(zip(fadd_users.tolist(), fadd_facts.tolist()))
    unique_pairs = list({(u, f) for u, f in add_pairs})
    n_rem_actual = min(n_fav_rem, len(unique_pairs))
    rem_idx      = rng.choice(len(unique_pairs), n_rem_actual, replace=False)
    rem_pairs    = [unique_pairs[i] for i in rem_idx]
    frem_users   = [p[0] for p in rem_pairs]
    frem_facts   = np.array([p[1] for p in rem_pairs], dtype=np.int64)
    frem_secs    = rng.integers(half_week, full_week, n_rem_actual)

    # ── Timestamps como pd.Timestamp para insert_df ───────────────────────────
    ts_base = pd.Timestamp(week_start)

    repro_ts = ts_base + pd.to_timedelta(repro_secs, unit="s")
    fadd_ts  = ts_base + pd.to_timedelta(fadd_secs,  unit="s")
    frem_ts  = ts_base + pd.to_timedelta(frem_secs,  unit="s")

    # ── Ensamblar DataFrame ───────────────────────────────────────────────────
    df = pd.concat([
        pd.DataFrame({
            "user_id":         repro_users,
            "fact_id":         repro_facts,
            "event_type":      "reproduccion",
            "event_timestamp": repro_ts,
            "is_synthetic":    True,
            "source":          "referencia",
        }),
        pd.DataFrame({
            "user_id":         fadd_users,
            "fact_id":         fadd_facts,
            "event_type":      "favorito_add",
            "event_timestamp": fadd_ts,
            "is_synthetic":    True,
            "source":          "referencia",
        }),
        pd.DataFrame({
            "user_id":         frem_users,
            "fact_id":         frem_facts,
            "event_type":      "favorito_remove",
            "event_timestamp": frem_ts,
            "is_synthetic":    True,
            "source":          "referencia",
        }),
    ], ignore_index=True)

    # ── Insertar ──────────────────────────────────────────────────────────────
    client.insert_df("FACT_ENGAGEMENT_USUARIO", df)

    total = len(df)
    print(
        f"[engagement] Semana {week}: {total} eventos insertados "
        f"({n_repro} reproduccion, {n_fav_add} favorito_add, {n_rem_actual} favorito_remove). "
        f"Rango: {week_start.date()} — {(week_end - timedelta(days=1)).date()}."
    )
