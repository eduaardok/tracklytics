## 1. ClickHouse: tablas nuevas

- [x] 1.1 Agregar a `init_clickhouse.py` (idempotente, `CREATE TABLE IF NOT EXISTS`) `DIM_USUARIO` (`ENGINE = ReplacingMergeTree(actualizado_en) ORDER BY usuario_id`; campos: usuario_id, email, nombre, pais, fecha_registro, rol, actualizado_en) (design.md, decisión "DIM_USUARIO como espejo versionado").
- [x] 1.2 Agregar `DIM_DISPOSITIVO` (`ORDER BY (usuario_id, dispositivo_id)`; campos: dispositivo_id, usuario_id, tipo, os, app_version, primera_vez_visto).
- [x] 1.3 Agregar `FACT_SESION` (`ENGINE = ReplacingMergeTree(fecha_fin_version) ORDER BY sesion_id`; campos: sesion_id, usuario_id, dispositivo_id, fecha_inicio, fecha_fin Nullable, duracion Nullable, fecha_fin_version) (design.md, decisión "FACT_SESION con apertura/cierre").
- [x] 1.4 Agregar `FACT_PERMISO_USUARIO` (append-only; campos: usuario_id, recurso, accion, permitido, fecha_asignacion, asignado_por) (design.md, decisión "FACT_PERMISO_USUARIO con columna permitido").
- [x] 1.5 Agregar `FACT_AUDIT_LOG` (append-only; campos: audit_id UUID, usuario_id, accion, tabla_afectada, antes String, despues String, timestamp).
- [x] 1.6 Agregar `FACT_ERROR_SISTEMA` (append-only; campos: error_id UUID, codigo, mensaje, servicio, usuario_id Nullable, timestamp, resolved Bool default false).
- [x] 1.7 Ejecutar `init_clickhouse.py` contra el ClickHouse de desarrollo y verificar que las 6 tablas existen sin afectar las ya existentes.

## 2. FastAPI: paquete `seguridad` — cliente PocketBase y utilidades

- [x] 2.1 Crear `api/paquetes/seguridad/__init__.py`.
- [x] 2.2 Crear `api/paquetes/seguridad/pb_client.py` (mismo patrón que `suscripciones/pb_client.py`): `crear_usuario(email, password, nombre, pais, rol)`, `login(email, password)` contra la colección `users` de PocketBase (la validación/refresh de token ya la cubre `core.deps.get_current_user`; no se duplica aquí).
- [x] 2.3 Crear `api/paquetes/seguridad/queries.py` con las consultas de lectura (permisos vigentes vía `argMax`, historial de auditoría, historial de errores) reutilizando `core.database.query_rows`/`query_one`.
- [x] 2.4 Crear `api/paquetes/seguridad/audit.py::record(usuario_id, accion, tabla_afectada, antes, despues)` — helper de escritura a `FACT_AUDIT_LOG`, reutilizable por otras capabilities en el futuro (Non-Goal: no se llama todavía desde fuera de `seguridad`).

## 3. FastAPI: registro, login y logout

- [x] 3.1 Implementar `POST /app/v1/seguridad/auth/registro`: crea el usuario en PocketBase vía `pb_client.crear_usuario`, inserta la fila correspondiente en `DIM_USUARIO`, siembra la matriz de permisos por defecto del rol en `FACT_PERMISO_USUARIO` (RF: Registro de usuario, CU-O01).
- [x] 3.2 Rechazar el registro con un correo ya existente con un error de validación claro, sin crear una identidad duplicada (Scenario: Registro con correo ya existente).
- [x] 3.3 Implementar `POST /app/v1/seguridad/auth/login`: valida credenciales vía `pb_client.login`, en caso de éxito registra/reconoce el dispositivo en `DIM_DISPOSITIVO` (usando `dispositivo_id` enviado por el cliente) e inserta la fila de apertura en `FACT_SESION`; devuelve el mismo token/record que hoy consume `app/js/auth.js` (RF: Inicio de sesión).
- [x] 3.4 Rechazar login con credenciales incorrectas con un error de autenticación genérico, sin registrar sesión (Scenario: Login fallido).
- [x] 3.5 Implementar `POST /app/v1/seguridad/auth/logout`: invalida el token en el cliente (respuesta indicando limpieza de sesión local) e inserta la fila de cierre en `FACT_SESION` con `fecha_fin`/`duracion` calculados (RF: Cierre de sesión).
- [x] 3.6 Verificar que en ningún punto del flujo se persiste o transmite la contraseña en texto plano fuera de la llamada TLS/local a PocketBase (RF: Seguridad de credenciales).

