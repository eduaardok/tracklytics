## 1. FastAPI: autenticación por llave de API

- [x] 1.1 Implementar dependencia de autenticación que extrae la llave de API exclusivamente del header de autenticación (nunca de query string) (RF-PAR-001, RNF-PAR-002) — `paquetes/partners/deps.py::require_partner`, header `X-API-Key`.
- [x] 1.2 Implementar resolución de partner/tier a partir de la llave de API contra el directorio de partners (dependencia de solo lectura de CU-T03), con caché TTL — `paquetes/partners/pb_client.py` + caché TTL de 30s en `deps.py`. Ver Implementation Notes en design.md sobre el placeholder de directorio (colección PocketBase `partners`) creado por ausencia de CU-T03.
- [x] 1.3 Rechazar solicitudes con llave de API inválida o expirada con error de autenticación genérico, sin exponer la causa ni datos del catálogo (RN-PAR-001, Escenario 2, CA-PAR-002) — 401 genérico, verificado con curl.
- [x] 1.4 Rechazar explícitamente cualquier intento de enviar la llave de API como parámetro de query string (RNF-PAR-002) — 400 explícito, verificado con curl incluso con header válido presente simultáneamente.

## 2. FastAPI: endpoints de solo lectura del catálogo para partners

- [x] 2.1 Implementar endpoints de solo lectura sobre tracks, artistas, álbumes y géneros bajo el namespace de la API de partners, leyendo FACT_TRACKS y dimensiones técnicas en ClickHouse (RF-PAR-002) — `paquetes/partners/router.py`, prefijo `/partners/v1`.
- [x] 2.2 Asegurar cliente ClickHouse en `threading.local` por request para los endpoints de partners — reutiliza `core.database.get_client()` (ya cacheado en threading.local), sin cliente propio.
- [x] 2.3 Medir y validar que cada llamada responde en menos de 2 segundos bajo condiciones normales de carga (RNF-PAR-001, CA-PAR-001) — verificado con curl (`time_total` ~1.3s en el peor caso, lista de tracks con joins).

## 3. FastAPI: segmentación por tier

- [x] 3.1 Declarar el tier mínimo requerido (básico/pro/enterprise) por endpoint de la API de partners — `Depends(require_partner("basico"|"enterprise"))` por endpoint en `router.py`.
- [x] 3.2 Implementar dependencia de autorización que compara el tier del partner contra el tier requerido por el endpoint antes de ejecutar la consulta (RF-PAR-003, RN-PAR-002) — `TIER_RANK` en `deps.py`, comparación antes de retornar de la dependencia (el handler nunca se ejecuta si el tier es insuficiente).
- [x] 3.3 Rechazar solicitudes de un partner con tier insuficiente, indicando que el endpoint requiere un tier superior (Escenario 3, CA-PAR-003) — 403 con mensaje explícito de tier requerido vs. tier actual, verificado con curl.
- [x] 3.4 Limitar los campos devueltos según el tier del partner en los endpoints que apliquen (RF-PAR-003) — `_fields_for_tier`/`_project` en `router.py`, aplicado a tracks (lista y detalle); básico ve campos esenciales, pro agrega perfil de audio básico, enterprise agrega perfil de audio completo.

## 4. FastAPI: registro de llamadas de API

- [x] 4.1 Implementar registro automático de cada llamada (exitosa o fallida) con identificador del partner, endpoint consumido, volumen de datos y tiempo de respuesta (RF-PAR-004) — middleware `paquetes/partners/logging_mw.py::partner_call_logger`, escribe en `LOG_LLAMADAS_PARTNER`.
- [x] 4.2 Asegurar que las llamadas rechazadas por autenticación o por tier también quedan registradas (RN-PAR-003, CA-PAR-004) — la dependencia `require_partner` setea `request.state.partner_log` antes de lanzar cualquier `HTTPException`; el middleware lee ese estado independientemente del código de respuesta. Verificado con curl + consulta directa a `LOG_LLAMADAS_PARTNER`.
- [x] 4.3 Verificar que el registro de llamadas queda disponible como fuente para la alimentación de FACT_INTEGRACION_PARTNER vía el pipeline ETL existente, sin que esta capability escriba directamente en ClickHouse [FACT_INTEGRACION_PARTNER] — `LOG_LLAMADAS_PARTNER` es una tabla ClickHouse nueva y distinta de `FACT_INTEGRACION_PARTNER` (que no se toca); la alimentación de esta última vía ETL queda fuera de alcance, tal como especifica design.md.

## 5. Verificación end-to-end

- [x] 5.1 Verificar CA-PAR-001: una llave de API válida responde con los datos correspondientes en menos de 2 segundos — OK (curl, ~1.3s).
- [x] 5.2 Verificar CA-PAR-002: una llave inválida rechaza la solicitud sin exponer datos — OK (401 genérico, sin header tampoco).
- [x] 5.3 Verificar CA-PAR-003: un partner con tier básico solicitando un endpoint enterprise recibe acceso denegado — OK (403 explícito en `/partners/v1/tracks/export`).
- [x] 5.4 Verificar CA-PAR-004: toda llamada de API (exitosa o fallida) queda registrada con partner, endpoint y resultado — OK (verificado contra `LOG_LLAMADAS_PARTNER`: success, auth_rejected y tier_rejected todos presentes).
