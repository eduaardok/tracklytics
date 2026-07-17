## ADDED Requirements

### Requirement: Catálogo de roles administrativos por área de negocio
El sistema SHALL mantener un catálogo cerrado de roles administrativos, cada uno con un alcance acotado de capabilities de negocio: `superadmin` (todas), `admin_finanzas` (`facturacion`, `finanzas`, `regalias`, `publicidad`), `admin_contenido` (`creadores`, `distribucion`, `catalogo`), `admin_comunidad` (`social`, `experiencia`), `admin_datos` (`gestion_datos`, `analitica`) y `admin_comercial` (`suscripciones`, `partners`). El rol `superadmin` SHALL ser equivalente al administrador general previo (`role == admin`); los demás roles SHALL ser subconjuntos de su alcance. El catálogo SHALL persistir en `DIM_ROL_ADMINISTRATIVO`.

#### Scenario: Consultar el catálogo de roles administrativos
- **WHEN** un usuario con rol `superadmin` solicita el catálogo de roles administrativos
- **THEN** el sistema retorna los seis roles con su nombre de display, su descripción y el conjunto de capabilities que abarca cada uno

### Requirement: Autorización administrativa segmentada por rol de área
El sistema SHALL autorizar cada operación administrativa contra el rol administrativo específico del área a la que pertenece, en lugar de un único check monolítico de `role == admin`. Un usuario con rol `superadmin` SHALL pasar siempre cualquier verificación administrativa. Un usuario con un rol de área SHALL acceder únicamente a los endpoints administrativos de las capabilities dentro de su alcance, y SHALL ser rechazado con 403 en los endpoints administrativos de otras áreas. Los roles administrativos vigentes de un usuario SHALL resolverse contra `BRIDGE_USUARIO_ROL_ADMIN`.

#### Scenario: superadmin accede a cualquier área administrativa
- **WHEN** un usuario con rol `superadmin` invoca cualquier endpoint administrativo de cualquier capability
- **THEN** el sistema autoriza la operación

#### Scenario: Rol de área accede a su propio dominio
- **WHEN** un usuario con rol `admin_finanzas` invoca un endpoint administrativo de `finanzas` o de `regalias`
- **THEN** el sistema autoriza la operación

#### Scenario: Rol de área es rechazado fuera de su dominio
- **WHEN** un usuario con rol `admin_finanzas` intenta invocar un endpoint administrativo de `seguridad` o de `creadores`
- **THEN** el sistema rechaza la operación con 403, indicando que requiere un rol administrativo distinto

#### Scenario: Usuario sin rol administrativo es rechazado
- **WHEN** un usuario sin ningún rol administrativo vigente intenta invocar un endpoint administrativo
- **THEN** el sistema rechaza la operación con 403

### Requirement: Mapeo automático de administradores existentes a superadmin
El sistema SHALL asegurar que toda cuenta con `role == admin` en PocketBase quede reflejada con el rol `superadmin` en `BRIDGE_USUARIO_ROL_ADMIN` de forma automática, sin migración manual, de modo que los administradores actuales conserven acceso a todas las áreas tras el cambio.

#### Scenario: Un administrador existente conserva acceso total
- **WHEN** una cuenta con `role == admin` en PocketBase inicia sesión por primera vez tras el cambio
- **THEN** el sistema le asigna el rol `superadmin` en `BRIDGE_USUARIO_ROL_ADMIN` si aún no lo tenía, y la cuenta accede a todos los endpoints administrativos

### Requirement: Estado de cuenta verificado en cada autenticación
El sistema SHALL mantener un `estado_cuenta` por usuario en `DIM_USUARIO` con valores `activa`, `suspendido` o `eliminado` (`activa` por defecto). El middleware de autenticación SHALL verificar este estado en cada petición autenticada y SHALL rechazar con 403 toda petición de una cuenta `suspendido` o `eliminado`, aun cuando su token de PocketBase siga siendo válido.