## 4. FastAPI: gestión de permisos granulares por rol

- [x] 4.1 Definir la matriz de permisos por defecto por rol (user/analyst/admin) como constante en `paquetes/seguridad/queries.py` o `deps.py` (design.md, Open Questions).
- [x] 4.2 Implementar `paquetes/seguridad/deps.py::require_admin` (rol `admin`, reutilizando `core.deps.get_current_user`) y `require_permiso(recurso, accion)` (consulta `FACT_PERMISO_USUARIO` vía `argMax`).
- [x] 4.3 Implementar `GET /app/v1/seguridad/permisos/{usuario_id}` (solo `admin`): retorna los permisos vigentes del usuario resueltos desde `FACT_PERMISO_USUARIO`.
- [x] 4.4 Implementar `POST /app/v1/seguridad/permisos` (solo `admin`): otorga o revoca un permiso (`permitido: true/false`) insertando una nueva fila en `FACT_PERMISO_USUARIO`, y registra el cambio en `FACT_AUDIT_LOG` vía `audit.record`.
- [x] 4.5 Verificar que un usuario con rol `user`/`analyst` recibe 403 al intentar consultar o modificar permisos (Scenario: Usuario sin rol admin intenta gestionar permisos).

## 5. FastAPI: auditoría de operaciones sensibles

- [x] 5.1 Instrumentar `audit.record(...)` en el registro de usuario (alta de identidad) y en cada cambio de permiso (otorgamiento/revocación), serializando `antes`/`despues` como JSON del subconjunto de campos afectado.
- [x] 5.2 Implementar `GET /app/v1/seguridad/auditoria` (solo `admin`): retorna `FACT_AUDIT_LOG` ordenado del más reciente al más antiguo, paginado.
- [x] 5.3 Verificar que un usuario con rol `user`/`analyst` recibe 403 al intentar consultar auditoría (Scenario: Usuario sin rol admin intenta consultar auditoría).

## 6. FastAPI: captura y consulta de errores de sistema

- [x] 6.1 Registrar en `main.py` un `@app.exception_handler(Exception)` global que inserte en `FACT_ERROR_SISTEMA` (codigo=tipo de excepción, mensaje, servicio=path del request, usuario_id si `request.state` tiene sesión resuelta, timestamp) dentro de un `try/except` silencioso (design.md, mismo patrón que `partner_call_logger`), y responda 500 genérico al cliente sin exponer detalles internos.
- [x] 6.2 Implementar `GET /app/v1/seguridad/errores` (solo `admin`): retorna `FACT_ERROR_SISTEMA` ordenado del más reciente al más antiguo, incluyendo `resolved`.
- [x] 6.3 Verificar que un usuario con rol `user`/`analyst` recibe 403 al intentar consultar errores de sistema (Scenario: Usuario sin rol admin intenta consultar errores de sistema).
- [x] 6.4 Montar `seguridad_router` en `api/main.py` junto al resto de routers.

## 7. Frontend: migrar autenticación a los nuevos endpoints (BREAKING)

