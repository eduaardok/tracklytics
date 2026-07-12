## ADDED Requirements

### Requirement: Consulta y cierre remoto de sesiones activas propias
El sistema SHALL permitir a cualquier usuario autenticado consultar la lista de sus propias sesiones actualmente abiertas (`FACT_SESION` sin `fecha_fin`), y cerrar remotamente cualquiera de ellas por `sesion_id`. El sistema SHALL rechazar el cierre de una sesión que no pertenezca al usuario autenticado.

#### Scenario: Usuario consulta sus sesiones abiertas en múltiples dispositivos
- **WHEN** un usuario autenticado que inició sesión desde más de un dispositivo consulta sus sesiones activas
- **THEN** el sistema retorna una sesión por cada inicio de sesión sin cerrar, identificando el dispositivo de cada una

#### Scenario: Usuario cierra remotamente una de sus sesiones
- **WHEN** un usuario autenticado solicita cerrar una sesión propia distinta a la actual
- **THEN** el sistema registra en `FACT_SESION` la fecha de fin y la duración de esa sesión, y esa sesión deja de aparecer en la lista de sesiones abiertas

#### Scenario: Usuario intenta cerrar una sesión de otro usuario
- **WHEN** un usuario autenticado intenta cerrar una sesión cuyo `usuario_id` no coincide con el suyo
- **THEN** el sistema rechaza la operación sin modificar la sesión ajena

### Requirement: Panel administrativo de métricas operativas de seguridad
El sistema SHALL exponer a un usuario con rol `admin` un panel con métricas operativas agregadas de la capability `seguridad`: acciones auditadas por día, errores de sistema de las últimas 24 horas, y total de sesiones actualmente abiertas en la plataforma.

#### Scenario: Admin consulta el panel de métricas de seguridad
- **WHEN** un usuario con rol `admin` solicita el dashboard de seguridad
- **THEN** el sistema retorna la serie diaria de acciones auditadas, el conteo de errores de las últimas 24 horas y el total de sesiones abiertas, calculados sobre datos reales de `FACT_AUDIT_LOG`/`FACT_ERROR_SISTEMA`/`FACT_SESION`

#### Scenario: Usuario sin rol admin intenta consultar el panel de seguridad
- **WHEN** un usuario sin rol `admin` intenta consultar el dashboard de seguridad
- **THEN** el sistema rechaza la operación
