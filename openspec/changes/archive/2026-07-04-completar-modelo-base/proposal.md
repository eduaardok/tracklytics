## Why

El modelo de datos de negocio documentado desde el diseño técnico original (sección "Modelo de
datos de negocio" de la constitución del proyecto) definía 13 tablas (6 FACT + 7 DIM)
independientes del modelo técnico de catálogo. Una auditoría reciente contra `system.tables`
confirmó que 8 de esas 13 ya están cubiertas — bajo otro nombre, en ClickHouse, o como
colección de PocketBase — por las seis capabilities OpenSpec cerradas (`seguridad`,
`facturacion`, `creadores`, `social`, `distribucion`, `experiencia`) y por el núcleo original.
Las 5 restantes nunca se implementaron y hoy son un gap real y visible: dos vistas de
`analitica` (`/analitica/adquisicion`, `/analitica/disponibilidad`) existen en el frontend como
placeholder ("Coming Soon") desde que se migró esa capability, sin backend ni tablas detrás.
Este cambio cierra ese gap preexistente de la sección de modelo de negocio; no es una séptima
capability operativa nueva, es completar una que ya estaba planeada desde antes del refactor de
las 6 capabilities.

## What Changes

- Se agregan 3 dimensiones de negocio nuevas en ClickHouse: `DIM_CANAL_MARKETING` (canal de
  adquisición de usuario), `DIM_REGION` (agrupación geográfica de negocio, distinta de
  `DIM_PAIS` de `distribucion`) y `DIM_COMPONENTE_INFRAESTRUCTURA` (componente del sistema para
  monitoreo de disponibilidad).
- Se agrega `FACT_ADQUISICION`: evento de adquisición de usuario nuevo, con canal, región y
  fecha. Alimenta la vista `/analitica/adquisicion`, hoy un placeholder sin datos.
- Se agrega `FACT_DISPONIBILIDAD`: evento de disponibilidad/incidente por componente de
  infraestructura, con fecha. Alimenta la vista `/analitica/disponibilidad`, hoy un placeholder
  sin datos. No debe confundirse con la restricción geográfica de reproducción de `distribucion`
  (`FACT_RESTRICCION_REPRODUCCION`), que es un concepto de negocio distinto (licencias de
  contenido, no infraestructura).
- Se reemplazan las 2 páginas `ComingSoonPage` de `analitica` (Adquisición, Disponibilidad) por
  vistas reales mínimas, bajo el mismo guard (`RequireSuscripcionActiva`) que el resto de la
  capability.
- Dado que no existe una fuente real de eventos de marketing/infraestructura, los datos de
  ambas tablas se generan de forma sintética (reproducible, mismo criterio ya establecido para
  `FACT_TRACKS` sintético) — el mecanismo de generación no se menciona en `spec.md`/`design.md`
  de cara a negocio, solo en `tasks.md` (regla ya vigente en el proyecto).

## Capabilities

### New Capabilities
Ninguna.

### Modified Capabilities
- `analitica`: se agregan 2 `### Requirement:` nuevos ("Adquisición de usuarios por canal" y
  "Disponibilidad de infraestructura por componente"), reemplazando el estado "Fuera de alcance
  / Coming Soon" que la spec actual no documenta como requirement formal (son rutas placeholder
  en el frontend, no un requisito existente que cambie de comportamiento).

## Impact

- **ClickHouse**: 3 tablas DIM nuevas (`DIM_CANAL_MARKETING`, `DIM_REGION`,
  `DIM_COMPONENTE_INFRAESTRUCTURA`) y 2 tablas FACT nuevas (`FACT_ADQUISICION`,
  `FACT_DISPONIBILIDAD`), todas aditivas — sin `ALTER`/migración sobre tablas existentes.
- **FastAPI**: nuevos endpoints en `api/paquetes/analitica/` (queries + router), reusando
  `require_b2b_panel_access`/`RequireSuscripcionActiva` ya existentes — sin mecanismo de
  autorización nuevo.
- **ETL (Python, Airflow)**: generación reproducible de los datos de ambas FACT nuevas — a
  definir en `design.md` si es un seed inicial + incremento semanal en el DAG existente o una
  tarea separada (Open Question).
- **Frontend (React)**: `frontend/src/packages/analitica/` — 2 páginas nuevas
  (`AdquisicionPage`, `DisponibilidadInfraPage` o nombre equivalente que no colisione con la
  `DisponibilidadPage` ya existente de `distribucion`) reemplazando las 2 rutas `ComingSoonPage`
  correspondientes en `router.tsx`, con un gráfico/tabla simple (Recharts, mismo patrón que
  `TendenciasPage`).
