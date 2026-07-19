## ADDED Requirements

### Requirement: Historial de sanciones del usuario
El sistema SHALL mantener un historial de strikes por usuario, donde cada strike registra su motivo, su origen (una denuncia resuelta o una emisión manual), quién lo emitió y cuándo. Un usuario con rol `admin_comunidad` SHALL poder emitir un strike manual contra un usuario y SHALL poder consultar el historial de strikes de cualquier usuario. La emisión SHALL auditarse.

#### Scenario: Emitir un strike manual
- **WHEN** un `admin_comunidad` emite un strike manual contra un usuario indicando el motivo
- **THEN** el sistema registra el strike y este aparece en el historial del usuario

#### Scenario: Consultar el historial de sanciones
- **WHEN** un `admin_comunidad` consulta el historial de strikes de un usuario
- **THEN** el sistema devuelve todos sus strikes con motivo, origen y fecha

#### Scenario: Un rol sin competencia no puede sancionar
- **WHEN** un administrador de otra área intenta emitir un strike
- **THEN** el sistema rechaza la operación

### Requirement: Suspensión automática por acumulación de strikes
El sistema SHALL suspender automáticamente la cuenta de un usuario cuando acumule tres strikes activos, reutilizando el mecanismo de suspensión de cuentas existente. La suspensión automática SHALL auditarse indicando que su origen fue la acumulación de strikes.

#### Scenario: El tercer strike suspende la cuenta
- **WHEN** un usuario con dos strikes activos recibe un tercer strike
- **THEN** el sistema suspende automáticamente su cuenta y registra la suspensión en la auditoría

#### Scenario: La cuenta suspendida pierde acceso
- **WHEN** un usuario cuya cuenta fue suspendida por acumulación de strikes intenta usar el sistema
- **THEN** el sistema rechaza sus peticiones autenticadas por cuenta suspendida

#### Scenario: Menos de tres strikes no suspende
- **WHEN** un usuario recibe su segundo strike activo
- **THEN** su cuenta permanece activa

### Requirement: Verificación de correo electrónico en el registro
El sistema SHALL marcar como no verificados los correos de las cuentas registradas a partir de ahora, generando un token de verificación de un solo uso y con caducidad. El sistema SHALL permitir verificar el correo presentando ese token, y SHALL permitir solicitar el reenvío del token, invalidando el anterior. Los usuarios registrados con anterioridad SHALL considerarse verificados.

#### Scenario: Verificar el correo con el token
- **WHEN** un usuario recién registrado presenta su token de verificación
- **THEN** el sistema marca su correo como verificado

#### Scenario: Reenviar la verificación invalida el token previo
- **WHEN** un usuario solicita el reenvío de su verificación
- **THEN** el sistema genera un token nuevo y el token anterior deja de ser válido

#### Scenario: Token inválido, caducado o ya usado
- **WHEN** un usuario presenta un token de verificación inválido, caducado o ya utilizado
- **THEN** el sistema rechaza la verificación indicando el motivo

#### Scenario: Un token de verificación no sirve para restablecer contraseña
- **WHEN** alguien intenta restablecer una contraseña usando un token de verificación de correo
- **THEN** el sistema rechaza la operación

### Requirement: Restricción de acciones para cuentas sin verificar
El sistema SHALL permitir a un usuario con el correo sin verificar navegar el catálogo con normalidad, pero SHALL impedirle comentar, subir tracks como artista y contratar un plan de pago, informando con un mensaje claro de que debe verificar su correo.

#### Scenario: Un usuario sin verificar navega el catálogo
- **WHEN** un usuario con el correo sin verificar consulta el catálogo
- **THEN** el sistema responde con normalidad

#### Scenario: Un usuario sin verificar intenta comentar
- **WHEN** un usuario con el correo sin verificar intenta publicar un comentario
- **THEN** el sistema rechaza la operación indicando que debe verificar su correo

#### Scenario: Tras verificar, las acciones se habilitan
- **WHEN** un usuario verifica su correo y vuelve a intentar comentar
- **THEN** el sistema permite la operación

### Requirement: Exportación de datos personales
El sistema SHALL permitir a un usuario autenticado descargar un documento estructurado con todos sus datos personales, incluyendo su perfil, su suscripción e historial de pagos, sus favoritos, sus playlists, su historial de reproducción, sus comentarios, sus seguimientos, sus tickets de soporte y las denuncias que ha emitido.

#### Scenario: Descargar los datos personales
- **WHEN** un usuario autenticado solicita la exportación de sus datos
- **THEN** el sistema devuelve un documento estructurado con todas las secciones de datos que le corresponden

#### Scenario: Un usuario solo obtiene sus propios datos
- **WHEN** un usuario autenticado solicita la exportación de sus datos
- **THEN** el documento contiene exclusivamente datos de ese usuario

#### Scenario: Exportación sin sesión
- **WHEN** alguien solicita la exportación de datos sin sesión iniciada
- **THEN** el sistema rechaza la petición
