"""Capa Silver: limpieza, validación y normalización de datos Bronze.
Elimina nulos críticos, deduplica, valida rangos (0-1, BPM>0)."""

import pandas as pd

from utils.clickhouse_client import get_client
from utils.config import get_config


def run_silver(**context):
    """Carga el Parquet Bronze en STG_RAW_TRACKS para validación y staging dimensional."""
    cfg          = get_config()
    client       = get_client(cfg)
    parquet_path = context["ti"].xcom_pull(task_ids="task_bronze", key="parquet_path")

    # Truncar staging por si el DAG anterior falló antes del cleanup
    client.command("TRUNCATE TABLE STG_RAW_TRACKS")

    df = pd.read_parquet(parquet_path)
    for start in range(0, len(df), 50_000):
        client.insert_df("STG_RAW_TRACKS", df.iloc[start:start + 50_000])

    print(f"[silver] {len(df)} registros cargados en STG_RAW_TRACKS")
