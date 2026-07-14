## ADDED Requirements

### Requirement: Panel administrativo de métricas de distribución
El sistema SHALL exponer a un usuario con rol `admin` un panel con métricas operativas agregadas de la capability `distribucion`: conteo de restricciones de reproducción activas por país, y total de licencias en estado activo.

#### Scenario: Admin consulta el panel de métricas de distribución
- **WHEN** un usuario con rol `admin` solicita el dashboard de distribución
- **THEN** el sistema retorna el conteo de restricciones agrupado por país y el total de licencias activas, calculados sobre `FACT_RESTRICCION_REPRODUCCION`/`DIM_LICENCIA`

#### Scenario: Usuario sin rol admin intenta consultar el panel de distribución
- **WHEN** un usuario sin rol `admin` intenta consultar el dashboard de distribución
- **THEN** el sistema rechaza la operación
