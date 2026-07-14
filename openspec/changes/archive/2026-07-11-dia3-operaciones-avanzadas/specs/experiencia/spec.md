## ADDED Requirements

### Requirement: Panel administrativo de métricas de experiencia
El sistema SHALL exponer a un usuario con rol `admin` un panel con métricas operativas agregadas de la capability `experiencia`: conteo de tickets de soporte por estado, y total de tickets actualmente abiertos o en proceso.

#### Scenario: Admin consulta el panel de métricas de experiencia
- **WHEN** un usuario con rol `admin` solicita el dashboard de experiencia
- **THEN** el sistema retorna el conteo de tickets agrupado por estado y el total de tickets abiertos o en proceso, calculados sobre `FACT_TICKET_SOPORTE`

#### Scenario: Usuario sin rol admin intenta consultar el panel de experiencia
- **WHEN** un usuario sin rol `admin` intenta consultar el dashboard de experiencia
- **THEN** el sistema rechaza la operación
