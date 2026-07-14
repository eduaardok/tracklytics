## MODIFIED Requirements

### Requirement: Búsqueda de usuarios por nombre o correo
El sistema SHALL permitir a un usuario con rol `admin` buscar usuarios por coincidencia parcial de nombre o de correo electrónico, devolviendo como máximo un número acotado de resultados por consulta. Esta búsqueda SHALL ser de solo lectura y SHALL estar restringida a `admin`. Cuando no se especifique término de búsqueda, el sistema SHALL retornar el listado completo de usuarios paginado, en vez de una lista vacía, para soportar una vista de administración de usuarios sin necesidad de conocer un nombre o correo de antemano.

#### Scenario: Admin busca un usuario por nombre parcial
- **WHEN** un usuario con rol `admin` busca usuarios escribiendo parte de un nombre
- **THEN** el sistema retorna los usuarios cuyo nombre o correo coincida parcialmente, hasta el límite de resultados configurado

#### Scenario: Admin busca un usuario por correo parcial
- **WHEN** un usuario con rol `admin` busca usuarios escribiendo parte de un correo electrónico
- **THEN** el sistema retorna los usuarios cuyo correo coincida parcialmente

#### Scenario: Búsqueda sin coincidencias
- **WHEN** un usuario con rol `admin` busca usuarios con un texto que no coincide con ningún nombre ni correo registrado
- **THEN** el sistema retorna una lista vacía

#### Scenario: Admin lista todos los usuarios sin término de búsqueda
- **WHEN** un usuario con rol `admin` solicita el listado de usuarios sin especificar un término de búsqueda
- **THEN** el sistema retorna el listado completo de usuarios, paginado, ordenado por fecha de registro descendente

#### Scenario: Usuario sin rol admin intenta buscar usuarios
- **WHEN** un usuario con rol distinto de `admin` intenta buscar usuarios por nombre o correo
- **THEN** el sistema rechaza la operación indicando que la búsqueda de usuarios es exclusiva de `admin`

## ADDED Requirements

### Requirement: Actualización del propio perfil
El sistema SHALL permitir a cualquier usuario autenticado actualizar su propio nombre y país declarado, sin requerir ningún rol especial. El sistema NO SHALL permitir que un usuario actualice el perfil de otro usuario mediante este mecanismo.

#### Scenario: Usuario actualiza su propio nombre
- **WHEN** un usuario autenticado envía un nuevo nombre para su propio perfil
- **THEN** el sistema persiste el cambio y lo refleja en las consultas posteriores de su perfil

#### Scenario: Usuario actualiza su país declarado
- **WHEN** un usuario autenticado envía un nuevo país para su propio perfil, seleccionado de un catálogo de países conocido
- **THEN** el sistema persiste el país declarado, de forma que las consultas de disponibilidad geográfica (capability `distribucion`) puedan resolverlo de forma confiable
