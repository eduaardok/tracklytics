"""DAG dag_generar_bajo_demanda — S14-P4, Fase 5: generación de actividad de
negocio bajo demanda para un rango de períodos, con relleno de huecos
(`gold.backfill_negocio.generar_actividad_rango`, granularidad mensual,
idempotente por dominio+mes vía `ETL_BATCH_CONTROL`), encadenada con el
refresco completo de la capa Gold (`dag_gold_aggregations`, 60 tareas) —
para que un usuario que genera actividad nueva vea sus 30 informes
compuestos actualizados sin un paso manual aparte.

Parámetros (`dag_run.conf`, disparados por
`api/paquetes/simulacion/router.py`):
- `dominios`: lista de nombres (subconjunto de
  `gold.backfill_negocio.DOMINIOS_BAJO_DEMANDA`).
- `periodo_inicio`/`periodo_fin`: fechas ISO (`YYYY-MM-DD`).

Disparo manual — no tiene sentido un `schedule_interval` fijo para "generar
lo que falte", el disparo lo decide quien lo pide desde la interfaz.

`task_refrescar_gold` dispara `dag_gold_aggregations` SIN esperar a que
termine (`wait_for_completion=False`, el default) — a propósito, encontrado
en la verificación real de esta fase: con `wait_for_completion=True`, esta
tarea se queda haciendo polling dentro del mismo `SequentialExecutor` que
también está corriendo las 60 tareas de `dag_gold_aggregations`, compitiendo
por el mismo SQLite de metadata de Airflow (mismo quirk de infraestructura
ya documentado: "el scheduler puede morir en silencio" por
`database is locked`) — un lock transitorio during el polling hizo fallar
esta tarea, y el reintento automático (`retries`) chocó con el propio
`dag_run` que el intento anterior ya había creado (`DagRunAlreadyExists`,
porque el `run_id` era determinístico). Disparar sin esperar evita ambos
problemas a la vez: el estado del refresco se consulta aparte, vía
`GET /simulacion/estado` (que sí espacia sus lecturas), no bloqueando un
slot del executor con un polling apretado. `retries=0` en esta tarea
puntual: un reintento de un disparo "fire-and-forget" no aporta nada y sí
puede duplicar el `dag_run` disparado."""

from datetime import date, datetime, timedelta

from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.operators.trigger_dagrun import TriggerDagRunOperator

from gold.backfill_negocio import DOMINIOS_BAJO_DEMANDA, generar_actividad_rango


def _generar(**context):
    conf = context["dag_run"].conf or {}
    dominios = conf.get("dominios") or list(DOMINIOS_BAJO_DEMANDA)
    periodo_inicio = date.fromisoformat(conf["periodo_inicio"])
    periodo_fin = date.fromisoformat(conf["periodo_fin"])
    resultado = generar_actividad_rango(dominios, periodo_inicio, periodo_fin)
    context["ti"].xcom_push(key="resumen", value=resultado)


with DAG(
    dag_id="dag_generar_bajo_demanda",
    description="Genera actividad de negocio para un rango de períodos (rellena huecos) "
                "y dispara el refresco de la capa Gold completa a continuación — S14-P4, Fase 5",
    default_args={
        "owner":       "tracklytics",
        "retries":     1,
        "retry_delay": timedelta(minutes=2),
    },
    start_date=datetime(2026, 8, 5),
    schedule_interval=None,
    catchup=False,
    tags=["tracklytics", "negocio", "bajo-demanda"],
) as dag:

    task_generar = PythonOperator(
        task_id="task_generar_actividad",
        python_callable=_generar,
    )

    task_refrescar_gold = TriggerDagRunOperator(
        task_id="task_refrescar_gold",
        trigger_dag_id="dag_gold_aggregations",
        wait_for_completion=False,
        retries=0,
        # Sin `trigger_run_id` fijo: Airflow genera uno único por disparo
        # (`trigger__<timestamp>`) — no hay reintento que pueda chocar con
        # un `dag_run` que un intento anterior ya haya creado.
    )

    task_generar >> task_refrescar_gold
