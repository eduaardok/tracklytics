## Context

`LOG_LLAMADAS_PARTNER` (ClickHouse, `init_clickhouse.py`) ya existe y ya recibe una fila por cada
llamada real a `/partners/v1/*` (exitosa o rechazada), escrita por
`api/paquetes/partners/logging_mw.py::partner_call_logger`. Columnas: `partner_id` (String, id de
PocketBase), `api_key_used`, `endpoint`, `tier_usado`, `resultado`
(`success`/`auth_rejected`/`tier_rejected`/`error`), `registros`, `duracion_ms`, `timestamp`.
Ningún endpoint ni query la lee hoy — la tabla existe únicamente como sumidero de escritura.

`api/paquetes/partners/router.py` hoy define un único `router = APIRouter(prefix="/partners/v1")`,
montado en `api/main.py` sin contraparte `/app/v1/...` — a diferencia de `analitica` y
`gestion_datos`, que sí tienen ese segundo router interno (`v1_router`, prefijo `/app/v1/...`,
autenticado por sesión) junto al router público. `partners/deps.py` solo define `require_partner`
(autenticación por `X-API-Key`, para el partner externo) — no hay guard de sesión (`admin`/staff)
en este paquete todavía.

El nombre del partner no vive en ClickHouse: `DIM_PARTNER` (modelo de negocio original) está
cubierta por la colección de PocketBase `partners` (ver
`openspec/changes/archive/2026-07-04-completar-modelo-base/design.md`), la misma que ya consulta
`api/paquetes/partners/pb_client.py::find_by_api_key`. Cualquier vista que muestre nombre de
partner (no solo su id interno) necesita resolverlo contra PocketBase, no contra ClickHouse.

## Goals / Non-Goals

**Goals:**
- Exponer, para staff interno (`role=admin`), una agregación de `LOG_LLAMADAS_PARTNER` por
  partner: total de llamadas, tasa de éxito/error, latencia promedio y desglose por tier usado.
- Reutilizar el patrón ya establecido de router interno + router externo dentro de un mismo
  paquete (`analitica`, `gestion_datos`), en vez de mezclar el endpoint nuevo con
  `router` (`/partners/v1`, autenticado por API key de partner).
- Dar nombre visible al partner en la vista (vía PocketBase), no solo su id interno.

**Non-Goals:**
- No se modifica `LOG_LLAMADAS_PARTNER` ni `partner_call_logger` — la escritura ya cumple el
  requisito existente de la spec ("Registro de cada llamada de API"), este cambio es puramente de
  lectura.
- No se implementa alta/edición de partners (`DIM_PARTNER`/colección `partners`) — sigue fuera de
  alcance de esta capability (ya documentado en `spec.md`, sección "Fuera de alcance").
- No se agrega series de tiempo (tendencia de uso por semana/día) — la primera versión es un
  snapshot agregado acumulado, no un histórico temporal. Si se necesita más adelante, es una
  extensión separada (requiere decidir granularidad temporal, fuera de este alcance).

## Decisions

### Segundo router en `partners`, no un endpoint nuevo en el router existente

**Decisión:** se agrega `v1_router = APIRouter(prefix="/app/v1/partners", tags=["Partners v1"])` en
`api/paquetes/partners/router.py`, montado en `api/main.py` junto al `router` ya existente (mismo
patrón que `analitica_router`/`analitica_v1_router` y `gestion_router`/`gestion_v1_router`). El
endpoint nuevo vive en `v1_router`, autenticado por sesión (`get_current_user` + guard nuevo, ver
abajo) — nunca por `X-API-Key`.

**Por qué no reutilizar `router` (`/partners/v1`):** ese prefijo y sus endpoints están diseñados
para ser consumidos por el partner externo con su propia API key (RF-PAR-001 a RF-PAR-004 de la
spec ya vigente); mezclar ahí un endpoint de solo staff interno rompería la separación ya
establecida entre "superficie pública del partner" y "vista interna de administración" que el
resto del proyecto mantiene (compárese con `gestion_datos`: `/etl/*` es interno, nunca expuesto al
catálogo público de `catalogo`/`partners`).

### Guard nuevo: `require_partner_admin`, no reutilizar `require_partner`

**Decisión:** se agrega `require_partner_admin` en `api/paquetes/partners/deps.py`, mismo patrón
thin que `seguridad/deps.py::require_admin` y `analitica/deps.py::require_staff` (`role ==
"admin"` sobre `get_current_user`) — cada capability define su propio dependency en vez de
importar el de otra.

