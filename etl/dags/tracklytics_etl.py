"""
Tracklytics v2 — ETL DAG (arquitectura medallion)

Bronze  → extracción de PocketBase → Parquet inmutable
Silver  → carga en STG_RAW_TRACKS (staging ClickHouse)
Gold    → poblado de dimensiones + inserción de registros reales (semana 1)
Synthetic → generación e inserción de datos sintéticos (semanas 2..N)
Log     → registro en ETL_LOGS + ETL_BATCH_CONTROL + cleanup

Semana 1  → 113 550 registros reales de PocketBase
Semana 2  → 100 000 sintéticos (seed=84)
Semana k  → 100 000 sintéticos (seed=k*42)
Total: 113 550 + (N-1) × 100 000
"""

from datetime import datetime, timedelta

from airflow import DAG
from airflow.models.param import Param
from airflow.operators.python import PythonOperator
from airflow.utils.trigger_rule import TriggerRule

from bronze.extractor import run_bronze
from silver.cleaner import run_silver
from gold.loader import run_gold, run_log, run_log_failure
from gold.synthetic import run_synthetic


with DAG(
    dag_id="tracklytics_etl",
    description="PocketBase → ClickHouse: arquitectura medallion Bronze/Silver/Gold",
    default_args={
        "owner":       "tracklytics",
        "retries":     1,
        "retry_delay": timedelta(minutes=5),
    },
    start_date=datetime(2026, 5, 14),
    schedule_interval=None,
    catchup=False,
    tags=["tracklytics", "etl"],
    params={
        "week_number": Param(
            default=1,
            type="integer",
            minimum=1,
            maximum=16,
            description="Semanas a cargar (1-16). "
                        "Semana 1 = solo reales. Semana N = reales + (N-1)×100k sintéticos.",
        ),
        "synthetic_mode": Param(
            default="uniform",
            type="string",
            enum=["uniform", "normal", "empirical"],
            description=(
                "Modo de distribución para datos sintéticos (semanas 2+). "
                "uniform: distribuciones planas aleatorias. "
                "normal: gaussianas centradas en valores musicalmente realistas. "
                "empirical: resamplea directo de los datos reales (semana 1)."
            ),
        ),
    },
) as dag:

    task_bronze    = PythonOperator(task_id="task_bronze",    python_callable=run_bronze)
    task_silver    = PythonOperator(task_id="task_silver",    python_callable=run_silver)
    task_gold      = PythonOperator(task_id="task_gold",      python_callable=run_gold)
    task_synthetic = PythonOperator(task_id="task_synthetic", python_callable=run_synthetic)
    task_log       = PythonOperator(task_id="task_log",       python_callable=run_log)

    # RF-ING-004: toda ejecución (exitosa o fallida) queda auditada en ETL_LOGS.
    # Se dispara solo si alguna de las tasks anteriores falla (no afecta el
    # camino feliz, que sigue terminando en task_log).
    task_log_failure = PythonOperator(
        task_id="task_log_failure",
        python_callable=run_log_failure,
        trigger_rule=TriggerRule.ONE_FAILED,
    )

    task_bronze >> task_silver >> task_gold >> task_synthetic >> task_log
    [task_bronze, task_silver, task_gold, task_synthetic] >> task_log_failure
