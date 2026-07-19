## ADDED Requirements

### Requirement: Reporte financiero consolidado por período
El sistema SHALL permitir a un usuario con rol `admin_finanzas` obtener un reporte consolidado de un período que incluya ingresos, gastos operativos, regalías liquidadas e ingresos publicitarios, para dar visibilidad de la utilidad del negocio.

#### Scenario: Obtener el reporte consolidado de un período
- **WHEN** un `admin_finanzas` solicita el reporte financiero de un rango de fechas
- **THEN** el sistema devuelve los ingresos, gastos, regalías y publicidad consolidados del período
