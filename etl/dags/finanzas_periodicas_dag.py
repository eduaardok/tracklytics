"""DAG finanzas_periodicas — S10 Día 2 (change `2026-07-11-regalias-publicidad`):
primer DAG del proyecto con `schedule_interval` real (no `None`/disparo
manual) — cierra el hallazgo de la auditoría de que "facturación recurrente"
no existía. Corre semanalmente: primero renueva suscripciones de pago
vencidas (genera las transacciones/invoices del período), luego liquida
regalías de ese mismo período con el ingreso ya actualizado (ver design.md
para por qué este orden)."""

from datetime import datetime, timedelta

from airflow import DAG
from airflow.operators.python import PythonOperator

from gold.facturacion_recurrente import run_facturacion_recurrente
from gold.regalias_liquidacion import run_liquidacion_regalias

with DAG(
    dag_id="finanzas_periodicas",
    description="Renovación de suscripciones vencidas + liquidación de regalías del período (cron real, semanal)",
    default_args={
        "owner":       "tracklytics",
        "retries":     1,
        "retry_delay": timedelta(minutes=5),
    },
    start_date=datetime(2026, 5, 14),
    schedule_interval="@weekly",
    catchup=False,
    tags=["tracklytics", "finanzas", "regalias", "publicidad"],
) as dag:

    task_facturacion_recurrente = PythonOperator(
        task_id="task_facturacion_recurrente",
        python_callable=run_facturacion_recurrente,
    )

    task_liquidacion_regalias = PythonOperator(
        task_id="task_liquidacion_regalias",
        python_callable=run_liquidacion_regalias,
    )

    task_facturacion_recurrente >> task_liquidacion_regalias
