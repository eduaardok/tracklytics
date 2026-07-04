## Why

Hoy la identidad de usuario, los roles (user/analyst/admin) y las sesiones viven exclusivamente en PocketBase, consumidos por el resto de la API a través de `core.deps.get_current_user` (validación de token vía `auth-refresh`). No existe una capability propia que gobierne el ciclo de vida de la identidad ni que deje rastro operativo (sesiones, permisos, auditoría, errores de sistema) en ClickHouse, pese a que el modelo de datos de negocio del proyecto exige que esa información también exista como tablas relacionadas al contexto del negocio (RT-06). Además, el front actualmente llama a PocketBase directamente desde el navegador (`pbLogin`/`pbRegister` en `app/js/api.js`) en vez de pasar por FastAPI, rompiendo el patrón ya usado por el resto de capabilities (`suscripciones`, `partners`) de encapsular PocketBase detrás de un paquete backend propio.

## What Changes

- Endpoints FastAPI de registro y login que emiten un token/sesión real (proxy sobre la autenticación nativa de PocketBase, reutilizando el mecanismo ya validado en producción, sin reimplementar hashing de contraseñas).
- Middleware/hook de auditoría que registra en ClickHouse cada operación sensible (cambio de rol, cambio de permiso, cancelación de suscripción, alta de partner, etc.) con actor, acción, tabla afectada, estado antes/después.
- Registro de sesión (login/logout) y de dispositivo en ClickHouse, con vínculo al usuario.
- Modelo de permisos granular por rol (RBAC), consultable y administrable por `admin`, con matriz base seed para los 3 roles ya usados en el resto del código (user/analyst/admin).
- Captura centralizada de errores de sistema (excepciones no controladas de FastAPI) con registro en ClickHouse, correlacionado por servicio y usuario cuando aplique.
- **BREAKING**: el frontend deja de llamar a PocketBase directamente para login/registro; pasa a consumir `/app/v1/seguridad/auth/*`. Requiere actualizar `app/js/api.js` y `app/js/auth.js`.

## Capabilities

### New Capabilities
- `seguridad`: identidad de usuario, autenticación, permisos por rol, auditoría de operaciones sensibles y registro de errores de sistema, con paquete backend `api/paquetes/seguridad/` y stub frontend `frontend/src/packages/seguridad/`.

### Modified Capabilities
- `catalogo`: los requisitos "Registro de usuario", "Inicio de sesión", "Cierre de sesión" y "Seguridad de credenciales" (CU-O01) se retiran de `catalogo` y pasan a `seguridad`, que es su dueño natural. `catalogo` conserva el resto de sus requisitos (búsqueda, detalle, favoritos, playlists, historial) sin cambios; solo deja de reclamar la propiedad del flujo de autenticación, que hoy vive de facto fuera de su paquete backend (`api/paquetes/catalogo/` no contiene código de auth).

## Impact

- **ClickHouse**: nuevas tablas `DIM_USUARIO`, `DIM_DISPOSITIVO`, `FACT_SESION`, `FACT_PERMISO_USUARIO`, `FACT_AUDIT_LOG`, `FACT_ERROR_SISTEMA` (excepción deliberada a RT-05: dominio operativo/transaccional modelado en el almacén analítico — documentado como fricción arquitectónica en design.md).
- **PocketBase**: sigue siendo el único almacén de credenciales (password hashing, emisión/refresh de token); no se duplica ni se reemplaza.
- **FastAPI**: nuevo paquete `api/paquetes/seguridad/` (router, deps, pb_client, queries) montado en `main.py`; nueva dependencia de autorización granular disponible para que otras capabilities la adopten progresivamente (no se migra el resto del código en este cambio).
- **Frontend**: `app/js/api.js`/`app/js/auth.js` pasan a llamar a FastAPI en vez de PocketBase directo; stub `frontend/src/packages/seguridad/` se completa.
- **Dependencia externa**: ninguna — a diferencia de `partners` (CU-T03 pendiente), aquí PocketBase ya tiene la colección `users` con `role` funcionando.
