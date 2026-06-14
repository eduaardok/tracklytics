"""DAG engagement_referencia — genera datos de referencia en FACT_ENGAGEMENT_USUARIO."""

from datetime import datetime, timedelta

from airflow import DAG
from airflow.models.param import Param
from airflow.operators.python import PythonOperator

from engagement.generator import run_engagement_referencia


with DAG(
    dag_id="engagement_referencia",
    description="Genera ~50 000 eventos de referencia por semana en FACT_ENGAGEMENT_USUARIO "
                "(is_synthetic=True, source='referencia')",
    default_args={
        "owner":       "tracklytics",
        "retries":     1,
        "retry_delay": timedelta(minutes=5),
    },
    start_date=datetime(2026, 5, 14),
    schedule_interval=None,
    catchup=False,
    tags=["tracklytics", "engagement"],
    params={
        "week_number": Param(
            default=1,
            type="integer",
            minimum=1,
            maximum=16,
            description="Semana académica (1-16). Genera ~50 000 eventos de referencia.",
        ),
    },
) as dag:

    task_engagement = PythonOperator(
        task_id="task_engagement",
        python_callable=run_engagement_referencia,
    )
