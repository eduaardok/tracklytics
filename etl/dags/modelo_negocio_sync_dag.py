"""DAG modelo_negocio_sync — completar-modelo-base: genera datos reproducibles
para FACT_ADQUISICION/FACT_DISPONIBILIDAD, una semana por corrida (mismo
patrón que `engagement_referencia`: Param `week_number`, disparo manual/API,
independiente de `tracklytics_etl` porque es un dominio de negocio ajeno al
catálogo musical — ver design.md de `completar-modelo-base`)."""

from datetime import datetime, timedelta

from airflow import DAG
from airflow.models.param import Param
from airflow.operators.python import PythonOperator

from gold.modelo_negocio_sync import run_modelo_negocio_sync

with DAG(
    dag_id="modelo_negocio_sync",
    description="Genera FACT_ADQUISICION/FACT_DISPONIBILIDAD (datos de negocio reproducibles) para una semana académica",
    default_args={
        "owner":       "tracklytics",
        "retries":     1,
        "retry_delay": timedelta(minutes=5),
    },
    start_date=datetime(2026, 5, 14),
    schedule_interval=None,
    catchup=False,
    tags=["tracklytics", "analitica"],
    params={
        "week_number": Param(
            default=1,
            type="integer",
            minimum=1,
            maximum=16,
            description="Semana académica (1-16). Idempotente: una semana ya generada se salta.",
        ),
    },
) as dag:

    task_modelo_negocio_sync = PythonOperator(
        task_id="task_modelo_negocio_sync",
        python_callable=run_modelo_negocio_sync,
    )
