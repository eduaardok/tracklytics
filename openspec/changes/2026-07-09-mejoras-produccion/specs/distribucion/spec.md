## ADDED Requirements

### Requirement: Catálogo público de países
El sistema SHALL exponer el catálogo de países conocidos (`DIM_PAIS`) sin requerir autenticación, para que las pantallas de registro de cuenta y de edición de perfil puedan ofrecer un selector de país antes de que exista una sesión de usuario o sin depender de un rol administrativo. Este endpoint SHALL ser de solo lectura.

#### Scenario: Consultar el catálogo de países sin sesión
- **WHEN** cualquier cliente, autenticado o no, solicita el catálogo público de países
- **THEN** el sistema retorna la lista completa de países conocidos con su nombre y código ISO

#### Scenario: El país declarado por el usuario proviene del catálogo conocido
- **WHEN** un usuario selecciona su país de este catálogo al registrarse o editar su perfil
- **THEN** el valor declarado coincide exactamente con un país conocido por el sistema, de modo que la consulta de disponibilidad por país (`Consulta de disponibilidad de un track por país`) pueda resolverlo de forma confiable en vez de caer en el caso de "país no reconocido"
