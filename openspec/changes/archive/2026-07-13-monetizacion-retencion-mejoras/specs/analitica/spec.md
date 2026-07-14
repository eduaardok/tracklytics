## ADDED Requirements

### Requirement: Tasa de churn mensual
El sistema SHALL permitir a un usuario con rol `admin` consultar la tasa de churn mensual de
suscripciones para un rango de fechas, calculada como cancelaciones del mes sobre suscripciones
activas al inicio del mes, agrupable opcionalmente por motivo de cancelación.

#### Scenario: Consultar la tasa de churn de un rango de meses
- **WHEN** un usuario con rol `admin` solicita la tasa de churn mensual para un rango de fechas
- **THEN** el sistema retorna, por mes, el número de cancelaciones, las suscripciones activas al inicio del mes y la tasa de churn resultante

#### Scenario: Consultar la tasa de churn agrupada por motivo
- **WHEN** un usuario con rol `admin` solicita la tasa de churn mensual indicando que desea el desglose por motivo de cancelación
- **THEN** el sistema retorna, por mes y por motivo, el número de cancelaciones correspondiente

#### Scenario: Mes sin suscripciones activas al inicio
- **WHEN** un mes del rango solicitado no tiene ninguna suscripción activa registrada al inicio de ese mes
- **THEN** el sistema retorna la tasa de churn de ese mes como no disponible, en vez de un valor calculado por división entre cero

### Requirement: Funnel de conversión free → premium
El sistema SHALL permitir a un usuario con rol `admin` consultar, para un rango de fechas, el
funnel de conversión de usuarios free: cuántos usuarios free estuvieron activos, cuántos de ellos
vieron al menos un anuncio (de tipo audio o display), y cuántos se suscribieron a un plan de pago
(premium o estudiante) dentro de ese mismo rango.

#### Scenario: Consultar el funnel de conversión de un rango de fechas
- **WHEN** un usuario con rol `admin` solicita el funnel de conversión para un rango de fechas
- **THEN** el sistema retorna el número de usuarios free activos, el número de esos usuarios que vieron al menos un anuncio, y el número de esos usuarios que se suscribieron a un plan de pago dentro del rango

#### Scenario: Rango sin ninguna conversión
- **WHEN** un usuario con rol `admin` solicita el funnel de conversión de un rango de fechas en el que ningún usuario free se suscribió a un plan de pago
- **THEN** el sistema retorna el funnel con el conteo de conversión en cero, sin error

### Requirement: P&L consolidado
El sistema SHALL permitir a un usuario con rol `admin` consultar, para un rango de fechas, el
margen neto consolidado del negocio: ingreso por suscripciones más ingreso publicitario, menos
regalías pagadas a rightsholders en ese mismo rango.

#### Scenario: Consultar el P&L consolidado de un rango de fechas
- **WHEN** un usuario con rol `admin` solicita el P&L consolidado para un rango de fechas
- **THEN** el sistema retorna el ingreso por suscripciones, el ingreso publicitario, las regalías pagadas y el margen neto resultante para ese rango

#### Scenario: Rango sin actividad de ingreso ni de regalías
- **WHEN** un usuario con rol `admin` solicita el P&L consolidado de un rango de fechas sin transacciones de suscripción, ingreso publicitario ni liquidaciones de regalías
- **THEN** el sistema retorna todos los componentes en cero y un margen neto de cero, sin error
