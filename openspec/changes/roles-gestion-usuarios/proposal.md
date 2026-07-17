## Why

La autorización administrativa de Tracklytics es hoy monolítica: ~50 endpoints `/admin/*` de 15 capabilities comparten un único check (`role == "admin"`), de modo que cualquier administrador puede liquidar regalías, moderar comentarios, cambiar precios de planes y aprobar artistas indistintamente — sin separación por área de negocio ni rastro de quién puede qué. Además faltan piezas básicas de gobierno de identidad que el negocio ya necesita: gestión de usuarios desde el propio sistema, bloqueo por intentos fallidos, recuperación de contraseña y baja de cuenta propia.

## What Changes

- **Catálogo de roles administrativos por área de negocio**: se introducen seis roles (`superadmin`, `admin_finanzas`, `admin_contenido`, `admin_comunidad`, `admin_datos`, `admin_comercial`), cada uno con un alcance acotado de capabilities. `superadmin` conserva el poder del `admin` actual.
- **Autorización administrativa segmentada**: los ~50 endpoints `/admin/*` pasan de un check monolítico a uno por rol de área. `superadmin` siempre pasa (backward compatible); las cuentas `admin` de PocketBase se mapean automáticamente a `superadmin` al iniciar sesión, sin migración manual.
- **Panel de gestión de usuarios**: listado paginado con filtros, vista 360° de un usuario (perfil, roles, suscripción, transacciones, sesiones, permisos, último acceso), asignación/revocación de roles administrativos, y suspensión/reactivación de cuentas.
- **Bloqueo por intentos fallidos** en el inicio de sesión (≥5 fallos en 15 minutos → bloqueo temporal).
- **Recuperación de contraseña** vía token de un solo uso (sin envío de correo real, patrón de simulación del proyecto).
- **Baja de cuenta propia**: el usuario puede solicitar la eliminación de su cuenta, que invalida sus sesiones y cancela su suscripción, conservando los datos analíticos históricos.
- **Estado de cuenta** (`activa` / `suspendido` / `eliminado`) como nuevo atributo de identidad que el middleware de autenticación verifica en cada request.

## Capabilities

### New Capabilities

(ninguna — es una extensión de la capability existente `seguridad`)

### Modified Capabilities

- `seguridad`: se añaden los roles administrativos por área, la gestión de usuarios (vista 360°, roles admin, suspensión/reactivación), el bloqueo por intentos fallidos, la recuperación de contraseña y la baja de cuenta propia; se refina el gating administrativo de los endpoints existentes.

## Impact

- **Código backend**: `api/paquetes/seguridad/` (nuevo dependency `require_rol_admin`, endpoints de gestión de usuarios, lockout, recuperación, baja), `api/core/deps.py` (verificación de `estado_cuenta` en `get_current_user`), y las dependencias de gating en los routers `/admin/*` de `creadores`, `distribucion`, `social`, `experiencia`, `facturacion`, `finanzas`, `regalias`, `publicidad`, `suscripciones`, `gestion_datos`, `partners`, `simulacion`.
- **Datos (ClickHouse `tracklytics`)**: 3 tablas nuevas (`DIM_ROL_ADMINISTRATIVO`, `BRIDGE_USUARIO_ROL_ADMIN`, `FACT_TOKEN_RECUPERACION`) y una columna nueva `estado_cuenta` en `DIM_USUARIO`.
- **Frontend**: nueva página `UsuariosAdminPage.tsx` (ruta `/seguridad/usuarios`), enlace de recuperación de contraseña en `LoginPage.tsx`, y botón de baja de cuenta en `ProfilePage.tsx`.
- **Sin cambios en PocketBase**: los roles administrativos viven en ClickHouse; PocketBase conserva sus roles `user` / `analyst` / `admin`.
- **Compatibilidad**: no rompe el acceso de las cuentas `admin` existentes ni el sistema de permisos granular (`require_permiso`), que sigue conviviendo.
