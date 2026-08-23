# Capability: seguridad

## Purpose

Gobernar la identidad, autenticación, permisos por rol, auditoría de operaciones sensibles y registro de errores de sistema de Tracklytics, dejando rastro operativo consultable en ClickHouse sin duplicar el almacén de credenciales de PocketBase.

## Objetivo

Gobernar la identidad, autenticación, permisos por rol, auditoría de operaciones sensibles y registro de errores de sistema de Tracklytics, dejando rastro operativo consultable en ClickHouse sin duplicar el almacén de credenciales de PocketBase.

## Contexto

Hasta ahora el flujo de registro/login/logout vivía descrito dentro de la capability `catalogo` (CU-O01), aunque su implementación real (PocketBase) no pertenece al paquete backend de catálogo. Esta capability formaliza esa responsabilidad en un paquete propio (`api/paquetes/seguridad/`) y añade lo que no existía: permisos granulares por rol, auditoría de operaciones sensibles y registro centralizado de errores de sistema — requisitos del modelo de datos de negocio (RT-06) que hoy no tienen dueño.

## Actores

- **Usuario B2C** (`role=user`): se registra, inicia y cierra sesión.
- **Cliente B2B** (`role=analyst`): se registra, inicia y cierra sesión; mismo flujo que Usuario B2C.
- **Lead Data Engineer / CTO** (`role=admin`): además de autenticarse, administra permisos por rol y consulta auditoría y errores de sistema.

## Tabla de trazabilidad

| Nivel empresarial | Departamento | Paquete | Caso de uso | Historia de usuario |
|---|---|---|---|---|
| Operativo | Usuario B2C / Cliente B2B | Seguridad e identidad | CU-O01 Registrarse, iniciar y cerrar sesión | Como Usuario B2C, quiero crear una cuenta e iniciar sesión, para acceder a mi biblioteca personal |
| Operativo | Lead Data Engineer / CTO | Seguridad e identidad | CU-O17 Gestionar permisos granulares por rol | Como Lead Data Engineer/CTO, quiero administrar qué recursos y acciones puede usar cada rol, para controlar el acceso al sistema con precisión |
| Operativo | Lead Data Engineer / CTO | Seguridad e identidad | CU-O18 Auditar operaciones sensibles del sistema | Como Lead Data Engineer/CTO, quiero ver un registro de auditoría de cambios sensibles, para rastrear quién hizo qué y cuándo |
| Operativo | Lead Data Engineer / CTO | Seguridad e identidad | CU-O19 Registrar y consultar errores de sistema | Como Lead Data Engineer/CTO, quiero ver los errores de sistema ocurridos en la API, para diagnosticar y resolver incidentes |
## Requirements
### Requirement: Registro de usuario
El sistema SHALL permitir registrar un nuevo usuario con correo, contraseña, nombre, país y rol (user/analyst) vía PocketBase, expuesto a través de un endpoint propio de FastAPI (no acceso directo del frontend a PocketBase). El registro exitoso SHALL reflejar la identidad del usuario en `DIM_USUARIO` y sembrar su matriz de permisos por defecto en `FACT_PERMISO_USUARIO` según su rol.

#### Scenario: Registro exitoso
- **WHEN** un visitante envía correo, contraseña, nombre y país válidos para crear una cuenta
- **THEN** el sistema crea el usuario en PocketBase, refleja su identidad en `DIM_USUARIO` y siembra los permisos por defecto de su rol, quedando disponible para iniciar sesión

#### Scenario: Registro con correo ya existente
- **WHEN** un visitante intenta registrarse con un correo ya usado por otra cuenta
- **THEN** el sistema rechaza el registro con un error de validación, sin crear una identidad duplicada

### Requirement: Inicio de sesión
El sistema SHALL permitir iniciar sesión validando credenciales contra PocketBase a través de un endpoint propio de FastAPI, devolviendo un token de sesión real cuando las credenciales son correctas. Cada inicio de sesión exitoso SHALL registrar una sesión en `FACT_SESION` vinculada al usuario y al dispositivo desde el que se conecta.