#### Scenario: Cuenta activa opera normalmente
- **WHEN** un usuario con `estado_cuenta = 'activa'` realiza una petición autenticada
- **THEN** el sistema procesa la petición con normalidad

#### Scenario: Cuenta suspendida es rechazada
- **WHEN** un usuario con `estado_cuenta = 'suspendido'` realiza cualquier petición autenticada
- **THEN** el sistema rechaza la petición con 403 indicando que la cuenta está suspendida

#### Scenario: Cuenta eliminada es rechazada
- **WHEN** un usuario con `estado_cuenta = 'eliminado'` intenta iniciar sesión o realizar una petición autenticada
- **THEN** el sistema rechaza el acceso con 403

### Requirement: Gestión administrativa de usuarios
El sistema SHALL permitir a un usuario con rol `superadmin` listar usuarios de forma paginada con filtros (rol, estado de cuenta, rango de fecha de registro) y consultar la vista 360° de un usuario: perfil, rol de PocketBase, roles administrativos vigentes, suscripción activa, transacciones recientes, sesiones activas, permisos vigentes y último inicio de sesión, consolidando datos de `DIM_USUARIO`, `BRIDGE_USUARIO_ROL_ADMIN`, `FACT_SESION`, `FACT_TRANSACCION_PAGO` y `FACT_PERMISO_USUARIO`.

#### Scenario: Listar usuarios con filtros
- **WHEN** un usuario con rol `superadmin` solicita el listado de usuarios filtrando por rol y estado de cuenta
- **THEN** el sistema retorna la página solicitada de usuarios que cumplen los filtros, junto con el total, ordenada por fecha de registro descendente

#### Scenario: Consultar la vista 360° de un usuario
- **WHEN** un usuario con rol `superadmin` solicita el detalle de un usuario por su identificador
- **THEN** el sistema retorna su perfil, sus roles administrativos, su suscripción activa, sus transacciones recientes, sus sesiones activas, sus permisos vigentes y su último inicio de sesión

#### Scenario: Usuario sin rol superadmin intenta gestionar usuarios
- **WHEN** un usuario sin rol `superadmin` intenta listar usuarios o consultar la vista 360°
- **THEN** el sistema rechaza la operación con 403

### Requirement: Asignación y revocación de roles administrativos
El sistema SHALL permitir a un usuario con rol `superadmin` asignar un rol administrativo a un usuario (registrando en `BRIDGE_USUARIO_ROL_ADMIN` quién lo asignó y cuándo) y revocarlo. El rol asignado SHALL pertenecer al catálogo `DIM_ROL_ADMINISTRATIVO`. Cada asignación o revocación SHALL quedar registrada en `FACT_AUDIT_LOG`.

#### Scenario: Asignar un rol administrativo
- **WHEN** un usuario con rol `superadmin` asigna el rol `admin_finanzas` a un usuario
- **THEN** el sistema registra la asignación en `BRIDGE_USUARIO_ROL_ADMIN` con el autor y la fecha, la audita, y el usuario objetivo pasa a acceder a los endpoints administrativos de finanzas

#### Scenario: Revocar un rol administrativo
- **WHEN** un usuario con rol `superadmin` revoca un rol administrativo previamente asignado
- **THEN** el sistema deja de considerar ese rol vigente para el usuario y audita la revocación

#### Scenario: Asignar un rol fuera del catálogo
- **WHEN** un usuario con rol `superadmin` intenta asignar un rol administrativo que no existe en `DIM_ROL_ADMINISTRATIVO`
- **THEN** el sistema rechaza la operación con un error de validación

### Requirement: Suspensión y reactivación de cuentas
El sistema SHALL permitir a un usuario con rol `superadmin` suspender una cuenta (fijando `estado_cuenta = 'suspendido'` en `DIM_USUARIO`) y reactivarla (`estado_cuenta = 'activa'`). Ambas operaciones SHALL quedar registradas en `FACT_AUDIT_LOG`.

#### Scenario: Suspender una cuenta bloquea su acceso
- **WHEN** un usuario con rol `superadmin` suspende una cuenta y su titular intenta después realizar una petición autenticada
- **THEN** el sistema rechaza la petición del titular con 403 y deja registro de la suspensión en `FACT_AUDIT_LOG`

