"""DAG tracklytics_recalificacion — corrige en bloque álbumes/artistas sin
año/país informado y tracks no reales con perfil de audio incoherente con su
género (design.md de `enriquecimiento-catalogo`, decisión 3: DAG independiente,
no CRUD directo sobre la tabla de hechos)."""

from datetime import datetime, timedelta

from airflow import DAG
from airflow.operators.python import PythonOperator

from gold.recalificacion import run_recalificacion


with DAG(
    dag_id="tracklytics_recalificacion",
    description="Corrige año/país sin informar y perfiles de audio incoherentes con el género "
                "sobre el catálogo ya cargado, sin tocar source_type='real'",
    default_args={
        "owner":       "tracklytics",
        "retries":     1,
        "retry_delay": timedelta(minutes=5),
    },
    start_date=datetime(2026, 7, 13),
    schedule_interval=None,
    catchup=False,
    tags=["tracklytics", "recalificacion"],
) as dag:

    task_recalificacion = PythonOperator(
        task_id="task_recalificacion",
        python_callable=run_recalificacion,
    )