- [x] 7.1 Actualizar `app/js/api.js`: reemplazar `pbLogin`/`pbRegister`/`pbGetUser` (llamadas directas a PocketBase) por llamadas a `/app/v1/seguridad/auth/registro`, `/app/v1/seguridad/auth/login`, `/app/v1/seguridad/auth/logout`.
- [x] 7.2 Generar y persistir `dispositivo_id` (`crypto.randomUUID()`) en `localStorage` en el primer acceso, enviarlo en el login (design.md, decisión "DIM_DISPOSITIVO identificado por un id de dispositivo generado en cliente").
- [x] 7.3 Actualizar `app/js/auth.js` (`login`, `register`, `logout`) para consumir las nuevas funciones de `api.js`, manteniendo la misma interfaz pública (`getSession`, `getRole`, `isLoggedIn`, `requireAuth`, `requireRole`) sin romper a sus consumidores actuales (`login.html`, `register.html`, `planes.html`, etc.).
- [x] 7.4 Ajustar `app/autenticacion/login.html` y `app/autenticacion/register.html` si el contrato de errores cambia de forma (mensajes de PocketBase vs. mensajes de FastAPI).

## 8. Frontend: completar el paquete `seguridad` en `frontend/src/packages/seguridad/`

- [x] 8.1 Definir `types.ts` (Usuario, Sesion, Permiso, AuditLog, ErrorSistema) reflejando los campos de `DIM_USUARIO`/`FACT_SESION`/`FACT_PERMISO_USUARIO`/`FACT_AUDIT_LOG`/`FACT_ERROR_SISTEMA`.
- [x] 8.2 Implementar `api/` con llamadas tipadas a los endpoints nuevos (`/app/v1/seguridad/*`).
- [x] 8.3 Implementar `pages/` mínimas para el actor `admin`: gestión de permisos, vista de auditoría, vista de errores de sistema.
- [x] 8.4 Exponer únicamente lo necesario desde `index.ts`, siguiendo la regla de aislamiento ya documentada en el README del stub.

## 9. Verificación end-to-end

- [x] 9.1 Verificar registro exitoso y registro con correo duplicado (curl contra `/app/v1/seguridad/auth/registro`), confirmando fila en `DIM_USUARIO` y permisos sembrados en `FACT_PERMISO_USUARIO`.
- [x] 9.2 Verificar login exitoso y login fallido (curl contra `/app/v1/seguridad/auth/login`), confirmando fila de apertura en `FACT_SESION` en el caso exitoso.
- [x] 9.3 **Integration test — interoperabilidad con `analitica` v1 (design.md, "El token que valida `analitica`... "):** con el `token` devuelto por 9.2, hacer `GET /app/v1/analitica/artistas/search?nombre=...` con `Authorization: Bearer <token>` y confirmar 200 (ya no 401), demostrando que el token es el JWT de PocketBase validado por `core.deps.get_current_user` vía `auth-refresh` — sin pasar por `FACT_SESION`/`DIM_USUARIO`. Repetir la llamada tras insertar manualmente una fila de cierre en `FACT_SESION` para esa sesión (simulando un log de auditoría desincronizado) y confirmar que sigue devolviendo 200: prueba explícita de que la autorización no depende de `FACT_SESION`.
- [x] 9.4 Verificar logout (curl contra `/app/v1/seguridad/auth/logout`), confirmando que `FACT_SESION` refleja `fecha_fin`/`duracion` para esa sesión.
- [x] 9.5 Verificar gestión de permisos: consulta, otorgamiento y revocación como `admin`, y rechazo 403 como `user`/`analyst`.
- [x] 9.6 Verificar que un cambio de permiso queda reflejado en `FACT_AUDIT_LOG` y es consultable vía `/app/v1/seguridad/auditoria`.
- [x] 9.7 Forzar una excepción no controlada (p. ej. endpoint de prueba o parámetro inválido no capturado) y verificar que queda registrada en `FACT_ERROR_SISTEMA` y es consultable vía `/app/v1/seguridad/errores`.
- [x] 9.8 Verificar en el navegador el flujo completo de `login.html`/`register.html` contra los nuevos endpoints, confirmando que no quedan llamadas directas del frontend a PocketBase para auth.