#### Scenario: Login exitoso
- **WHEN** el usuario está registrado con correo y contraseña válidos e ingresa sus credenciales correctas
- **THEN** el sistema inicia sesión, devuelve un token de sesión válido, registra el dispositivo en `DIM_DISPOSITIVO` si es la primera vez que se ve, y registra el inicio de la sesión en `FACT_SESION`

#### Scenario: Login fallido
- **WHEN** el usuario ingresa un correo o contraseña incorrectos
- **THEN** el sistema rechaza el inicio de sesión con un error de autenticación genérico, sin indicar cuál campo falló, y no registra una sesión en `FACT_SESION`

### Requirement: Cierre de sesión
El sistema SHALL permitir cerrar sesión invalidando el token de sesión activo en el cliente. El cierre de sesión SHALL actualizar el registro correspondiente en `FACT_SESION` con la fecha de fin y la duración calculada.

#### Scenario: Logout invalida el token activo y cierra la sesión
- **WHEN** un usuario autenticado solicita cerrar sesión
- **THEN** el sistema invalida el token activo en el cliente, registra en `FACT_SESION` la fecha de fin y la duración de la sesión, y el usuario deja de tener acceso hasta volver a iniciar sesión

### Requirement: Seguridad de credenciales
El sistema SHALL asegurar que las credenciales nunca se almacenen ni transmitan en texto plano; PocketBase gestiona el hashing de contraseñas como único almacén de credenciales.

#### Scenario: Las credenciales no se almacenan en texto plano
- **WHEN** un usuario se registra o inicia sesión
- **THEN** el sistema delega el hashing de la contraseña a PocketBase y nunca persiste ni transmite la contraseña en texto plano

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

#### Scenario: Recurso y acción se eligen de un catálogo cerrado, no se escriben libres
- **WHEN** un usuario con rol `admin` abre el formulario para otorgar o revocar un permiso
- **THEN** el sistema ofrece `recurso` y `accion` como una selección entre los valores conocidos del sistema (`GET /permisos/catalogo`), sin permitir texto arbitrario que nunca matchee ningún permiso real

#### Scenario: Admin revoca un permiso existente
- **WHEN** un usuario con rol `admin` revoca un permiso previamente otorgado a un usuario
- **THEN** el sistema registra la revocación en `FACT_PERMISO_USUARIO` sin eliminar el historial anterior, y el permiso deja de estar activo

#### Scenario: Usuario sin rol admin intenta gestionar permisos
- **WHEN** un usuario con rol `user` o `analyst` intenta consultar o modificar los permisos de cualquier usuario
- **THEN** el sistema rechaza la operación indicando que la gestión de permisos es exclusiva de `admin`

### Requirement: Auditoría de operaciones sensibles
El sistema SHALL registrar en `FACT_AUDIT_LOG` cada operación sensible realizada dentro de esta capability (registro de usuario, cambio de rol, otorgamiento o revocación de permisos), incluyendo el usuario que ejecutó la acción, la acción, la tabla afectada y el estado antes/después.

#### Scenario: Registro de auditoría en un cambio de permiso
- **WHEN** un usuario con rol `admin` otorga o revoca un permiso
- **THEN** el sistema registra en `FACT_AUDIT_LOG` el usuario que ejecutó el cambio, la acción realizada, la tabla afectada y el estado antes/después del permiso

#### Scenario: Consulta del registro de auditoría
- **WHEN** un usuario con rol `admin` solicita el historial de auditoría
- **THEN** el sistema retorna los registros de `FACT_AUDIT_LOG` ordenados del más reciente al más antiguo

#### Scenario: Auditoría identifica al usuario por nombre, no solo por ID
- **WHEN** un usuario con rol `admin` consulta el historial de auditoría
- **THEN** cada registro incluye el nombre y correo del usuario que ejecutó la acción (resueltos contra `DIM_USUARIO`), mostrando el `usuario_id` crudo únicamente cuando no se pudo resolver una identidad

