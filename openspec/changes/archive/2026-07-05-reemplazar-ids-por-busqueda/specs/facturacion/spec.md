## MODIFIED Requirements

### Requirement: Acceso restringido al historial de facturación de terceros
El sistema SHALL restringir la consulta del historial de facturación de otro usuario exclusivamente a `admin`; un usuario con rol distinto de `admin` SHALL recibir un rechazo al intentarlo. El admin SHALL poder localizar al usuario objetivo mediante una búsqueda por nombre o correo, sin requerir que conozca ni escriba su `usuario_id`.

#### Scenario: Buscar el usuario por nombre o correo antes de auditar su facturación
- **WHEN** un usuario con rol `admin` escribe parte del nombre o correo de un usuario para consultar su historial de facturación
- **THEN** el sistema muestra las coincidencias encontradas para que el admin seleccione el usuario exacto

#### Scenario: Admin consulta el historial de otro usuario
- **WHEN** un usuario con rol `admin` solicita el historial de transacciones o invoices de otro usuario
- **THEN** el sistema retorna los registros solicitados

#### Scenario: Usuario sin rol admin intenta consultar el historial de otro usuario
- **WHEN** un usuario con rol distinto de `admin` intenta consultar el historial de transacciones o invoices de otro usuario
- **THEN** el sistema rechaza la operación indicando que esa consulta es exclusiva de `admin`
