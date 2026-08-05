"""DAG dag_backfill_negocio — S14-P3: genera 24 meses de historia real de
eventos de negocio en las tablas `FACT_*` del catálogo (8123), reemplazando
la fabricación en tiempo de agregación (`rng_for()` en `etl/gold_ch/*.py`)
por eventos reales que la capa Gold agrega sin inventar nada.

Un único `PythonOperator`, no una tarea por dominio: el propio prompt exige
"generar en orden de dependencia, no en paralelo por tabla" (una factura
exige una suscripción previa, una liquidación de regalías exige
reproducciones ya generadas, etc.) — `run_backfill_negocio()` ya encapsula
ese orden internamente, y cada dominio es idempotente por su cuenta
(`ETL_BATCH_CONTROL`, ver `gold/backfill_negocio.py`), así que una sola
tarea larga es más simple y más correcta acá que 13 tareas con
dependencias `>>` explícitas.

Disparo manual (`schedule_interval=None`) — es un backfill histórico de una
sola corrida, no un proceso recurrente."""

from datetime import datetime, timedelta

from airflow import DAG
from airflow.operators.python import PythonOperator

from gold.backfill_negocio import run_backfill_negocio

with DAG(
    dag_id="dag_backfill_negocio",
    description="Backfill de 24 meses de eventos de negocio reales en el catálogo (8123) — "
                "S14-P3, reemplaza el relleno demo (rng_for) de la capa Gold",
    default_args={
        "owner":       "tracklytics",
        "retries":     1,
        "retry_delay": timedelta(minutes=5),
    },
    start_date=datetime(2026, 8, 5),
    schedule_interval=None,
    catchup=False,
    tags=["tracklytics", "negocio", "backfill"],
) as dag:

    task_backfill_negocio = PythonOperator(
        task_id="task_backfill_negocio",
        python_callable=run_backfill_negocio,
        execution_timeout=timedelta(hours=2),
    )
