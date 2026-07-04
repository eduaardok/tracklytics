## Context

El modelo de datos de negocio de Tracklytics (documentado desde antes del refactor de las 6
capabilities operativas) define 13 tablas independientes del modelo técnico de catálogo: 6 FACT
(`FACT_SUSCRIPCION`, `FACT_ADQUISICION`, `FACT_INTEGRACION_PARTNER`, `FACT_DISPONIBILIDAD`,
`FACT_INGESTA_DATOS`, `FACT_ENGAGEMENT_USUARIO`) y 7 DIM (`DIM_TIEMPO`, `DIM_REGION`,
`DIM_CLIENTE`, `DIM_PARTNER`, `DIM_PLAN_SUSCRIPCION`, `DIM_CANAL_MARKETING`,
`DIM_COMPONENTE_INFRAESTRUCTURA`).

Una auditoría contra `system.tables` confirmó qué parte de ese inventario de 13 ya está resuelta
y bajo qué nombre real:

| Tabla original | Estado | Dónde vive hoy |
|---|---|---|
| `FACT_SUSCRIPCION` | Cubierta | Colección PocketBase de `suscripciones` (`api/paquetes/suscripciones/pb_client.py`) |
| `FACT_INTEGRACION_PARTNER` | Cubierta | `LOG_LLAMADAS_PARTNER` (ClickHouse) |
| `FACT_INGESTA_DATOS` | Cubierta | `ETL_LOGS` + `ETL_BATCH_CONTROL` (ClickHouse) |
| `FACT_ENGAGEMENT_USUARIO` | Cubierta | Ya existe con ese nombre exacto (núcleo original) |
| `DIM_TIEMPO` | Cubierta | `DIM_DATE` (núcleo original) |
| `DIM_CLIENTE` | Cubierta | `DIM_USUARIO` (`seguridad`) |
| `DIM_PARTNER` | Cubierta | Colección PocketBase `partners` |
| `DIM_PLAN_SUSCRIPCION` | Cubierta | Colección PocketBase de `suscripciones` (`planes.py`) |
| `FACT_ADQUISICION` | **Faltante** | — (este cambio) |
| `FACT_DISPONIBILIDAD` | **Faltante** | — (este cambio) |
| `DIM_REGION` | **Faltante** | — (este cambio) |
| `DIM_CANAL_MARKETING` | **Faltante** | — (este cambio) |
| `DIM_COMPONENTE_INFRAESTRUCTURA` | **Faltante** | — (este cambio) |

El gap es visible en producción hoy: `frontend/src/app/router.tsx` ya reserva las rutas
`/analitica/adquisicion` y `/analitica/disponibilidad`, ambas renderizando `ComingSoonPage` sin
backend detrás.

**Nota de nomenclatura importante:** ya existe una ruta `/distribucion/disponibilidad`
(`DisponibilidadPage`, capability `distribucion`) que resuelve restricción geográfica de
reproducción de contenido licenciado — un concepto de negocio completamente distinto
(licencias/mercado) al de este cambio (uptime/incidentes de infraestructura del sistema). Los
dos nombres son casualmente iguales en español; se diferencian explícitamente en el nombrado de
componentes para no confundir a quien lea el código o el nav (ver Decisiones).

## Goals / Non-Goals

**Goals:**
- Completar las 5 tablas genuinamente faltantes del modelo de negocio original, cerrando un gap
  documentado desde antes del refactor de las 6 capabilities, no abriendo alcance nuevo.
- Reemplazar las 2 páginas `ComingSoonPage` de `analitica` (Adquisición, Disponibilidad) por
  vistas reales mínimas, bajo el mismo guard ya establecido para el resto de la capability.
- Dejar explícita, sin asumirla, la estrategia de generación de datos para las 2 FACT nuevas —
  no existe un sistema real de marketing ni de monitoreo de infraestructura del que extraer
  eventos reales (ver Open Questions).

**Non-Goals:**
- No se introduce una séptima capability operativa — este cambio completa el modelo de negocio
  preexistente (sección "Modelo de datos de negocio" de la constitución del proyecto), no agrega
  un vacío funcional nuevo como hicieron `seguridad`/`facturacion`/etc.
