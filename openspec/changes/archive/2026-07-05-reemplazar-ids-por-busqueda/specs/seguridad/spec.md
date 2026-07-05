## ADDED Requirements

### Requirement: Búsqueda de usuarios por nombre o correo
El sistema SHALL permitir a un usuario con rol `admin` buscar usuarios por coincidencia parcial de nombre o de correo electrónico, devolviendo como máximo un número acotado de resultados por consulta. Esta búsqueda SHALL ser de solo lectura y SHALL estar restringida a `admin`.

#### Scenario: Admin busca un usuario por nombre parcial
- **WHEN** un usuario con rol `admin` busca usuarios escribiendo parte de un nombre
- **THEN** el sistema retorna los usuarios cuyo nombre o correo coincida parcialmente, hasta el límite de resultados configurado

#### Scenario: Admin busca un usuario por correo parcial
- **WHEN** un usuario con rol `admin` busca usuarios escribiendo parte de un correo electrónico
- **THEN** el sistema retorna los usuarios cuyo correo coincida parcialmente

#### Scenario: Búsqueda sin coincidencias
- **WHEN** un usuario con rol `admin` busca usuarios con un texto que no coincide con ningún nombre ni correo registrado
- **THEN** el sistema retorna una lista vacía

#### Scenario: Usuario sin rol admin intenta buscar usuarios
- **WHEN** un usuario con rol distinto de `admin` intenta buscar usuarios por nombre o correo
- **THEN** el sistema rechaza la operación indicando que la búsqueda de usuarios es exclusiva de `admin`

## MODIFIED Requirements

### Requirement: Gestión de permisos granulares por rol
El sistema SHALL permitir a un usuario con rol `admin` consultar y modificar los permisos granulares (recurso, acción) asignados a un usuario, además de la matriz por defecto de cada rol (user/analyst/admin). El admin SHALL poder localizar al usuario objetivo mediante una búsqueda por nombre o correo, sin requerir que conozca ni escriba su `usuario_id`. Cada cambio SHALL quedar registrado en `FACT_PERMISO_USUARIO` sin sobrescribir el historial previo.

#### Scenario: Buscar el usuario por nombre o correo antes de gestionar sus permisos
- **WHEN** un usuario con rol `admin` escribe parte del nombre o correo de un usuario para consultar o modificar sus permisos
- **THEN** el sistema muestra las coincidencias encontradas para que el admin seleccione el usuario exacto

#### Scenario: Admin consulta los permisos de un usuario
- **WHEN** un usuario con rol `admin` solicita los permisos vigentes de un usuario
- **THEN** el sistema retorna el conjunto de permisos actualmente activos, resueltos a partir del historial en `FACT_PERMISO_USUARIO`

#### Scenario: Admin otorga un permiso adicional
- **WHEN** un usuario con rol `admin` otorga un permiso sobre un recurso/acción a un usuario que no lo tenía
- **THEN** el sistema agrega el nuevo permiso al historial de `FACT_PERMISO_USUARIO` y queda activo de inmediato

#### Scenario: Admin revoca un permiso existente
- **WHEN** un usuario con rol `admin` revoca un permiso previamente otorgado a un usuario
- **THEN** el sistema registra la revocación en `FACT_PERMISO_USUARIO` sin eliminar el historial anterior, y el permiso deja de estar activo

#### Scenario: Usuario sin rol admin intenta gestionar permisos
- **WHEN** un usuario con rol `user` o `analyst` intenta consultar o modificar los permisos de cualquier usuario
- **THEN** el sistema rechaza la operación indicando que la gestión de permisos es exclusiva de `admin`
