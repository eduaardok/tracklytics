## ADDED Requirements

### Requirement: Revocación de una licencia activa
El sistema SHALL permitir a un usuario con rol `admin_contenido` revocar una licencia de distribución ya activa, marcándola con estado `revocada`, registrando el motivo y la fecha de revocación. Una licencia revocada SHALL dejar de contar como activa para efectos de disponibilidad. La acción SHALL auditarse.

#### Scenario: Revocar una licencia activa
- **WHEN** un `admin_contenido` revoca una licencia activa indicando un motivo
- **THEN** el sistema marca la licencia como `revocada` con su motivo y fecha, deja de considerarla activa, y registra la acción en la auditoría

#### Scenario: Revocar una licencia ya revocada es rechazado
- **WHEN** un `admin_contenido` intenta revocar una licencia que ya está revocada
- **THEN** el sistema rechaza la operación con 409