- No se duplica `DIM_PAIS` (`distribucion`, restricción de reproducción por país) con
  `DIM_REGION` (agrupación geográfica de negocio, ej. "Latinoamérica") — son conceptos
  distintos a nivel de negocio (país legal de licencia vs. región de reporting comercial), con
  granularidades distintas (país vs. agrupación de países) y con dueños distintos
  (`distribucion` posee `DIM_PAIS`; este cambio posee `DIM_REGION`). No hay FK entre ambas en
  esta propuesta — si en el futuro se quisiera derivar región desde país, sería una decisión
  aparte, fuera de este alcance.
- No se implementa monitoreo de infraestructura real (ej. health checks reales de Docker/
  Airflow) — `FACT_DISPONIBILIDAD` registra eventos de disponibilidad con la misma naturaleza
  simulada que el resto de datos de negocio del proyecto, no telemetría operativa real del
  clúster.

## Decisions

### Ubicación de cada entidad nueva (PocketBase vs. ClickHouse)

| Entidad | Vive en | Por qué |
|---|---|---|
| `DIM_CANAL_MARKETING` | ClickHouse | Dimensión de negocio pequeña y estable, mismo perfil que `DIM_TIPO_RESTRICCION`/`DIM_SELLO_DISCOGRAFICO` de `distribucion` — no hay razón para sacarla de ClickHouse. |
| `DIM_REGION` | ClickHouse | Mismo perfil que `DIM_PAIS`: dimensión de negocio pequeña, de solo lectura para el resto del sistema. |
| `DIM_COMPONENTE_INFRAESTRUCTURA` | ClickHouse | Catálogo fijo y pequeño (api, clickhouse, pocketbase, airflow) — no justifica una colección de PocketBase para 4-6 filas que nunca cambian desde el frontend. |
| `FACT_ADQUISICION` | ClickHouse | Evento analítico append-only agregable por canal/región/semana — mismo perfil que `FACT_REPRODUCCION_EVENTO`/`FACT_IMPRESION_RECOMENDACION` de `experiencia`, sin tensión pedagógica (no es un dominio transaccional forzado). |
| `FACT_DISPONIBILIDAD` | ClickHouse | Mismo perfil que `FACT_ADQUISICION`: evento append-only, agregable por componente/semana. |

Ninguna de las 5 tablas nuevas requiere la decisión pedagógica deliberada de forzar un dominio
OLTP en ClickHouse (a diferencia de `seguridad`/`facturacion`/`FACT_TICKET_SOPORTE`) — todas son
eventos de solo-inserción o dimensiones de referencia estáticas, el caso de uso natural de
ClickHouse.

### `DIM_REGION` vs. `DIM_PAIS` — sin duplicación

Ver "Non-Goals" arriba. `DIM_REGION` no tiene FK hacia `DIM_PAIS` ni viceversa en esta
propuesta; `FACT_ADQUISICION` referencia `region_id` directamente, no a través de país. Si un
reporte futuro necesitara cruzar región de negocio con país de licencia, sería una tabla de
mapeo nueva, explícitamente fuera de este alcance.

### Nombrado de componentes de frontend — evitar colisión con `distribucion`

**Decisión:** la página nueva de disponibilidad de infraestructura se llama
`DisponibilidadInfraPage` (no `DisponibilidadPage`, ya usado por `distribucion`), en
`frontend/src/packages/analitica/pages/`. La ruta sigue siendo `/analitica/disponibilidad` (el
prefijo de la URL ya distingue el contexto); solo el nombre del componente/archivo se diferencia
para que un `grep`/import futuro no ambigüe cuál "disponibilidad" se está tocando.

### Generación de identificadores

**Decisión:** `fact_id` de `FACT_ADQUISICION`/`FACT_DISPONIBILIDAD` se genera con
`random.getrandbits(50)` en Python antes del insert — mismo patrón ya establecido en `social` y
`experiencia`, sin introducir un tercer mecanismo de generación de IDs en el proyecto.

### Endpoints y guard

**Decisión:** `GET /app/v1/analitica/adquisicion` y `GET /app/v1/analitica/disponibilidad`,
mismo router (`api/paquetes/analitica/router.py`) y mismo guard (`require_b2b_panel_access`) que
el resto de endpoints tácticos de la capability — sin mecanismo de autorización nuevo. En el
frontend, ambas páginas cuelgan del mismo `AnalyticaShell`, ya envuelto en
`RequireSuscripcionActiva`, igual que `TendenciasPage`/`ComparacionPage`.

### Métrica mínima expuesta

- **Adquisición:** usuarios nuevos por canal, agrupados por semana (`load_week`, mismo campo de
  agrupación temporal que `TendenciasPage` ya usa) — tabla o gráfico de barras apiladas por
  canal.
