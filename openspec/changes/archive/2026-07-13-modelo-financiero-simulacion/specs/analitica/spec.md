## ADDED Requirements

### Requirement: MRR y ARR
El sistema SHALL permitir a un usuario con rol `admin` consultar el ingreso mensual recurrente
actual (MRR, suma del monto de todas las suscripciones de pago activas) y su proyección anual
(ARR, MRR × 12), junto con una tendencia histórica de ingreso cobrado por mes. La tendencia
histórica SHALL indicar explícitamente que aproxima el ingreso recurrente por mes cobrado, no una
reconstrucción de MRR punto-en-el-tiempo.

#### Scenario: Consultar MRR y ARR actuales
- **WHEN** un usuario con rol `admin` solicita el MRR/ARR actual
- **THEN** el sistema retorna el MRR (suma de montos de suscripciones de pago activas), el ARR (MRR × 12), y la tendencia histórica de ingreso cobrado por mes

#### Scenario: Sin ninguna suscripción de pago activa
- **WHEN** un usuario con rol `admin` solicita el MRR/ARR y no hay ninguna suscripción de pago activa
- **THEN** el sistema retorna MRR y ARR en cero, sin error
