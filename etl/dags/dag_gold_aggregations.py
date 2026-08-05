"""DAG dag_gold_aggregations — calcula las 12 tablas GOLD_* (capa de
agregaciones para los 30 informes compuestos) leyendo del ClickHouse de
catálogo (8123, solo lectura) y escribiendo en ClickHouse Gold (8124).

S13-P3a: grano fijo semanal, 12 tareas (una por dominio). S14-P2: grano
temporal configurable — cada dominio ahora corre una vez por cada una de las
5 granularidades (`gold_ch.base.GRANULARIDADES`), 12×5 = 60 tareas en total,
usando `op_kwargs={'granularidad': g}` (no closures de Python, que en un
`for` capturan la variable por referencia y todas las tareas terminarían
corriendo con el último valor de `g` — `op_kwargs` es la forma nativa de
Airflow de pasar un valor fijo por tarea).

Cada tarea es independiente (una tabla Gold + una granularidad cada una) e
idempotente por granularidad+período: DELETE + INSERT sobre la ventana de
esa granularidad (ver `gold_ch.base.write_gold`) — correr el DAG dos veces
seguidas para la misma granularidad deja el mismo resultado, nunca filas
duplicadas.

Disparo manual (`schedule_interval=None`), igual que
`tracklytics_recalificacion` — no hay todavía un cron real para la capa
Gold (eso, si se pide, sería un cambio explícito de `schedule_interval`, no
algo a decidir en P2)."""

from datetime import datetime, timedelta

from airflow import DAG
from airflow.operators.python import PythonOperator

from gold_ch.adquisicion import run_gold_adquisicion
from gold_ch.api_consumo import run_gold_api_consumo
from gold_ch.base import GRANULARIDADES
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

DOMINIOS = [
    ("adquisicion",     run_gold_adquisicion),
    ("api_consumo",     run_gold_api_consumo),
    ("infraestructura", run_gold_infraestructura),
    ("financiero",       run_gold_financiero),
    ("regalias",         run_gold_regalias),
    ("pipeline",         run_gold_pipeline),
    ("engagement",       run_gold_engagement),
    ("consumo_genero",   run_gold_consumo_genero),
    ("contenido",        run_gold_contenido),
    ("comunidad",        run_gold_comunidad),
    ("seguridad",        run_gold_seguridad),
    ("producto",         run_gold_producto),
]

with DAG(
    dag_id="dag_gold_aggregations",
    description="Agrega el ClickHouse de catálogo (8123, solo lectura) en las 12 tablas "
                "GOLD_* de ClickHouse Gold (8124) para los 30 informes compuestos, "
                "una vez por cada una de las 5 granularidades soportadas (S14-P2)",
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
        PythonOperator(
            task_id=f"task_gold_{dominio}_{granularidad}",
            python_callable=callable_,
            op_kwargs={"granularidad": granularidad},
        )
        for dominio, callable_ in DOMINIOS
        for granularidad in GRANULARIDADES
    ]
    # Independientes entre sí (cada una escribe su propia tabla+granularidad)
    # — sin dependencias `>>`: el `SequentialExecutor` del proyecto las corre
    # una por una igual, pero declararlas en paralelo dentro del DAG evita
    # que un fallo en una tarea bloquee la ejecución de las demás.
