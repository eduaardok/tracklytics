## ADDED Requirements

### Requirement: Visibilidad de perfil (público/privado)
El sistema SHALL permitir a un usuario autenticado consultar y actualizar la visibilidad de su propio perfil (público o privado), privado por defecto para cualquier cuenta nueva. Esta preferencia SHALL ser de solo lectura para cualquier otro usuario.

#### Scenario: Consultar la visibilidad propia del perfil
- **WHEN** un usuario autenticado solicita los datos de su propio perfil
- **THEN** el sistema retorna, entre otros campos, si su perfil está marcado como público o privado

#### Scenario: Cambiar la visibilidad del propio perfil
- **WHEN** un usuario autenticado actualiza su perfil marcándolo como público o privado
- **THEN** el sistema persiste esa preferencia y la refleja en consultas posteriores de su perfil

#### Scenario: Cuenta nueva nace privada
- **WHEN** un usuario se registra
- **THEN** su perfil queda marcado como privado hasta que lo cambie explícitamente

### Requirement: Exploración paginada de usuarios sin término de búsqueda
El sistema SHALL permitir a un usuario con rol admin listar la tabla completa de usuarios de forma paginada sin proporcionar un término de búsqueda, filtrable opcionalmente por rol y por rango de fecha de registro.

#### Scenario: Listar usuarios sin escribir un término de búsqueda
- **WHEN** un usuario con rol admin solicita el listado de usuarios sin un término de búsqueda
- **THEN** el sistema retorna una página de la tabla completa de usuarios ordenada por fecha de registro descendente, junto con el total de usuarios y la página solicitada

#### Scenario: Filtrar el listado por rol
- **WHEN** un usuario con rol admin solicita el listado de usuarios indicando un rol
- **THEN** el sistema retorna únicamente los usuarios con ese rol

#### Scenario: Filtrar el listado por rango de fecha de registro
- **WHEN** un usuario con rol admin solicita el listado de usuarios indicando una fecha de registro mínima, máxima, o ambas
- **THEN** el sistema retorna únicamente los usuarios registrados dentro de ese rango
