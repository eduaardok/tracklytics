## ADDED Requirements

### Requirement: Gestión administrativa de partners B2B
El sistema SHALL permitir a un usuario con rol `admin_comercial` crear un partner (nombre, tier `basico` | `pro` | `enterprise`, email de contacto) y listar todos los partners con su tier y estado. Al crear un partner el sistema SHALL generar una API key aleatoria, almacenar únicamente su hash SHA-256, y devolver la key en texto claro **una sola vez**. El listado SHALL NO exponer la key ni su hash. Las acciones SHALL auditarse.

#### Scenario: Crear un partner devuelve la key una sola vez
- **WHEN** un `admin_comercial` crea un partner
- **THEN** el sistema genera una API key, guarda solo su hash SHA-256, y devuelve la key en claro una única vez que no podrá recuperarse después

#### Scenario: El listado de partners no expone las keys
- **WHEN** un `admin_comercial` lista los partners
- **THEN** el sistema devuelve nombre, tier y estado de cada partner, sin la API key ni su hash

### Requirement: Rotación y desactivación de la API key de un partner
El sistema SHALL permitir a un `admin_comercial` rotar la API key de un partner (invalida la actual, genera una nueva, la devuelve en claro una sola vez) y desactivar un partner (`estado = 'inactivo'`), tras lo cual su API key SHALL dejar de autenticar.

#### Scenario: Rotar la key invalida la anterior
- **WHEN** un `admin_comercial` rota la API key de un partner
- **THEN** la key anterior deja de funcionar y la nueva se devuelve en claro una sola vez

#### Scenario: Desactivar un partner corta su acceso
- **WHEN** un `admin_comercial` desactiva un partner
- **THEN** las llamadas autenticadas con la API key de ese partner son rechazadas

### Requirement: Autenticación de partner por hash de API key
El sistema SHALL autenticar a un partner hasheando (SHA-256) la API key recibida por header y comparándola contra el `api_key_hash` almacenado, sin conservar nunca la key en claro.

#### Scenario: Autenticación con key válida
- **WHEN** un partner vigente envía su API key por header
- **THEN** el sistema calcula su hash, encuentra el partner y autoriza la llamada según su tier
