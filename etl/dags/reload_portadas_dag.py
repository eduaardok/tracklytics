"""DAG reload_portadas — resolución de portadas reales (RF-EXP-009), sacada
del camino crítico de `tracklytics_etl` en S11 (ver comentario en ese DAG):
aditiva sobre DIM_ARTISTS/DIM_ALBUMS ya pobladas, se dispara aparte y no
afecta `ETL_LOGS.duration_seconds` de la ingesta semanal."""

from datetime import datetime, timedelta

from airflow import DAG
from airflow.operators.python import PythonOperator

from gold.portada import run_portada


with DAG(
    dag_id="reload_portadas",
    description="Resuelve portadas reales de artistas/álbumes (Spotify oEmbed + "
                "respaldo iTunes/Deezer) — desacoplado de la ingesta semanal.",
    default_args={
        "owner":       "tracklytics",
        "retries":     1,
        "retry_delay": timedelta(minutes=5),
    },
    start_date=datetime(2026, 5, 14),
    schedule_interval=None,
    catchup=False,
    tags=["tracklytics", "portadas"],
) as dag:

    task_portada = PythonOperator(task_id="task_portada", python_callable=run_portada)