#### Scenario: Usuario sin rol admin intenta consultar auditoría
- **WHEN** un usuario con rol `user` o `analyst` intenta consultar el registro de auditoría
- **THEN** el sistema rechaza la operación indicando que la auditoría es exclusiva de `admin`

### Requirement: Registro y consulta de errores de sistema
El sistema SHALL capturar toda excepción no controlada ocurrida en la API en `FACT_ERROR_SISTEMA`, incluyendo código de error, mensaje, servicio de origen, usuario asociado (cuando exista sesión resuelta) y marca de tiempo, sin interrumpir la respuesta de error entregada al cliente. Un usuario con rol `admin` SHALL poder consultar el registro de errores.

#### Scenario: Captura automática de un error no controlado
- **WHEN** ocurre una excepción no controlada en cualquier endpoint de la API
- **THEN** el sistema registra el error en `FACT_ERROR_SISTEMA` con su código, mensaje, servicio de origen y marca de tiempo, y responde al cliente con un error genérico sin exponer detalles internos

#### Scenario: Admin consulta el registro de errores de sistema
- **WHEN** un usuario con rol `admin` solicita el historial de errores de sistema
- **THEN** el sistema retorna los registros de `FACT_ERROR_SISTEMA` ordenados del más reciente al más antiguo, incluyendo su estado de resolución

#### Scenario: Errores de sistema identifican al usuario por nombre, no solo por ID
- **WHEN** un usuario con rol `admin` consulta el registro de errores de sistema y el error tiene un usuario asociado
- **THEN** el registro incluye el nombre y correo de ese usuario (resueltos contra `DIM_USUARIO`), mostrando el `usuario_id` crudo únicamente cuando no se pudo resolver una identidad

#### Scenario: Usuario sin rol admin intenta consultar errores de sistema
- **WHEN** un usuario con rol `user` o `analyst` intenta consultar el registro de errores de sistema
- **THEN** el sistema rechaza la operación indicando que la consulta de errores es exclusiva de `admin`

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

#### Scenario: Usuario sin rol admin intenta buscar usuarios
- **WHEN** un usuario con rol distinto de `admin` intenta buscar usuarios por nombre o correo
- **THEN** el sistema rechaza la operación indicando que la búsqueda de usuarios es exclusiva de `admin`

#### Scenario: Admin lista todos los usuarios sin término de búsqueda
- **WHEN** un usuario con rol `admin` solicita el listado de usuarios sin especificar un término de búsqueda
- **THEN** el sistema retorna el listado completo de usuarios, paginado, ordenado por fecha de registro descendente

### Requirement: Actualización del propio perfil
El sistema SHALL permitir a cualquier usuario autenticado actualizar su propio nombre y país declarado, sin requerir ningún rol especial. El sistema NO SHALL permitir que un usuario actualice el perfil de otro usuario mediante este mecanismo.

#### Scenario: Usuario actualiza su propio nombre
- **WHEN** un usuario autenticado envía un nuevo nombre para su propio perfil
- **THEN** el sistema persiste el cambio y lo refleja en las consultas posteriores de su perfil

#### Scenario: Usuario actualiza su país declarado
- **WHEN** un usuario autenticado envía un nuevo país para su propio perfil, seleccionado de un catálogo de países conocido
- **THEN** el sistema persiste el país declarado, de forma que las consultas de disponibilidad geográfica (capability `distribucion`) puedan resolverlo de forma confiable

### Requirement: Consulta y cierre remoto de sesiones activas propias
El sistema SHALL permitir a cualquier usuario autenticado consultar la lista de sus propias sesiones actualmente abiertas (`FACT_SESION` sin `fecha_fin`), y cerrar remotamente cualquiera de ellas por `sesion_id`. El sistema SHALL rechazar el cierre de una sesión que no pertenezca al usuario autenticado.

#### Scenario: Usuario consulta sus sesiones abiertas en múltiples dispositivos
- **WHEN** un usuario autenticado que inició sesión desde más de un dispositivo consulta sus sesiones activas
- **THEN** el sistema retorna una sesión por cada inicio de sesión sin cerrar, identificando el dispositivo de cada una

