## Context

`ingesta` es la única capability operativa con permiso de escritura sobre ClickHouse: todas las demás (`catalogo`, `analitica`, `partners`) son consumidoras de solo lectura del modelo técnico y de negocio. Esta capability es la interfaz de gestión sobre el pipeline ETL ya establecido en el proyecto (PocketBase → Python ETL → Parquet → ClickHouse, orquestado con Airflow) y sobre las tablas de infraestructura ya definidas en el modelo de datos técnico (STG_RAW_TRACKS, ETL_LOGS, ETL_BATCH_CONTROL).

El Lead Data Engineer es el único actor de esta capability. No reemplaza ni redefine el pipeline ETL en sí (que ya corre como DAGs de Airflow); le da una interfaz de gestión para dispararlo, monitorearlo y auditarlo, y además administra directamente las dimensiones técnicas del catálogo.

## Goals / Non-Goals

**Goals:**
- Disparar y monitorear en tiempo real una ejecución de ingesta de un período/lote.
- Garantizar idempotencia: un período ya cargado no se reinserta salvo recarga forzada explícita.
- Registrar en auditoría cada ejecución, exitosa o fallida, con sus métricas.
- Exponer historial de cargas con métricas de calidad y señalar las que excedan 1% de tasa de rechazo.
- Permitir CRUD sobre las dimensiones técnicas del catálogo, manteniendo la tabla de hechos como solo lectura desde la interfaz.
- Exigir confirmación explícita antes de eliminar una dimensión referenciada por la tabla de hechos.

**Non-Goals:**
- Definir nuevas fuentes de datos externas distintas a la fuente origen actual.
- Implementar transformaciones de calidad avanzadas (deduplicación difusa, enriquecimiento externo).
- Enviar notificaciones automáticas (correo/Slack) ante fallos de ingesta.

## Decisions

### Disparo de la ingesta vía orquestación existente en Airflow, no ejecución síncrona en el request

El endpoint de FastAPI que dispara la ingesta de un período/lote no ejecuta el pipeline de forma síncrona dentro del request; dispara la ejecución correspondiente en Airflow (ya el orquestador establecido del proyecto) y devuelve de inmediato un identificador de ejecución. El estado de cada etapa (extracción, transformación a staging, carga a ClickHouse) se consulta mediante un endpoint de monitoreo que lee el progreso reportado por esa ejecución de Airflow (RF-ING-002). Alternativa descartada: ejecutar el pipeline de forma síncrona dentro del request HTTP — se rechaza porque una recarga de cientos de miles de registros no es compatible con el ciclo de vida de una solicitud HTTP, y porque Airflow ya es el orquestador obligatorio del proyecto.

### Idempotencia respaldada en ETL_BATCH_CONTROL

Antes de insertar, el pipeline consulta `ETL_BATCH_CONTROL` para verificar si el período/lote ya está marcado como cargado (RF-ING-003, RNF-ING-002). Si ya existe y no se indicó recarga forzada explícita por el Lead Data Engineer, el sistema detiene la ejecución sin insertar (RN-ING-001, Escenario 2). La recarga forzada es un parámetro explícito de la solicitud de disparo, no un comportamiento por defecto.

### Auditoría en ETL_LOGS, incluso ante fallo

Cada ejecución (exitosa o fallida) escribe un registro en `ETL_LOGS` con timestamp, período, registros leídos, insertados, rechazados y duración total (RF-ING-004, RNF-ING-003). Si la ejecución falla antes de completar todas las etapas, el registro de auditoría se escribe de todas formas con el estado de fallo y las métricas parciales disponibles hasta el punto de falla.

### Tasa de rechazo y señal de revisión

La tasa de rechazo (`registros_rechazados / registros_leídos`) se calcula al finalizar cada carga y se compara contra el umbral de 1% (RN-ING-002). Si lo supera, el registro correspondiente en el historial de cargas se marca con un estado de "requiere revisión", visible al Lead Data Engineer al consultar el historial (Escenario 3). Esta señal es informativa: el sistema no bloquea ni revierte automáticamente una carga que excede el umbral.

### Carga a ClickHouse en batches de mínimo 50.000 filas

La etapa de carga a ClickHouse del pipeline inserta en lotes de mínimo 50.000 filas (RNF-ING-001), consistente con el patrón de carga masiva ya establecido en el proyecto para sostener una recarga completa (~800k registros) en segundos (Escenario 1, CA-ING-001).

### CRUD de dimensiones como escritura administrativa directa, tabla de hechos inalcanzable desde la interfaz

A diferencia de las demás capabilities (que solo leen ClickHouse), `ingesta` expone endpoints de FastAPI que escriben directamente sobre las tablas de dimensión técnica (artistas, álbumes, géneros, etc.) para soportar su administración CRUD (RF-ING-007). No existe, en cambio, ningún endpoint de escritura sobre `FACT_TRACKS`: la tabla de hechos solo se actualiza a través de la etapa de carga del pipeline de ingesta, nunca desde un CRUD de la interfaz de gestión (RF-ING-008, RN-ING-003, CA-ING-004). Esta asimetría es intencional: las dimensiones son catálogos de referencia de bajo volumen administrados manualmente; la tabla de hechos es el resultado de la integración masiva de datos y su integridad depende de pasar siempre por el pipeline.

### Confirmación explícita antes de eliminar dimensiones referenciadas

Antes de ejecutar un `DELETE` sobre un valor de dimensión, el endpoint correspondiente verifica si existen registros en `FACT_TRACKS` que referencien ese valor. Si existen, la operación requiere un parámetro de confirmación explícita en la solicitud; sin él, la operación se rechaza informando que el valor está referenciado (RN-ING-004, Escenario 4).

### Decisiones tomadas durante la implementación (apply)

