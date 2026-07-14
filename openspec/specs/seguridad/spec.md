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