#### Scenario: Usuario cierra remotamente una de sus sesiones
- **WHEN** un usuario autenticado solicita cerrar una sesión propia distinta a la actual
- **THEN** el sistema registra en `FACT_SESION` la fecha de fin y la duración de esa sesión, y esa sesión deja de aparecer en la lista de sesiones abiertas

#### Scenario: Usuario intenta cerrar una sesión de otro usuario
- **WHEN** un usuario autenticado intenta cerrar una sesión cuyo `usuario_id` no coincide con el suyo
- **THEN** el sistema rechaza la operación sin modificar la sesión ajena

### Requirement: Panel administrativo de métricas operativas de seguridad
El sistema SHALL exponer a un usuario con rol `admin` un panel con métricas operativas agregadas de la capability `seguridad`: acciones auditadas por día, errores de sistema de las últimas 24 horas, y total de sesiones actualmente abiertas en la plataforma.

#### Scenario: Admin consulta el panel de métricas de seguridad
- **WHEN** un usuario con rol `admin` solicita el dashboard de seguridad
- **THEN** el sistema retorna la serie diaria de acciones auditadas, el conteo de errores de las últimas 24 horas y el total de sesiones abiertas, calculados sobre datos reales de `FACT_AUDIT_LOG`/`FACT_ERROR_SISTEMA`/`FACT_SESION`

#### Scenario: Usuario sin rol admin intenta consultar el panel de seguridad
- **WHEN** un usuario sin rol `admin` intenta consultar el dashboard de seguridad
- **THEN** el sistema rechaza la operación

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

El sistema SHALL permitir solicitar la recuperación de contraseña indicando un correo; si el
correo corresponde a un usuario existente, el sistema SHALL generar un token de un solo uso con
vencimiento, persistirlo en `FACT_TOKEN_RECUPERACION`, y en todo caso SHALL responder con un
mensaje genérico que no revele si el correo existe. Como no se envía correo real (patrón de
simulación del proyecto), el sistema SHALL incluir el token generado en la propia respuesta
cuando el correo corresponde a un usuario existente, para que el flujo de recuperación sea
completable sin un canal de entrega externo. El sistema SHALL permitir restablecer la contraseña
presentando un token válido (no vencido, no usado) y una nueva contraseña, delegando el cambio a
PocketBase y marcando el token como usado.

#### Scenario: Solicitud de recuperación no revela existencia del correo

- **WHEN** alguien solicita recuperar la contraseña de un correo, exista o no en el sistema
- **THEN** el sistema responde con un mensaje genérico de "si el correo existe, recibirás
  instrucciones", generando un token únicamente cuando el correo corresponde a un usuario real

#### Scenario: El token generado viaja en la respuesta

- **WHEN** el correo indicado corresponde a un usuario existente
- **THEN** la respuesta incluye el token de recuperación generado, para que el solicitante pueda
  usarlo de inmediato sin depender de un correo real

#### Scenario: Restablecer con token válido

- **WHEN** un usuario presenta un token de recuperación no vencido y no usado junto con una
  nueva contraseña
- **THEN** el sistema cambia la contraseña en PocketBase, marca el token como usado, y el
  usuario puede iniciar sesión con la nueva contraseña

#### Scenario: Restablecer con token vencido o ya usado

- **WHEN** un usuario presenta un token de recuperación vencido o previamente usado
- **THEN** el sistema rechaza el restablecimiento sin cambiar la contraseña

### Requirement: Baja de cuenta propia

El sistema SHALL permitir a un usuario autenticado **sin rol administrativo** solicitar la baja
de su propia cuenta. La baja SHALL fijar `estado_cuenta = 'eliminado'` en `DIM_USUARIO`,
invalidar todas sus sesiones activas en `FACT_SESION` y cancelar su suscripción activa si la
tuviera. El sistema NO SHALL borrar los datos históricos del usuario en ClickHouse (retención
analítica), pero SHALL rechazar todo inicio de sesión posterior igual que una cuenta suspendida.
Una cuenta con rol administrativo (superadmin o cualquiera de los roles de área vigentes en
`BRIDGE_USUARIO_ROL_ADMIN`) SHALL ser rechazada al intentar darse de baja a sí misma, sin
ejecutar ninguno de los efectos de la baja.

