## Why

La capability `partners` ya registra cada llamada real a `/partners/v1/*` en `LOG_LLAMADAS_PARTNER`
(ClickHouse), incluyendo identificador de partner, endpoint, tier usado, resultado y tiempo de
respuesta — un requisito que la spec actual ya cubre ("Registro de cada llamada de API"). Ese
registro nunca se lee: no existe endpoint ni vista que lo agregue. El equipo interno (Lead Data
Engineer / CTO) no tiene forma de responder, sin ir a `clickhouse-client` a mano, preguntas
operativas básicas sobre el programa de partners: cuántas llamadas hace cada partner, qué tan
confiable es su consumo (tasa de éxito/error) y qué tan rápido responde la API en la práctica
(latencia). Este cambio completa esa capability con la vista de consulta que el registro ya
soporta, sin tocar el modelo de datos (la tabla ya existe y ya recibe tráfico real de producción).

## What Changes

- Se agrega un endpoint de solo lectura en `api/paquetes/partners/router.py` que agrega
  `LOG_LLAMADAS_PARTNER` por partner: total de llamadas, tasa de éxito/error, latencia promedio y
  desglose por tier usado.
- Se agrega un guard propio de staff interno en `api/paquetes/partners/deps.py` (mismo patrón thin
  ya usado por `require_admin`/`require_staff` en otras capabilities) — el guard existente
  (`require_partner`, por API key) es para el partner externo, no aplica aquí.
- Se agrega una página nueva dentro de `frontend/src/packages/partners/` que consume ese endpoint,
  visible solo para `role=admin`, dentro del árbol de administración ya existente.
- No se agregan tablas, ETL ni DAGs nuevos: `LOG_LLAMADAS_PARTNER` ya existe, ya se escribe en cada
  llamada real, y ya está poblada con tráfico de producción.

## Capabilities

### New Capabilities
Ninguna.

### Modified Capabilities
- `partners`: se agrega un requisito nuevo ("Consulta agregada de métricas de uso por partner")
  junto al ya existente de registro de llamadas — el registro se puede consultar agregado por
  partner, no solo escribirse.

## Impact

- **ClickHouse**: ninguno — se consulta `LOG_LLAMADAS_PARTNER`, ya existente y ya poblada, sin
  `ALTER` ni tabla nueva.
- **FastAPI**: nuevo endpoint de solo lectura y nueva dependencia de autorización en
  `api/paquetes/partners/`, reusando `get_current_user` ya existente — sin mecanismo de
  autenticación nuevo.
- **Frontend (React)**: `frontend/src/packages/partners/` — una página nueva, montada en el árbol
  de administración ya existente (mismo shell/guard que la consola de partners actual).