#### Scenario: Reactivar una cuenta restaura su acceso
- **WHEN** un usuario con rol `superadmin` reactiva una cuenta previamente suspendida
- **THEN** el titular vuelve a poder iniciar sesión y operar con normalidad

### Requirement: Bloqueo temporal por intentos de inicio de sesión fallidos
El sistema SHALL registrar cada intento fallido de inicio de sesión en `FACT_AUDIT_LOG`. Antes de validar credenciales contra PocketBase, el sistema SHALL comprobar si existen 5 o más intentos fallidos para ese correo en los últimos 15 minutos y, de ser así, SHALL rechazar el intento con 429 y un mensaje de bloqueo temporal, sin llegar a validar la contraseña.

#### Scenario: Cinco fallos consecutivos bloquean temporalmente la cuenta
- **WHEN** un correo acumula cinco intentos de inicio de sesión fallidos dentro de una ventana de 15 minutos y se intenta un sexto inicio de sesión
- **THEN** el sistema rechaza el sexto intento con 429 indicando que la cuenta está bloqueada temporalmente, sin validar la contraseña

#### Scenario: El bloqueo expira tras la ventana
- **WHEN** han transcurrido más de 15 minutos desde los intentos fallidos y el usuario intenta iniciar sesión con credenciales correctas
- **THEN** el sistema procesa el inicio de sesión con normalidad

### Requirement: Recuperación de contraseña por token de un solo uso
El sistema SHALL permitir solicitar la recuperación de contraseña indicando un correo; si el correo corresponde a un usuario existente, el sistema SHALL generar un token de un solo uso con vencimiento, persistirlo en `FACT_TOKEN_RECUPERACION`, y en todo caso SHALL responder con un mensaje genérico que no revele si el correo existe. El sistema SHALL permitir restablecer la contraseña presentando un token válido (no vencido, no usado) y una nueva contraseña, delegando el cambio a PocketBase y marcando el token como usado. No se envía correo real (patrón de simulación del proyecto).

#### Scenario: Solicitud de recuperación no revela existencia del correo
- **WHEN** alguien solicita recuperar la contraseña de un correo, exista o no en el sistema
- **THEN** el sistema responde con un mensaje genérico de "si el correo existe, recibirás instrucciones", generando un token únicamente cuando el correo corresponde a un usuario real

#### Scenario: Restablecer con token válido
- **WHEN** un usuario presenta un token de recuperación no vencido y no usado junto con una nueva contraseña
- **THEN** el sistema cambia la contraseña en PocketBase, marca el token como usado, y el usuario puede iniciar sesión con la nueva contraseña

#### Scenario: Restablecer con token vencido o ya usado
- **WHEN** un usuario presenta un token de recuperación vencido o previamente usado
- **THEN** el sistema rechaza el restablecimiento sin cambiar la contraseña

### Requirement: Baja de cuenta propia
El sistema SHALL permitir a un usuario autenticado solicitar la baja de su propia cuenta. La baja SHALL fijar `estado_cuenta = 'eliminado'` en `DIM_USUARIO`, invalidar todas sus sesiones activas en `FACT_SESION` y cancelar su suscripción activa si la tuviera. El sistema NO SHALL borrar los datos históricos del usuario en ClickHouse (retención analítica), pero SHALL rechazar todo inicio de sesión posterior igual que una cuenta suspendida.

#### Scenario: Un usuario da de baja su cuenta
- **WHEN** un usuario autenticado confirma la baja de su cuenta
- **THEN** el sistema fija su `estado_cuenta = 'eliminado'`, cierra todas sus sesiones activas, cancela su suscripción activa si la tenía, y conserva sus datos históricos en ClickHouse

#### Scenario: Un usuario dado de baja no puede volver a entrar
- **WHEN** un usuario que dio de baja su cuenta intenta iniciar sesión de nuevo
- **THEN** el sistema rechaza el acceso con 403