**Por qué el nombre `require_partner_admin` y no `require_admin`:** el paquete `partners` ya tiene
`require_partner` (autenticación del partner externo por API key). Nombrar el guard nuevo
`require_admin` a secas, en un paquete donde `require_partner` ya existe con una semántica
completamente distinta (partner externo vs. staff interno), invita a confundir cuál dependencia
usar en un endpoint nuevo. `require_partner_admin` dice explícitamente "admin viendo datos de
partners", sin ambigüedad con el guard de autenticación externa.

### Agregación en SQL, enriquecido con nombre de partner desde PocketBase

**Decisión:** la query nueva (`METRICAS_POR_PARTNER` en `api/paquetes/partners/queries.py`) agrega
en ClickHouse por `partner_id`: `count()` (total), `countIf(resultado = 'success')` /
`countIf(resultado != 'success')` (éxito/error), `avg(duracion_ms)` (latencia promedio), y
`groupArray` o una segunda query por `(partner_id, tier_usado)` para el desglose por tier. El
endpoint (`GET /app/v1/partners/metricas`) toma el resultado de esa agregación y, para el conjunto
(normalmente pequeño) de `partner_id` distintos devueltos, resuelve el nombre contra PocketBase
reusando el patrón ya establecido en `pb_client.py` (nueva función `list_by_ids` o `list_all`,
mismo cliente `httpx` + token de superusuor cacheado ya existente) — no se guarda el nombre en
ClickHouse ni se desnormaliza.

**Alternativa descartada:** cachear el nombre del partner en `LOG_LLAMADAS_PARTNER` en el momento
de la escritura (columna `partner_nombre` desnormalizada). Se descarta porque requeriría tocar
`logging_mw.py` (ya en producción, escribiendo datos reales) para un dato que cambia con muy poca
frecuencia y que es barato de resolver en el momento de la lectura, dado el volumen bajo de
partners esperado (decenas, no miles).

### Ubicación y ruta del frontend

**Decisión:** página nueva `PartnersMetricasPage.tsx` en
`frontend/src/packages/partners/pages/`, ruta `/seguridad/partners/metricas`, montada bajo
`SeguridadShell` (mismo guard `roles={['admin']}` que ya envuelve todo ese árbol en `router.tsx`).
Se agrega un segundo link en el nav de `SeguridadShell.tsx` junto al ya existente de "Partners"
(consola), mismo patrón flat de un link por vista que ya usa ese shell (sin pestañas anidadas
nuevas). Sistema de diseño: mismos tokens `oklch` y tipografías (Space Grotesk para encabezados,
JetBrains Mono para valores numéricos/tabulares) ya usados en el resto de `seguridad`/`partners`,
sin introducir una paleta nueva (reutilizar semántica ya validada: verde para éxito, rojo/ámbar
para error, igual que el resto del panel admin).

## Risks / Trade-offs

- **[Riesgo] Volumen de partners crece y la resolución de nombre contra PocketBase por request se
  vuelve costosa.** → Mitigación: el mismo patrón de caché TTL en memoria ya usado por
  `_resolve`/`_partner_cache` en `deps.py` (30s) se puede extender a la resolución de nombres; no
  es necesario en la primera versión dado el volumen bajo esperado (decenas de partners).
- **[Riesgo] `duracion_ms` incluye llamadas rechazadas por auth/tier (muy rápidas, no representan
  latencia real de servir datos), sesgando el promedio hacia abajo.** → Mitigación: la métrica de
  latencia promedio se calcula solo sobre `resultado = 'success'`, documentado explícitamente en
  el nombre de la columna de respuesta (`latencia_promedio_ms_exitosas`) para que no se confunda
  con latencia general.
- **[Riesgo] Un partner sin llamadas registradas no debe romper la vista.** → Mitigación: el
  endpoint solo devuelve partners con al menos una fila en `LOG_LLAMADAS_PARTNER`; el frontend
  muestra un estado vacío explícito si la tabla no tiene datos aún (no debería ocurrir en
  producción, donde ya hay tráfico real, pero sí en un entorno recién desplegado).

## Migration Plan

- Sin migración de datos: `LOG_LLAMADAS_PARTNER` ya existe y ya tiene datos reales. Este cambio es
  aditivo puro (nuevo router, nuevo guard, nueva query, nueva página) — sin `ALTER` de ninguna
  tabla ni cambio de comportamiento en `logging_mw.py`.
- Orden de implementación: guard (`deps.py`) → query (`queries.py`) → endpoint (`v1_router` en
  `router.py`) → registro en `api/main.py` → frontend (`types.ts`/`api`/página/ruta/nav) — mismo
  orden ya usado en las 7 propuestas anteriores.
- Sin plan de rollback especial: revertir se reduce a quitar el router/endpoint/página nuevos; no
  hay dato persistido por este cambio que necesite limpieza.
