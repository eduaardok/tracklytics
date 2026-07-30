## ADDED Requirements

### Requirement: Panel administrativo de sesiones activas de toda la plataforma

El sistema SHALL permitir a un usuario con rol `admin` consultar todas las sesiones
actualmente abiertas de la plataforma (`FACT_SESION` sin `fecha_fin`), across todos los
usuarios, distinto de la consulta de sesiones propias ya existente. El resultado SHALL
incluir el usuario, dispositivo y fecha de inicio de cada sesión abierta, y SHALL aceptar
un límite de resultados.

#### Scenario: Admin consulta las sesiones abiertas de toda la plataforma
- **WHEN** un usuario con rol `admin` solicita el panel de sesiones activas globales
- **THEN** el sistema devuelve las sesiones abiertas de todos los usuarios, no solo las del
  solicitante

#### Scenario: Un usuario sin rol admin no accede al panel global
- **WHEN** un usuario autenticado sin rol `admin` intenta consultar el panel de sesiones
  activas globales
- **THEN** el sistema rechaza la operación
