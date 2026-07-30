## ADDED Requirements

### Requirement: Edición y vista de detalle de un partner B2B

El sistema SHALL permitir a un `admin_comercial` editar los campos reales de un partner
existente (nombre, tier, email de contacto, estado) y SHALL permitir consultar el detalle
completo de un partner individual. La edición SHALL auditarse y SHALL NO permitir modificar
la API key ni su hash a través de este endpoint (eso sigue reservado a la rotación de key).

#### Scenario: Editar los datos de un partner
- **WHEN** un `admin_comercial` edita el nombre, tier, email de contacto o estado de un
  partner existente
- **THEN** el sistema guarda los cambios y estos se reflejan en el listado administrativo

#### Scenario: La edición no expone ni modifica la API key
- **WHEN** un `admin_comercial` edita un partner
- **THEN** la respuesta no incluye la API key ni su hash, y ninguno de los dos cambia como
  efecto de esta operación

#### Scenario: Un rol sin competencia no puede editar partners
- **WHEN** un usuario sin rol `admin_comercial` intenta editar un partner
- **THEN** el sistema rechaza la operación
