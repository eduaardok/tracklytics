## Context

`partners` expone una API de solo lectura sobre el catálogo musical (FACT_TRACKS y dimensiones técnicas en ClickHouse) para consumo programático de empresas externas (Partners/Integradores). A diferencia de `catalogo` y `analitica`, el consumidor no es un usuario humano autenticado vía PocketBase con sesión de navegador, sino un sistema externo autenticado vía API key con header HTTP.

El alta y gestión de partners (creación de llaves de API, asignación de tier) es responsabilidad de la capability táctica de administración de partners (CU-T03), fuera de alcance de esta capability. `partners` consume esa información como una dependencia de solo lectura: necesita poder resolver, a partir de una llave de API, qué partner es, si está vigente y qué tier tiene — sin implementar la creación o edición de esos datos.

## Goals / Non-Goals

**Goals:**
- Autenticar cada solicitud mediante llave de API transmitida por header.
- Exponer endpoints de solo lectura del catálogo musical para partners.
- Limitar campos/volumen de datos y endpoints accesibles según el tier del partner.
- Registrar cada llamada (exitosa o fallida) con partner, endpoint, volumen y tiempo de respuesta.
- Responder en menos de 2 segundos bajo condiciones normales de carga.

**Non-Goals:**
- Crear, editar o revocar partners y sus llaves de API (CU-T03, nivel táctico).
- Publicar documentación interactiva (Swagger/Redoc) de la API.
- Implementar webhooks o notificaciones push hacia el partner.

## Decisions

### El directorio de partners y llaves de API es una dependencia externa de solo lectura

Esta capability no posee ni crea el directorio de partners, llaves de API o tiers asignados; lo lee desde donde la capability táctica CU-T03 lo administre (referenciado aquí como `DIM_PARTNER`, ya identificado en el modelo de datos de negocio). `partners` solo necesita, dado el valor de una llave de API recibida en el header, poder resolver el partner correspondiente, su estado (vigente/expirada) y su tier — sin implementar el flujo de alta. Alternativa descartada: que esta capability gestione su propia tabla de llaves de API — se rechaza explícitamente porque el alta y gestión de partners está fuera de alcance (sección 13 de la spec).

### Validación de llave de API con caché TTL

La resolución de partner/tier a partir de la llave de API se realiza con la caché TTL ya establecida como parte del stack de FastAPI (igual que el resto de la API), para evitar una consulta repetida al directorio de partners en cada llamada y así sostener el límite de 2 segundos por solicitud (RNF-PAR-001). Si la llave no se encuentra vigente en el directorio (inválida o expirada), el sistema responde con un error de autenticación genérico, sin distinguir en la respuesta si la llave no existe, expiró o pertenece a un partner inactivo (RN-PAR-001).

### Transmisión de la llave de API solo por header

La API solo acepta la llave de API en un header de autenticación (p. ej. `Authorization` o `X-API-Key`); cualquier solicitud que intente enviarla como parámetro de query string es rechazada, para evitar que quede expuesta en logs de acceso (RNF-PAR-002).

### Control de tier a nivel de endpoint

Cada endpoint de la API de partners declara el tier mínimo requerido (básico/pro/enterprise). La dependencia de autorización de FastAPI compara el tier del partner (resuelto en la validación de la llave de API) contra el tier requerido por el endpoint antes de ejecutar la lógica de negocio; si el tier es insuficiente, la solicitud se rechaza indicando que el endpoint requiere un tier superior (RN-PAR-002, Escenario 3). Alternativa descartada: filtrar campos de la respuesta después de ejecutar la consulta completa — se rechaza porque expone el endpoint enterprise (p. ej. exportación masiva) a partners de tier básico antes de aplicar el filtro, con riesgo de fuga parcial de datos.

### Registro de llamadas como log operativo, alimentando FACT_INTEGRACION_PARTNER por el pipeline existente

Cada llamada (exitosa o fallida) se registra de inmediato como un log operativo (partner, endpoint, volumen de datos, tiempo de respuesta, resultado), siguiendo el mismo patrón ya usado en el proyecto para registros operativos de alta frecuencia (p. ej. el historial de reproducción en `catalogo`). Este log es la fuente desde la cual el pipeline ETL existente (Python → Parquet → ClickHouse) alimenta `FACT_INTEGRACION_PARTNER` en ClickHouse para la auditoría y el control de consumo a nivel táctico (RN-PAR-003, CU-T03). Esta capability no escribe directamente en `FACT_INTEGRACION_PARTNER`; solo genera el registro operativo de cada llamada.

## Risks / Trade-offs

- [Riesgo] La caché TTL de validación de llave de API puede servir una llave recién revocada hasta que expire la entrada en caché → Mitigación: se documenta como comportamiento esperado del trade-off rendimiento/latencia; el TTL se mantiene corto en relación con el límite de 2 segundos de RNF-PAR-001.
- [Riesgo] Un endpoint mal anotado con un tier incorrecto expondría datos reservados a un tier inferior → Mitigación: el tier requerido se declara explícitamente por endpoint y se valida centralizadamente en la dependencia de autorización, no de forma dispersa en cada handler.
- [Riesgo] Volumen alto de llamadas de partners podría saturar el log operativo de llamadas → Mitigación: el log es un registro de escritura simple (append) por llamada, consistente con el patrón ya usado para historial de reproducción a alta frecuencia.

## Migration Plan

No aplica migración de datos: esta capability agrega endpoints nuevos en FastAPI y un log operativo nuevo de llamadas de API; no modifica el modelo de datos técnico en ClickHouse ni crea el directorio de partners (responsabilidad de CU-T03, externa a esta capability). Despliegue vía `docker compose up` sin pasos manuales adicionales.

## Open Questions

- El mecanismo exacto (PocketBase, ClickHouse u otro) mediante el cual la capability táctica CU-T03 expone el directorio de partners/llaves de API/tiers queda fuera del alcance de esta capability y debe resolverse cuando se diseñe CU-T03; aquí se asume únicamente que existe una fuente de solo lectura consultable por llave de API.
