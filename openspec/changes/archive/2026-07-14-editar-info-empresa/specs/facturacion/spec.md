## ADDED Requirements

### Requirement: Administración de la información de la empresa emisora
El sistema SHALL permitir a cualquier usuario autenticado consultar la información vigente de la
empresa emisora (razón social, RUC, dirección) que aparece en el encabezado de cada factura. El
sistema SHALL permitir exclusivamente a un usuario con rol `admin` editar esa información, y SHALL
registrar el cambio en el log de auditoría con el administrador que lo realizó. Solo existe un
registro de información de la empresa en todo el sistema.

#### Scenario: Consultar la información de la empresa
- **WHEN** cualquier usuario autenticado solicita la información de la empresa emisora
- **THEN** el sistema retorna la razón social, el RUC y la dirección vigentes

#### Scenario: Admin edita la información de la empresa
- **WHEN** un usuario con rol `admin` envía una razón social, RUC y/o dirección nuevos
- **THEN** el sistema actualiza el registro único de información de la empresa y registra el cambio en el log de auditoría

#### Scenario: Usuario sin rol admin intenta editar la información de la empresa
- **WHEN** un usuario con rol distinto de `admin` intenta editar la información de la empresa
- **THEN** el sistema rechaza la operación indicando que es exclusiva de `admin`

#### Scenario: El encabezado de una factura refleja la información vigente
- **WHEN** cualquier usuario consulta el detalle de una factura después de que la información de la empresa fue editada
- **THEN** el encabezado de esa factura muestra la razón social, RUC y dirección vigentes al momento de la consulta, no los que tenía la empresa al emitirse la factura
