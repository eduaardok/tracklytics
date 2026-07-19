## ADDED Requirements

### Requirement: Visibilidad administrativa de suscripciones individuales
El sistema SHALL permitir a un usuario con rol `admin_comercial` listar de forma paginada todas las suscripciones con filtros por estado (activa/cancelada/suspendida), plan y rango de fechas, y consultar el detalle de una suscripción (usuario, plan, historial de cobros, fechas de inicio/fin).

#### Scenario: Listar suscripciones con filtros
- **WHEN** un `admin_comercial` lista suscripciones filtrando por estado y plan
- **THEN** el sistema devuelve la página solicitada de suscripciones que cumplen los filtros

#### Scenario: Consultar el detalle de una suscripción
- **WHEN** un `admin_comercial` consulta una suscripción por su identificador
- **THEN** el sistema devuelve el usuario, plan, historial de cobros y fechas de la suscripción

### Requirement: Acciones administrativas sobre una suscripción
El sistema SHALL permitir a un `admin_comercial` cancelar administrativamente una suscripción indicando un motivo (registrando la cancelación en `FACT_CANCELACION_SUSCRIPCION`) y extender su fecha de vencimiento N días como cortesía. Ambas acciones SHALL auditarse.

#### Scenario: Cancelar administrativamente una suscripción
- **WHEN** un `admin_comercial` cancela una suscripción con un motivo
- **THEN** el sistema cancela la suscripción, registra la cancelación con su motivo y audita la acción

#### Scenario: Extender una suscripción por cortesía
- **WHEN** un `admin_comercial` extiende una suscripción N días
- **THEN** el sistema desplaza la fecha de vencimiento N días y audita la acción
