## ADDED Requirements

### Requirement: Vista de detalle de una campaña publicitaria

El sistema SHALL permitir a un usuario con rol `admin_comercial` consultar, en una sola
vista de solo lectura, todos los campos de una campaña publicitaria existente (anunciante,
presupuesto total y consumido, fechas, segmentación y estado), sin necesidad de abrir el
modal de edición para verlos.

#### Scenario: Consultar el detalle de una campaña
- **WHEN** un `admin_comercial` abre la vista de detalle de una campaña publicitaria
  existente
- **THEN** el sistema muestra todos sus campos en modo solo lectura, sin permitir editarlos
  desde esa vista
