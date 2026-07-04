# Capability: seguridad

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

## ADDED Requirements

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
El sistema SHALL permitir a un usuario con rol `admin` consultar y modificar los permisos granulares (recurso, acción) asignados a un usuario, además de la matriz por defecto de cada rol (user/analyst/admin). Cada cambio SHALL quedar registrado en `FACT_PERMISO_USUARIO` sin sobrescribir el historial previo.

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

### Requirement: Auditoría de operaciones sensibles
El sistema SHALL registrar en `FACT_AUDIT_LOG` cada operación sensible realizada dentro de esta capability (registro de usuario, cambio de rol, otorgamiento o revocación de permisos), incluyendo el usuario que ejecutó la acción, la acción, la tabla afectada y el estado antes/después.

#### Scenario: Registro de auditoría en un cambio de permiso
- **WHEN** un usuario con rol `admin` otorga o revoca un permiso
- **THEN** el sistema registra en `FACT_AUDIT_LOG` el usuario que ejecutó el cambio, la acción realizada, la tabla afectada y el estado antes/después del permiso

#### Scenario: Consulta del registro de auditoría
- **WHEN** un usuario con rol `admin` solicita el historial de auditoría
- **THEN** el sistema retorna los registros de `FACT_AUDIT_LOG` ordenados del más reciente al más antiguo

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

#### Scenario: Usuario sin rol admin intenta consultar errores de sistema
- **WHEN** un usuario con rol `user` o `analyst` intenta consultar el registro de errores de sistema
- **THEN** el sistema rechaza la operación indicando que la consulta de errores es exclusiva de `admin`

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
