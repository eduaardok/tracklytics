## ADDED Requirements

### Requirement: Panel administrativo de métricas de creadores
El sistema SHALL exponer a un usuario con rol `admin` un panel con métricas operativas agregadas de la capability `creadores`: conteo de subidas de track por estado de revisión, y total de cuentas de artista existentes.

#### Scenario: Admin consulta el panel de métricas de creadores
- **WHEN** un usuario con rol `admin` solicita el dashboard de creadores
- **THEN** el sistema retorna el conteo de subidas agrupado por estado de revisión y el total de cuentas de artista, calculados sobre `FACT_SUBIDA_TRACK`/`DIM_CUENTA_ARTISTA`

#### Scenario: Usuario sin rol admin intenta consultar el panel de creadores
- **WHEN** un usuario sin rol `admin` intenta consultar el dashboard de creadores
- **THEN** el sistema rechaza la operación
