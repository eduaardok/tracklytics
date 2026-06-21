## 1. FastAPI: autenticación por llave de API

- [ ] 1.1 Implementar dependencia de autenticación que extrae la llave de API exclusivamente del header de autenticación (nunca de query string) (RF-PAR-001, RNF-PAR-002)
- [ ] 1.2 Implementar resolución de partner/tier a partir de la llave de API contra el directorio de partners (dependencia de solo lectura de CU-T03), con caché TTL
- [ ] 1.3 Rechazar solicitudes con llave de API inválida o expirada con error de autenticación genérico, sin exponer la causa ni datos del catálogo (RN-PAR-001, Escenario 2, CA-PAR-002)
- [ ] 1.4 Rechazar explícitamente cualquier intento de enviar la llave de API como parámetro de query string (RNF-PAR-002)

## 2. FastAPI: endpoints de solo lectura del catálogo para partners

- [ ] 2.1 Implementar endpoints de solo lectura sobre tracks, artistas, álbumes y géneros bajo el namespace de la API de partners, leyendo FACT_TRACKS y dimensiones técnicas en ClickHouse (RF-PAR-002)
- [ ] 2.2 Asegurar cliente ClickHouse en `threading.local` por request para los endpoints de partners
- [ ] 2.3 Medir y validar que cada llamada responde en menos de 2 segundos bajo condiciones normales de carga (RNF-PAR-001, CA-PAR-001)

## 3. FastAPI: segmentación por tier

- [ ] 3.1 Declarar el tier mínimo requerido (básico/pro/enterprise) por endpoint de la API de partners
- [ ] 3.2 Implementar dependencia de autorización que compara el tier del partner contra el tier requerido por el endpoint antes de ejecutar la consulta (RF-PAR-003, RN-PAR-002)
- [ ] 3.3 Rechazar solicitudes de un partner con tier insuficiente, indicando que el endpoint requiere un tier superior (Escenario 3, CA-PAR-003)
- [ ] 3.4 Limitar los campos devueltos según el tier del partner en los endpoints que apliquen (RF-PAR-003)

## 4. FastAPI: registro de llamadas de API

- [ ] 4.1 Implementar registro automático de cada llamada (exitosa o fallida) con identificador del partner, endpoint consumido, volumen de datos y tiempo de respuesta (RF-PAR-004)
- [ ] 4.2 Asegurar que las llamadas rechazadas por autenticación o por tier también quedan registradas (RN-PAR-003, CA-PAR-004)
- [ ] 4.3 Verificar que el registro de llamadas queda disponible como fuente para la alimentación de FACT_INTEGRACION_PARTNER vía el pipeline ETL existente, sin que esta capability escriba directamente en ClickHouse

## 5. Verificación end-to-end

- [ ] 5.1 Verificar CA-PAR-001: una llave de API válida responde con los datos correspondientes en menos de 2 segundos
- [ ] 5.2 Verificar CA-PAR-002: una llave inválida rechaza la solicitud sin exponer datos
- [ ] 5.3 Verificar CA-PAR-003: un partner con tier básico solicitando un endpoint enterprise recibe acceso denegado
- [ ] 5.4 Verificar CA-PAR-004: toda llamada de API (exitosa o fallida) queda registrada con partner, endpoint y resultado
