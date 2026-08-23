"""Recalificación administrativa del catálogo existente: corrige en bloque
álbumes/artistas con año/país sin informar y tracks (no reales) cuyo perfil de
audio se desvía del perfil típico de su género. Nunca toca `source_type = 'real'`
(design.md, decisión 4). Corre como DAG independiente (`recalificacion_dag.py`),
mismo patrón que `engagement_referencia`."""

import time
from collections import defaultdict

import numpy as np

from gold.enriquecimiento import AUDIO_FEATURES_GENERO, asignar_country, asignar_release_year, calcular_perfiles_por_genero
from utils.clickhouse_client import get_client, scalar
from utils.config import get_config

BATCH_SIZE = 50_000
PERCENTILE_BAJO = 5
PERCENTILE_ALTO = 95


def _corregir_albumes(client) -> int:
    ids = [r[0] for r in client.query(
        "SELECT album_id FROM DIM_ALBUMS WHERE release_year = 0"
    ).result_rows]
    if not ids:
        return 0
    por_valor: dict[int, list[int]] = defaultdict(list)
    for album_id in ids[:max(BATCH_SIZE, len(ids))]:
        por_valor[asignar_release_year(album_id)].append(album_id)
    for year, batch_ids in por_valor.items():
        ids_sql = ",".join(str(i) for i in batch_ids)
        client.command(f"ALTER TABLE DIM_ALBUMS UPDATE release_year = {year} WHERE album_id IN ({ids_sql})")
    return len(ids)


def _corregir_artistas(client) -> int:
    ids = [r[0] for r in client.query(
        "SELECT artist_id FROM DIM_ARTISTS WHERE country = ''"
    ).result_rows]
    if not ids:
        return 0
    por_valor: dict[str, list[int]] = defaultdict(list)
    for artist_id in ids[:max(BATCH_SIZE, len(ids))]:
        por_valor[asignar_country(artist_id)].append(artist_id)
    for country, batch_ids in por_valor.items():
        ids_sql = ",".join(str(i) for i in batch_ids)
        client.command(f"ALTER TABLE DIM_ARTISTS UPDATE country = '{country}' WHERE artist_id IN ({ids_sql})")
    return len(ids)


def _corregir_tracks(client, perfiles_genero: dict) -> int:
    total_corregidos = 0
    for genre_id, pool in perfiles_genero.items():
        rangos = {
            col: (
                float(np.percentile(pool[col], PERCENTILE_BAJO)),
                float(np.percentile(pool[col], PERCENTILE_ALTO)),
            )
            for col in AUDIO_FEATURES_GENERO
        }
        condiciones = " OR ".join(
            f"{col} < {lo} OR {col} > {hi}" for col, (lo, hi) in rangos.items()
        )
        ids = [r[0] for r in client.query(
            f"SELECT fact_id FROM FACT_TRACKS "
            f"WHERE source_type != 'real' AND genre_id = {genre_id} AND ({condiciones}) "
            f"LIMIT {BATCH_SIZE}"
        ).result_rows]
        if not ids:
            continue

        valores = {col: float(np.median(pool[col])) for col in AUDIO_FEATURES_GENERO}
        ids_sql = ",".join(str(i) for i in ids)
        assignments = ", ".join(f"{col} = {val}" for col, val in valores.items())
        client.command(
            f"ALTER TABLE FACT_TRACKS UPDATE {assignments} WHERE fact_id IN ({ids_sql})"
        )
        total_corregidos += len(ids)
    return total_corregidos


def run_recalificacion(**context):
    """RF de recalificación administrativa del catálogo (`ingesta`, CU-O79):
    corrige álbumes/artistas sin año/país informado y tracks no reales con
    perfil de audio incoherente con su género, sin tocar el catálogo de origen."""
    cfg    = get_config()
    client = get_client(cfg)
    inicio = time.monotonic()

    albumes_corregidos  = _corregir_albumes(client)
    artistas_corregidos = _corregir_artistas(client)

    perfiles_genero    = calcular_perfiles_por_genero(client)
    tracks_corregidos  = _corregir_tracks(client, perfiles_genero) if perfiles_genero else 0

    # Las mutaciones `ALTER ... UPDATE` de arriba NO reescriben las partes de
    # las projections de FACT_TRACKS (S16-P7): rematerializar para que los
    # lookups podados por fact_id/track_id no sirvan valores viejos.
    if tracks_corregidos:
        for proyeccion in ("p_by_fact_id", "p_by_track_id"):
            client.command(
                f"ALTER TABLE FACT_TRACKS MATERIALIZE PROJECTION {proyeccion} SETTINGS mutations_sync = 2"
            )

    duracion = time.monotonic() - inicio

    next_log_id = int(scalar(client, "SELECT max(log_id) FROM ETL_LOGS") or 0) + 1
    client.insert(
        "ETL_LOGS",
        # week_number no aplica a una recalificación (no está atada a una
        # semana académica) — se usa 0 como sentinela dentro del rango UInt8.
        [(next_log_id, 0, 0, albumes_corregidos + artistas_corregidos + tracks_corregidos, 0, duracion, "success")],
        column_names=["log_id", "week_number", "records_read", "records_inserted",
                      "records_rejected", "duration_seconds", "status"],
    )

    resultado = {
        "albumes_corregidos":  albumes_corregidos,
        "artistas_corregidos": artistas_corregidos,
        "tracks_corregidos":   tracks_corregidos,
        "duration_seconds":    round(duracion, 1),
    }
    print(f"[recalificacion] {resultado}")
    context["ti"].xcom_push(key="resultado", value=resultado)
    return resultado
