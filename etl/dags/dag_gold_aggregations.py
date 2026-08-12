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

S15: `schedule_interval="@weekly"` (cron real) — se alinea 1:1 con la
cadencia de `tracklytics_etl` (semana académica simulada); Gold no es
costoso de recalcular (60 tareas de agregación SQL sobre ClickHouse), pero
no hay motivo para correrlo más seguido que la fuente que agrega, así que
`@daily` habría sido puro desperdicio de scheduler. Sigue aceptando disparo
manual además del cron (comportamiento normal de Airflow, no exclusivo).

Guarda `hay_batch_nuevo` (ShortCircuitOperator): la cadencia semanal puede
caer en una semana donde nadie disparó `tracklytics_etl` ni la generación
bajo demanda (`dag_generar_bajo_demanda`, que ya encadena su propio refresco
de Gold) — sin esto, esa corrida recalcularía 60 tareas sobre exactamente
los mismos datos. Compara el último `ETL_LOGS.run_timestamp` exitoso
(catálogo, 8123) contra el último `GOLD_ETL_LOG.ejecutado_en` (Gold, 8124):
si no hay carga más nueva que la última corrida de Gold, salta limpiamente
(no falla) y lo deja en el log de la tarea."""

import logging
from datetime import datetime, timedelta

from airflow import DAG
from airflow.operators.python import PythonOperator, ShortCircuitOperator

from gold_ch.adquisicion import run_gold_adquisicion
from gold_ch.api_consumo import run_gold_api_consumo
from gold_ch.base import GRANULARIDADES, get_catalog_client, get_gold_client
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
from utils.clickhouse_client import scalar

log = logging.getLogger(__name__)

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


def hay_batch_nuevo() -> bool:
    """True si hay una carga de catálogo exitosa más nueva que la última
    corrida de Gold — condición para el `ShortCircuitOperator` de abajo.
    Sin corridas previas de Gold (`GOLD_ETL_LOG` vacío) o sin cargas
    exitosas todavía, no hay nada que comparar: se deja pasar (la propia
    agregación no escribe nada si el catálogo está vacío, no es un caso que
    haga falta bloquear acá)."""
    ultima_carga = scalar(
        get_catalog_client(), "SELECT max(run_timestamp) FROM ETL_LOGS WHERE status = 'success'",
    )
    ultima_gold = scalar(get_gold_client(), "SELECT max(ejecutado_en) FROM GOLD_ETL_LOG")
    if ultima_carga is None or ultima_gold is None:
        log.info("dag_gold_aggregations: sin corridas previas que comparar, se ejecuta.")
        return True
    corre = ultima_carga > ultima_gold
    log.info(
        "dag_gold_aggregations: última carga exitosa=%s, última corrida Gold=%s → %s",
        ultima_carga, ultima_gold, "ejecuta" if corre else "salta (nada nuevo que agregar)",
    )
    return corre


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
    schedule_interval="@weekly",
    catchup=False,
    tags=["tracklytics", "gold", "reportes-compuestos"],
) as dag:

    task_guard = ShortCircuitOperator(
        task_id="hay_batch_nuevo",
        python_callable=hay_batch_nuevo,
    )

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
    # — sin dependencias `>>` entre ellas: el `SequentialExecutor` del
    # proyecto las corre una por una igual, pero declararlas en paralelo
    # dentro del DAG evita que un fallo en una tarea bloquee la ejecución de
    # las demás. Sí dependen todas de `task_guard`: la comparación de
    # timestamps es sobre frescura de datos, no sobre el modo de disparo, así
    # que aplica igual a una corrida manual — si alguien dispara el DAG a
    # mano sin que haya carga nueva, correcto también saltarlo (sigue siendo
    # idempotente, no es un caso a bloquear con lógica aparte).
    task_guard >> tareas
