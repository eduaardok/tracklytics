## ADDED Requirements

### Requirement: Panel administrativo de métricas de facturación
El sistema SHALL exponer a un usuario con rol `admin` un panel con métricas operativas agregadas de la capability `facturacion`: ingreso diario de transacciones exitosas, conteo de transacciones de las últimas 24 horas, e ingreso histórico total.

#### Scenario: Admin consulta el panel de métricas de facturación
- **WHEN** un usuario con rol `admin` solicita el dashboard de facturación
- **THEN** el sistema retorna la serie diaria de ingreso de transacciones exitosas, el conteo de transacciones de las últimas 24 horas y el ingreso histórico total, calculados sobre `FACT_TRANSACCION_PAGO`

#### Scenario: Usuario sin rol admin intenta consultar el panel de facturación
- **WHEN** un usuario sin rol `admin` intenta consultar el dashboard de facturación
- **THEN** el sistema rechaza la operación
