"""DAG playlists_sync — RF-EXP-006: reflejo analítico de playlists de usuario
(BRIDGE_TRACK_PLAYLIST_USUARIO). DAG independiente y liviano, mismo patrón que
`engagement_dag.py` (`schedule_interval=None`, disparo manual o vía API):
corre con el mismo ritmo semanal ya establecido para el resto del pipeline
(design.md de `experiencia`, "frecuencia de sincronización") y admite además
un disparo on-demand desde `POST /app/v1/experiencia/playlists/sincronizar`
sin necesitar re-correr la ingesta completa de catálogo (`tracklytics_etl`)."""

from datetime import datetime, timedelta

from airflow import DAG
from airflow.operators.python import PythonOperator

from gold.playlists_sync import run_playlists_sync

with DAG(
    dag_id="playlists_sync",
    description="Sincroniza playlists/playlist_tracks (PocketBase) -> BRIDGE_TRACK_PLAYLIST_USUARIO (ClickHouse)",
    default_args={
        "owner":       "tracklytics",
        "retries":     1,
        "retry_delay": timedelta(minutes=5),
    },
    start_date=datetime(2026, 5, 14),
    schedule_interval=None,
    catchup=False,
    tags=["tracklytics", "experiencia"],
) as dag:

    task_playlists_sync = PythonOperator(
        task_id="task_playlists_sync",
        python_callable=run_playlists_sync,
    )