#### Scenario: Un usuario sin rol administrativo da de baja su cuenta

- **WHEN** un usuario autenticado sin rol administrativo confirma la baja de su cuenta
- **THEN** el sistema fija su `estado_cuenta = 'eliminado'`, cierra todas sus sesiones activas,
  cancela su suscripción activa si la tenía, y conserva sus datos históricos en ClickHouse

#### Scenario: Un usuario dado de baja no puede volver a entrar

- **WHEN** un usuario que dio de baja su cuenta intenta iniciar sesión de nuevo
- **THEN** el sistema rechaza el acceso con 403

#### Scenario: Una cuenta con rol administrativo intenta darse de baja a sí misma

- **WHEN** una cuenta con `record.role == 'admin'` o con algún rol vigente en
  `BRIDGE_USUARIO_ROL_ADMIN` solicita la baja de su propia cuenta
- **THEN** el sistema rechaza la operación con 403, sin cerrar sesiones, cancelar suscripciones
  ni cambiar `estado_cuenta`

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
El sistema SHALL marcar como no verificados los correos de las cuentas registradas a partir de ahora, generando un token de verificación de un solo uso y con caducidad. El sistema SHALL enviar ese token por un canal de correo real además de incluirlo en la respuesta del registro/reenvío (esto último se conserva por conveniencia de entorno de demostración, sin credenciales de un proveedor externo). El sistema SHALL permitir verificar el correo presentando ese token, y SHALL permitir solicitar el reenvío del token, invalidando el anterior. Un fallo al enviar el correo real SHALL registrarse sin interrumpir el registro/reenvío — el token sigue siendo válido y utilizable por la vía de respuesta. Los usuarios registrados con anterioridad SHALL considerarse verificados.

#### Scenario: Verificar el correo con el token
- **WHEN** un usuario recién registrado presenta su token de verificación
- **THEN** el sistema marca su correo como verificado

#### Scenario: El registro envía un correo real con el token
- **WHEN** un usuario se registra con un correo válido
- **THEN** el sistema envía un correo real a ese destinatario con el token de verificación, además de incluirlo en la respuesta del registro

#### Scenario: Reenviar la verificación invalida el token previo
- **WHEN** un usuario solicita el reenvío de su verificación
- **THEN** el sistema genera un token nuevo, lo envía por correo real, y el token anterior deja de ser válido

#### Scenario: Un fallo de envío no bloquea el registro
- **WHEN** el envío del correo real falla (ej. el servidor SMTP no responde)
- **THEN** el registro/reenvío se completa igual, con el token disponible en la respuesta

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

### Requirement: Panel administrativo de sesiones activas de toda la plataforma

El sistema SHALL permitir a un usuario con rol `admin` consultar todas las sesiones
actualmente abiertas de la plataforma (`FACT_SESION` sin `fecha_fin`), across todos los
usuarios, distinto de la consulta de sesiones propias ya existente. El resultado SHALL
incluir el usuario, dispositivo y fecha de inicio de cada sesión abierta, y SHALL aceptar
un límite de resultados.

#### Scenario: Admin consulta las sesiones abiertas de toda la plataforma
- **WHEN** un usuario con rol `admin` solicita el panel de sesiones activas globales
- **THEN** el sistema devuelve las sesiones abiertas de todos los usuarios, no solo las del
  solicitante

#### Scenario: Un usuario sin rol admin no accede al panel global
- **WHEN** un usuario autenticado sin rol `admin` intenta consultar el panel de sesiones
  activas globales
- **THEN** el sistema rechaza la operación

