"""etl/gold/modelo_negocio_sync.py — completar-modelo-base: genera datos
reproducibles para FACT_ADQUISICION/FACT_DISPONIBILIDAD, el mismo criterio ya
vigente en el proyecto para FACT_TRACKS/FACT_ENGAGEMENT_USUARIO sintéticos
(seed = week_number * 42). Dominio de negocio independiente del catálogo
musical — no depende de ni escribe sobre FACT_TRACKS/DIMs técnicas (ver
design.md de `completar-modelo-base`, "Por qué no se integró a
tracklytics_etl"). Idempotencia vía ETL_BATCH_CONTROL, mismo mecanismo que el
resto del pipeline, con un `checksum` propio ('modelo_negocio_sync') que
distingue estas filas de las que ya escribe la carga del catálogo — la tabla
no tiene una columna de proceso/origen, así que el checksum cumple ese rol."""

import random
from datetime import datetime, timedelta

import numpy as np

from utils.clickhouse_client import get_client, scalar
from utils.config import get_config

WEEK1_START     = datetime(2026, 5, 14)
N_ADQUISICION   = 150   # usuarios nuevos por semana
DIAS_POR_SEMANA = 7
_CHECKSUM_TAG   = "modelo_negocio_sync"


def _week_bounds(week: int) -> tuple[datetime, datetime]:
    start = WEEK1_START + timedelta(weeks=week - 1)
    return start, start + timedelta(days=DIAS_POR_SEMANA)


def _ya_generada(client, week: int) -> bool:
    existing = scalar(
        client,
        "SELECT count() FROM ETL_BATCH_CONTROL WHERE week_number = {w:UInt16} AND checksum = {c:String}",
        {"w": week, "c": _CHECKSUM_TAG},
    )
    return bool(existing)


def _registrar_batch(client, week: int, record_count: int) -> None:
    next_batch_id = int(scalar(client, "SELECT max(batch_id) FROM ETL_BATCH_CONTROL") or 0) + 1
    client.insert(
        "ETL_BATCH_CONTROL",
        [(next_batch_id, week, record_count, _CHECKSUM_TAG)],
        column_names=["batch_id", "week_number", "record_count", "checksum"],
    )


def run_modelo_negocio_sync(**context):
    week   = context["params"]["week_number"]
    cfg    = get_config()
    client = get_client(cfg)

    if _ya_generada(client, week):
        print(f"[modelo_negocio_sync] Semana {week}: ya generada (checksum='{_CHECKSUM_TAG}'). Saltando.")
        return

    week_start, _week_end = _week_bounds(week)
    rng = np.random.default_rng(week * 42)

    canal_ids  = [r[0] for r in client.query("SELECT canal_id FROM DIM_CANAL_MARKETING").result_rows]
    region_ids = [r[0] for r in client.query("SELECT region_id FROM DIM_REGION").result_rows]
    componente_ids = [r[0] for r in client.query("SELECT componente_id FROM DIM_COMPONENTE_INFRAESTRUCTURA").result_rows]

    # ── FACT_ADQUISICION: N_ADQUISICION altas de usuario en la semana ─────────
    canal_secs = rng.integers(0, DIAS_POR_SEMANA * 24 * 3600, N_ADQUISICION)
    adquisicion_rows = [
        (
            random.getrandbits(50),
            f"acq_user_w{week}_{i:04d}",
            int(rng.choice(canal_ids)),
            int(rng.choice(region_ids)),
            week_start + timedelta(seconds=int(canal_secs[i])),
        )
        for i in range(N_ADQUISICION)
    ]
    client.insert(
        "FACT_ADQUISICION",
        adquisicion_rows,
        column_names=["fact_id", "usuario_id", "canal_id", "region_id", "fecha"],
    )

    # ── FACT_DISPONIBILIDAD: 1 evento por componente y día de la semana ───────
    # Probabilidad baja de incidente (3%) — la mayoría de los días quedan sin
    # incidente, consistente con un sistema que se reporta como disponible.
    disponibilidad_rows = [
        (
            random.getrandbits(50),
            int(componente_id),
            int(rng.random() < 0.03),
            week_start + timedelta(days=dia),
        )
        for componente_id in componente_ids
        for dia in range(DIAS_POR_SEMANA)
    ]
    client.insert(
        "FACT_DISPONIBILIDAD",
        disponibilidad_rows,
        column_names=["fact_id", "componente_id", "hubo_incidente", "fecha"],
    )

    total = len(adquisicion_rows) + len(disponibilidad_rows)
    _registrar_batch(client, week, total)

    print(f"[modelo_negocio_sync] Semana {week}: {len(adquisicion_rows)} filas en FACT_ADQUISICION, "
          f"{len(disponibilidad_rows)} filas en FACT_DISPONIBILIDAD. "
          f"Rango: {week_start.date()} — {(_week_end - timedelta(days=1)).date()}.")