- **No existe gating de acceso previo en `gestion_datos`.** Ningún endpoint (legacy ni nuevo) tenía control de acceso antes de esta implementación, pese a que el Context establece que "el Lead Data Engineer es el único actor de esta capability". Se agregó `require_lead_data_engineer` (mapeado a `role=admin`, el mismo rol de staff usado en el resto del proyecto) a nivel de router, cubriendo tanto `/etl/*`, `/dim/*`, `/facts`, `/data-quality` como los nuevos `/app/v1/ingesta/*`. Las páginas `etl.html` y `crud.html` pasaron de chequear `hasAnalyticsAccess()` (admin O analyst) a `requireRole('admin')`, consistente con `data-quality.html` que ya usaba ese chequeo.
- **El guard de concurrencia (tarea 2.3) no usa `ETL_BATCH_CONTROL`** como sugería el texto original, porque esa tabla no tiene columna de estado y el Migration Plan prohíbe modificar el modelo de datos técnico. En su lugar, consulta dagRuns activos en Airflow. Durante la verificación con curl se encontraron y corrigieron dos bugs reales en este guard:
  1. Sin un lock de proceso, dos disparos con ~0.3–0.5s de diferencia pasaban ambos la verificación antes de que el primero registrara su dagRun en Airflow — confirmado empíricamente (ambos recibieron 202). Se agregó un `asyncio.Lock` que serializa el tramo verificar→truncar→disparar dentro del proceso de FastAPI (un solo worker uvicorn).
  2. La consulta a Airflow ordenaba `dagRuns` por `-start_date` y tomaba los últimos 10; un dagRun en estado `queued` todavía no tiene `start_date` (se asigna al pasar a `running`), por lo que el orden con nulls lo excluía del límite de forma impredecible y el guard no detectaba la ejecución recién encolada. Se corrigió filtrando por `state=queued|running` directamente en la API de Airflow en vez de ordenar por una columna nullable.
- **RF-ING-004 (auditoría incluso en fallo) requirió un cambio puntual en la DAG**, no solo en FastAPI: `gold/loader.py::run_log` solo se ejecutaba si todas las tareas previas tenían éxito, así que una ejecución fallida no generaba fila en `ETL_LOGS`. Se agregó una task `task_log_failure` (`trigger_rule=ONE_FAILED`) que solo corre si alguna tarea previa falla, sin modificar la lógica de las tasks existentes. Verificado que la DAG sigue parseando sin errores (`has_import_errors: false`) y que la task queda `skipped` en el camino feliz.
- **El endpoint legacy `/etl/trigger` ahora reutiliza el mismo guard** (`_trigger_guarded`) que `POST /app/v1/ingesta/ejecuciones`, en vez de quedar como una ruta paralela sin idempotencia ni guard de concurrencia — de lo contrario, el Lead Data Engineer podría rodear RN-ING-001 simplemente usando la ruta antigua desde `etl.html`. No se le agregó `forzar_recarga` para no romper su contrato existente; siempre se comporta como recarga no forzada.
- **No se insertaron datos sintéticos en `FACT_TRACKS` para probar el flujo de eliminación de dimensión referenciada con `confirmar=true`** (el harness de ejecución bloqueó ese intento por buenas razones: mutar la tabla de hechos compartida solo para un test). Se verificó en cambio: (a) el camino 409 contra un género real referenciado, (b) el camino 204 contra una dimensión sin referencias creada y eliminada para la prueba, y (c) por inspección de código, que el único cambio entre ambos caminos es la bandera `confirmar` en la misma condición ya verificada.
- **Riesgo preexistente no resuelto, fuera de alcance**: `dim_create`/`dim_update` construyen SQL por interpolación de strings (no parametrizada) a partir del body del request. Es código anterior a esta capability (ya existía en `gestion_datos`) y no forma parte de los requisitos RF-ING-007/008; se documenta aquí como hallazgo, no se modifica en este change para no expandir el alcance de la implementación de `ingesta`.

## Risks / Trade-offs

- [Riesgo] Dos disparos simultáneos del mismo período podrían intentar insertar en paralelo antes de que `ETL_BATCH_CONTROL` registre el primero como en curso → Mitigación: la verificación y el marcado de "en curso" en `ETL_BATCH_CONTROL` se realizan como una operación atómica antes de iniciar la ejecución en Airflow.
- [Riesgo] Una ejecución que falla a mitad del pipeline puede dejar registros parciales en `STG_RAW_TRACKS` → Mitigación: el registro de auditoría en `ETL_LOGS` refleja el estado de fallo y las métricas parciales, permitiendo al Lead Data Engineer identificar y limpiar manualmente el staging antes de reintentar.
- [Riesgo] Eliminar una dimensión referenciada, incluso con confirmación explícita, puede dejar registros de `FACT_TRACKS` con una referencia inválida → Mitigación: la confirmación explícita traslada la decisión y su consecuencia al Lead Data Engineer; no se implementa un mecanismo de cascada automática, ya que no está definido en los requisitos de esta capability.

## Migration Plan

No aplica migración de datos: esta capability agrega una interfaz de gestión y endpoints en FastAPI sobre tablas y un pipeline que ya existen (FACT_TRACKS, dimensiones técnicas, STG_RAW_TRACKS, ETL_LOGS, ETL_BATCH_CONTROL, DAGs de Airflow). No se crean tablas nuevas ni se modifica el modelo de datos técnico. Despliegue vía `docker compose up` sin pasos manuales adicionales.

## Open Questions

Ninguna pendiente: el mecanismo de disparo (Airflow), el control de idempotencia (ETL_BATCH_CONTROL) y la auditoría (ETL_LOGS) ya están definidos por la infraestructura existente del proyecto.