- **Disponibilidad:** % de eventos sin incidente por componente, agrupado por semana — mismo
  patrón de small multiples ya usado en `TendenciasPage` (un panel por componente) si el número
  de componentes lo permite (4-6 esperados), evitando repetir el antipatrón de eje dual ya
  corregido en esa página.

## Risks / Trade-offs

- **[Riesgo] Los datos de ambas FACT nuevas son sintéticos por necesidad (no existe sistema real
  de marketing/infraestructura).** → Mitigación: mismo criterio ya vigente en el proyecto para
  `FACT_TRACKS` — reproducible (seed fijo), documentado como simulación académica únicamente en
  `tasks.md`, nunca mencionado como tal en `spec.md`/`design.md` de cara a negocio (regla ya
  establecida en `openspec/config.yaml`).
- **[Riesgo] Confusión de nombres entre `DisponibilidadPage` (`distribucion`) y la nueva vista de
  disponibilidad de infraestructura (`analitica`).** → Mitigación: nombrado explícito
  `DisponibilidadInfraPage` (ver Decisiones) + este documento como referencia si vuelve a surgir
  la duda.
- **[Riesgo] `DIM_REGION` podría interpretarse como redundante con `DIM_PAIS` a primera vista.**
  → Mitigación: distinción explícita en Non-Goals y Decisions; sin FK entre ambas para no
  sugerir una jerarquía que esta propuesta no implementa.

## Migration Plan

- Las 5 tablas nuevas son aditivas — sin `ALTER`/migración sobre tablas existentes, mismo perfil
  de bajo riesgo que `experiencia`.
- Orden de despliegue: DDL de ClickHouse primero, luego el mecanismo de generación de datos
  (según se resuelva la Open Question de abajo), luego los 2 endpoints de FastAPI, y por último
  las 2 páginas de frontend — mismo orden ya usado en las 6 capabilities anteriores.
- Sin plan de rollback especial: las tablas nuevas no tienen dependientes fuera de este cambio;
  revertir se reduce a dejar de generar/consultar datos y, si hace falta, `DROP TABLE`.

## Open Questions

Ninguna bloqueante para `tasks.md`. La estrategia de generación de datos quedó resuelta abajo.

### ✅ Resuelto — Estrategia de generación de datos para `FACT_ADQUISICION`/`FACT_DISPONIBILIDAD`

**Decisión (confirmada por el usuario):** DAG independiente, no integrado a `tracklytics_etl` —
mismo patrón que `playlists_sync` (dominio de negocio ajeno al catálogo musical, con su propio
ritmo y disparo). Nombre: `modelo_negocio_sync` (`etl/dags/modelo_negocio_sync_dag.py`,
`dag_id="modelo_negocio_sync"`), consistente con la convención ya usada (`playlists_sync`,
`engagement_referencia`: nombre de dominio + sufijo descriptivo de su función, sin el prefijo
genérico `tracklytics_`).

**Por qué no se integró a `tracklytics_etl`:** a diferencia de `task_portada` (que sí se
absorbió en el DAG principal porque opera sobre entidades que el propio DAG ya está cargando en
esa corrida — `DIM_ARTISTS`/`DIM_ALBUMS`), `FACT_ADQUISICION`/`FACT_DISPONIBILIDAD` no dependen
de ni se relacionan con la carga del catálogo (`FACT_TRACKS`/DIMs técnicas) — son un dominio de
negocio independiente, igual que las playlists. Acoplarlas a `tracklytics_etl` forzaría que
cualquier corrida del catálogo (o cualquier fallo en `task_bronze`/`task_silver`) bloqueara
también la actualización de estos datos de negocio, sin necesidad real.

**Mecanismo de generación:** mismo criterio ya vigente en el proyecto — seed reproducible
`seed = week_number * 42` (idéntico a `FACT_TRACKS` sintético) y guard de idempotencia vía
`ETL_BATCH_CONTROL` (mismo patrón que evita duplicar semanas ya cargadas en el resto del
pipeline), aplicado aquí a un `batch_id`/nombre de proceso propio de `modelo_negocio_sync` para
no compartir el control de idempotencia con la carga del catálogo.

**Backfill:** la primera corrida del DAG genera varias semanas históricas (no solo la semana
actual) para que `AdquisicionPage`/`DisponibilidadInfraPage` no arranquen vacías al desplegar;
corridas siguientes generan solo la semana nueva, mismo criterio de incremento que el resto del
pipeline semanal.