### Requirement: Panel de marca público con datos reales del catálogo
El sistema SHALL mostrar, en el panel de marca de las páginas de login y registro, una composición de módulos con datos reales del catálogo, obtenidos exclusivamente de endpoints públicos que no requieren sesión iniciada: (1) un resumen de los tracks más populares (portada, nombre, artista y valor de popularidad), (2) un módulo de popularidad promedio por género, y (3) un bloque de estadísticas del catálogo (tracks totales y géneros catalogados). El sistema SHALL omitir cada módulo individualmente cuando la carga de sus datos falle, sin sustituirlo por valores inventados ni dejar la interfaz en un estado de carga indefinido, y sin que la falla de un módulo afecte a los demás.

#### Scenario: Carga exitosa del resumen de catálogo
- **WHEN** un visitante sin sesión iniciada abre la página de login o registro y la consulta de tracks más populares responde correctamente
- **THEN** el panel de marca muestra los tracks reales devueltos, cada uno con su portada, nombre, artista y valor de popularidad real

#### Scenario: Falla la carga del resumen de catálogo
- **WHEN** un visitante sin sesión iniciada abre la página de login o registro y la consulta de tracks más populares falla
- **THEN** el panel de marca omite la sección de resumen de catálogo y muestra igualmente el resto de su contenido (identidad de marca, propuesta de valor, funcionalidades), sin quedar vacío

#### Scenario: Portada individual sin resolver dentro del resumen
- **WHEN** un track del resumen de catálogo no tiene una portada real resuelta
- **THEN** el sistema muestra un reemplazo visual determinístico para ese track en vez de un espacio vacío o una imagen rota

#### Scenario: Carga exitosa de la popularidad por género
- **WHEN** un visitante sin sesión iniciada abre la página de login o registro y la consulta de géneros del catálogo responde correctamente
- **THEN** el panel de marca muestra un módulo con los géneros de mayor popularidad promedio real, cada uno con su nombre y su valor de popularidad promedio real

#### Scenario: Falla la carga de la popularidad por género
- **WHEN** un visitante sin sesión iniciada abre la página de login o registro y la consulta de géneros del catálogo falla
- **THEN** el panel de marca omite el módulo de popularidad por género y muestra igualmente el resto de su contenido, sin quedar vacío

#### Scenario: Bloque de estadísticas con datos parcialmente disponibles
- **WHEN** un visitante sin sesión iniciada abre la página de login o registro y solo una de las consultas que alimentan el bloque de estadísticas del catálogo responde correctamente
- **THEN** el sistema muestra únicamente la estadística cuyo dato real está disponible, sin mostrar la otra como cero ni como valor inventado

#### Scenario: Bloque de estadísticas sin ningún dato disponible
- **WHEN** un visitante sin sesión iniciada abre la página de login o registro y ninguna consulta del bloque de estadísticas del catálogo responde correctamente
- **THEN** el sistema omite el bloque de estadísticas por completo y muestra igualmente el resto del panel de marca

## Entradas

- Correo electrónico, contraseña, nombre, país y rol (registro).
- Correo electrónico y contraseña (login).
- Token de sesión activo (logout, operaciones administrativas).
- Recurso, acción y usuario objetivo (gestión de permisos).

## Salidas

- Token de sesión (login).
- Confirmación de registro/logout.
- Conjunto de permisos vigentes de un usuario.
- Historial de auditoría y de errores de sistema (consulta administrativa).
- Mensaje de error de autenticación o de autorización insuficiente.

## Dependencias

- **PocketBase**: colección `users` (identidad, credenciales, rol) — único almacén de credenciales, no se duplica.
- **ClickHouse**: `DIM_USUARIO`, `DIM_DISPOSITIVO`, `FACT_SESION`, `FACT_PERMISO_USUARIO`, `FACT_AUDIT_LOG`, `FACT_ERROR_SISTEMA`.

## Fuera de alcance

- Autenticación multifactor (MFA).
- Recuperación/reseteo de contraseña.
- Migración de las dependencias de autorización por rol ya existentes en otras capabilities (`require_b2c_user`, `require_b2b_panel_access`, `require_staff`) al nuevo modelo de permisos granular.
- Instrumentación retroactiva de auditoría dentro de `suscripciones`, `partners`, `catalogo` u otras capabilities existentes.
