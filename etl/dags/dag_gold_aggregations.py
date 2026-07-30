"""DAG dag_gold_aggregations — S13-P3a: calcula las 12 tablas GOLD_* (capa
de agregaciones para los 30 informes compuestos) leyendo del ClickHouse de
catálogo (8123, solo lectura) y escribiendo en ClickHouse Gold (8124).

Cada tarea es independiente (una tabla Gold cada una) e idempotente por
período: DELETE + INSERT sobre la ventana de 12 semanas ISO más recientes
(ver `gold_ch.base.write_gold`) — correr el DAG dos veces seguidas para el
mismo período deja el mismo resultado, nunca filas duplicadas.

Disparo manual (`schedule_interval=None`), igual que `tracklytics_recalificacion`
— no hay todavía un cron real para la capa Gold (eso, si se pide, sería un
cambio explícito de `schedule_interval`, no algo a decidir en P3a)."""

from datetime import datetime, timedelta

from airflow import DAG
from airflow.operators.python import PythonOperator

from gold_ch.adquisicion import run_gold_adquisicion
from gold_ch.api_consumo import run_gold_api_consumo
from gold_ch.comunidad import run_gold_comunidad
from gold_ch.consumo_genero import run_gold_consumo_genero
from gold_ch.contenido import run_gold_contenido
from gold_ch.engagement import run_gold_engagement
from gold_ch.financiero import run_gold_financiero
from gold_ch.infraestructura import run_gold_infraestructura
from gold_ch.pipeline import run_gold_pipeline
from gold_ch.producto import run_gold_producto
from gold_ch.regalias import run_gold_regalias
from gold_ch.seguridad import run_gold_seguridad

with DAG(
    dag_id="dag_gold_aggregations",
    description="Agrega el ClickHouse de catálogo (8123, solo lectura) en las 12 tablas "
                "GOLD_* de ClickHouse Gold (8124) para los 30 informes compuestos",
    default_args={
        "owner":       "tracklytics",
        "retries":     1,
        "retry_delay": timedelta(minutes=2),
    },
    start_date=datetime(2026, 7, 29),
    schedule_interval=None,
    catchup=False,
    tags=["tracklytics", "gold", "reportes-compuestos"],
) as dag:

    tareas = [
        PythonOperator(task_id="task_gold_adquisicion",     python_callable=run_gold_adquisicion),
        PythonOperator(task_id="task_gold_api_consumo",     python_callable=run_gold_api_consumo),
        PythonOperator(task_id="task_gold_infraestructura", python_callable=run_gold_infraestructura),
        PythonOperator(task_id="task_gold_financiero",      python_callable=run_gold_financiero),
        PythonOperator(task_id="task_gold_regalias",        python_callable=run_gold_regalias),
        PythonOperator(task_id="task_gold_pipeline",        python_callable=run_gold_pipeline),
        PythonOperator(task_id="task_gold_engagement",      python_callable=run_gold_engagement),
        PythonOperator(task_id="task_gold_consumo_genero",  python_callable=run_gold_consumo_genero),
        PythonOperator(task_id="task_gold_contenido",       python_callable=run_gold_contenido),
        PythonOperator(task_id="task_gold_comunidad",       python_callable=run_gold_comunidad),
        PythonOperator(task_id="task_gold_seguridad",       python_callable=run_gold_seguridad),
        PythonOperator(task_id="task_gold_producto",        python_callable=run_gold_producto),
    ]
    # Independientes entre sí (cada una escribe su propia tabla) — sin
    # dependencias `>>`: el `SequentialExecutor` del proyecto las corre una
    # por una igual, pero declararlas en paralelo dentro del DAG evita que un
    # fallo en una tarea bloquee la ejecución de las demás.
