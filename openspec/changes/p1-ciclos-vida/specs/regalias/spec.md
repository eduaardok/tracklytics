## ADDED Requirements

### Requirement: Edición de un contrato de regalías
El sistema SHALL permitir a un usuario con rol `admin_finanzas` editar el `porcentaje_artista`, el `porcentaje_sello` y la `fecha_fin` de un contrato de regalías, validando que la suma de porcentajes no exceda 100. La acción SHALL auditarse.

#### Scenario: Editar porcentajes válidos
- **WHEN** un `admin_finanzas` edita un contrato con porcentajes cuya suma es ≤ 100
- **THEN** el sistema actualiza el contrato y audita la acción

#### Scenario: Rechazar porcentajes que exceden 100
- **WHEN** un `admin_finanzas` envía porcentajes cuya suma excede 100
- **THEN** el sistema rechaza la operación con 422

### Requirement: Terminación de un contrato de regalías
El sistema SHALL permitir terminar un contrato (`estado = 'terminado'`), fijando `fecha_fin = now()` si no tenía una. La acción SHALL auditarse.

#### Scenario: Terminar un contrato sin fecha fin
- **WHEN** un `admin_finanzas` termina un contrato que no tenía fecha fin
- **THEN** el sistema marca el contrato como terminado y le fija la fecha fin actual

### Requirement: Exportación del resumen de liquidaciones de un contrato
El sistema SHALL permitir a un `admin_finanzas` exportar en formato JSON estructurado el resumen completo de liquidaciones de un contrato.

#### Scenario: Exportar liquidaciones de un contrato
- **WHEN** un `admin_finanzas` solicita la exportación del resumen de un contrato
- **THEN** el sistema devuelve el resumen estructurado de sus liquidaciones
