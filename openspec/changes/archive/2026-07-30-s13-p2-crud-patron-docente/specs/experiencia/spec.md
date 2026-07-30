## ADDED Requirements

### Requirement: Vista de detalle de un ticket de soporte

El sistema SHALL permitir a un usuario con rol admin consultar el detalle completo de un
ticket de soporte individual (asunto, descripción, autor, estado y fechas), separado del
listado general de tickets.

#### Scenario: Admin consulta el detalle de un ticket
- **WHEN** un usuario con rol admin solicita el detalle de un ticket de soporte existente
  por su identificador
- **THEN** el sistema devuelve el asunto, la descripción, el autor, el estado y las fechas
  del ticket

#### Scenario: Detalle de un ticket inexistente
- **WHEN** un usuario con rol admin solicita el detalle de un ticket que no existe
- **THEN** el sistema rechaza la operación con un error de ticket no encontrado
