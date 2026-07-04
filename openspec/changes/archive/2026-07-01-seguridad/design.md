## Context

Hoy la identidad (`DIM_USUARIO` conceptual), los roles y las credenciales viven únicamente en la colección `users` de PocketBase, con `role` (user/analyst/admin) como campo de texto agregado por `pb_init.py`. Todo el resto de la API (`suscripciones`, `analitica`, `biblioteca`, `partners`) valida sesión llamando a `core.deps.get_current_user`, que reenvía el Bearer token a `POST {PB_URL}/api/collections/users/auth-refresh`. Ese mecanismo funciona y es la razón por la que analítica v1 devuelve 401 sin token — comportamiento esperado, no un bug. El frontend, sin embargo, llama a PocketBase directo desde el navegador (`pbLogin`/`pbRegister`/`pbGetUser` en `app/js/api.js`), sin pasar por FastAPI, a diferencia del patrón ya establecido para el resto de operaciones de escritura (`suscripciones/pb_client.py`, `partners/pb_client.py`).

El modelo de datos de negocio del proyecto exige, además, que la identidad, las sesiones, los permisos, la auditoría y los errores de sistema existan como tablas relacionadas al contexto del negocio en ClickHouse (RT-06). Esto entra en fricción directa con RT-05 ("ClickHouse es la única fuente analítica principal"): identidad, sesiones y permisos son por naturaleza datos operativos/transaccionales (mutables, con necesidad de lectura consistente por PK), no analíticos. ClickHouse (MergeTree) no ofrece `UPDATE`/`DELETE` baratos ni constraints de unicidad — el motor está optimizado para inserciones append-only e inmutabilidad. Esta capability asume esa fricción a propósito (excepción deliberada documentada aquí, no un error de diseño) en vez de introducir una segunda base de datos transaccional (PostgreSQL) que el stack obligatorio del proyecto prohíbe.

## Goals / Non-Goals

**Goals:**
- Exponer registro/login/logout vía FastAPI (`api/paquetes/seguridad/`), reusando PocketBase como único almacén de credenciales (password hashing, emisión y refresh de token) — sin reimplementar autenticación.
- Reflejar identidad, dispositivos y sesiones en ClickHouse (`DIM_USUARIO`, `DIM_DISPOSITIVO`, `FACT_SESION`) para que el resto del modelo de negocio pueda unirse (JOIN) contra ellas.
- Definir y exponer un modelo de permisos granular (`FACT_PERMISO_USUARIO`) por rol, administrable por `admin`, con matriz semilla para user/analyst/admin.
- Registrar auditoría (`FACT_AUDIT_LOG`) de las operaciones sensibles que esta misma capability introduce (cambios de rol, alta/baja de permisos).
- Capturar errores de sistema no controlados de FastAPI en `FACT_ERROR_SISTEMA`, de forma transversal a toda la API.

**Non-Goals:**
- No se reemplaza PocketBase como almacén de contraseñas ni se mueve el hashing a ClickHouse — sería inseguro y ClickHouse no ofrece esa garantía nativamente.
- No se migran las dependencias de autorización ya existentes en otras capabilities (`require_b2c_user`, `require_b2b_panel_access`, `require_staff` en `core/deps.py` y `paquetes/analitica/deps.py`) al nuevo modelo de permisos granular — siguen funcionando por rol como hoy; esta capability solo introduce el mecanismo y lo aplica a sus propios endpoints administrativos. Migrar el resto del código es trabajo futuro, fuera de alcance.
- No se instrumenta retroactivamente auditoría dentro de `suscripciones`, `partners`, `catalogo`, etc. — esta capability expone un helper (`paquetes.seguridad.audit.record(...)`) que otras capabilities podrán adoptar en cambios futuros; aquí solo se usa dentro de `seguridad` mismo.
- No se implementa MFA (mencionado en el README stub del frontend como aspiración futura) ni recuperación de contraseña — fuera del alcance mínimo pedido.

## Decisions

### PocketBase sigue siendo el único almacén de credenciales; FastAPI actúa como proxy delgado
`api/paquetes/seguridad/pb_client.py` reutiliza el mismo patrón que `suscripciones/pb_client.py`: llamadas HTTP a PocketBase (`auth-with-password`, `records` POST para alta, `auth-refresh` para logout/validación). El registro/login "real" con token que analítica v1 necesita sigue siendo un token de PocketBase — no se emite un token propio. Alternativa descartada: emitir JWT propios firmados por FastAPI — se rechaza porque duplicaría la lógica de sesión ya resuelta por PocketBase y rompería `core.deps.get_current_user`, usado por todo el resto de la API.

### El token que valida `analitica` (y el resto de la API) es el token de PocketBase, sin intermediación de FACT_SESION

Para eliminar cualquier ambigüedad: `seguridad` **no** introduce un segundo mecanismo de sesión ni un token propio que otras capabilities deban aprender a validar. La cadena completa, de login a una llamada protegida, es:

1. `POST /app/v1/seguridad/auth/login {email, password}` → `pb_client.login()` llama a `POST {PB_URL}/api/collections/users/auth-with-password`. PocketBase valida el password (su propio hashing) y devuelve `{token, record}`; ese `token` es un JWT **firmado por PocketBase**, FastAPI no lo toca ni lo reemite.
2. El endpoint de login, tras la respuesta exitosa de PocketBase, hace dos escrituras de bookkeeping en ClickHouse (`DIM_DISPOSITIVO` upsert, fila de apertura en `FACT_SESION`) keyed por `record.id`. Estas escrituras son efectos secundarios de auditoría — nunca alteran ni envuelven el `token`.
3. El endpoint responde al cliente con el mismo `{token, record}` recibido de PocketBase (pass-through), igual que hoy hace `pbLogin()` en `app/js/api.js`.
4. El cliente guarda ese `token` (`localStorage['pb_token']`) y lo envía como `Authorization: Bearer <token>` en `GET /app/v1/analitica/artistas/search`.
5. `require_b2b_panel_access` → `Depends(get_current_user)` (`core/deps.py`, sin cambios) reenvía ese mismo token a `POST {PB_URL}/api/collections/users/auth-refresh`. **PocketBase valida su propio JWT** — este paso no consulta ClickHouse, no consulta `FACT_SESION` ni `DIM_USUARIO`.
6. Si PocketBase acepta el token, `get_current_user` devuelve `{token, record}` y `require_b2b_panel_access` autoriza según `record.role` (mismo código de hoy, sin cambios).

Consecuencia explícita: `FACT_SESION`/`DIM_USUARIO` son un log analítico/de auditoría de solo escritura desde el punto de vista de autorización — si su inserción fallara o quedara desincronizada, el login y el acceso a `analitica` v1 no se verían afectados, porque nada en la cadena de autorización los lee. Alternativa descartada: que `require_b2b_panel_access` (o una nueva dependencia) valide la sesión contra `FACT_SESION` en vez de (o además de) `auth-refresh` — se rechaza porque acoplaría la disponibilidad de ClickHouse a la autenticación de cada request, cuando hoy esa autenticación solo depende de PocketBase.

### DIM_USUARIO como espejo versionado de la identidad (ReplacingMergeTree)
`DIM_USUARIO` se declara `ENGINE = ReplacingMergeTree(actualizado_en) ORDER BY usuario_id`. Cada registro/cambio de perfil o de rol inserta una fila nueva (nunca `UPDATE`); las lecturas analíticas usan `FINAL` o `argMax(..., actualizado_en)` para resolver la versión vigente. Esto documenta explícitamente la fricción RT-05: identidad es conceptualmente mutable (un `UPDATE` en un modelo transaccional), pero se modela como serie de versiones inmutables para encajar en MergeTree. Alternativa descartada: `ALTER TABLE ... UPDATE` (mutación asíncrona de ClickHouse) — se rechaza por ser una operación pesada, no transaccional y con latencia impredecible, inadecuada para un cambio de rol que debe reflejarse de inmediato en la siguiente request.

### FACT_SESION con apertura/cierre como dos inserciones versionadas
El login inserta una fila con `fecha_inicio`, `fecha_fin = NULL`, `duracion = NULL`. El logout inserta una segunda fila con el mismo `sesion_id` y `fecha_fin`/`duracion` calculados. La tabla usa `ReplacingMergeTree(fecha_fin_version)` (columna de versión que solo la fila de cierre incrementa) `ORDER BY sesion_id`, de modo que `FINAL`/`argMax` resuelve a la fila de cierre cuando existe. Una sesión sin logout explícito (cierre de navegador, expiración de token) queda con `fecha_fin`/`duracion` en `NULL` indefinidamente — comportamiento aceptado y documentado, no un bug: no existe heartbeat de sesión en este alcance. Alternativa descartada: solo insertar una fila al final de la sesión (tras detectar el logout) — se rechaza porque pierde el registro de sesiones abandonadas, que es justamente lo que un log de seguridad necesita mostrar.

### DIM_DISPOSITIVO identificado por un id de dispositivo generado en cliente
Al no existir apps nativas (solo frontend web vanilla), el "dispositivo" se identifica con un `dispositivo_id` (UUID) generado con `crypto.randomUUID()` en el primer acceso y persistido en `localStorage`; `tipo` se fija en `"web"`, `os` se infiere server-side del header `User-Agent` (nunca confiado del body, ya que el cliente no debe declarar su propio SO), y `app_version` es una constante de build del frontend enviada por el cliente. Alternativa descartada: fingerprinting de dispositivo más sofisticado (canvas fingerprint, etc.) — fuera de alcance y con implicaciones de privacidad no justificadas para un proyecto académico.

### FACT_PERMISO_USUARIO con columna `permitido` explícita, no solo altas
Aunque el enunciado del modelo de negocio describe `FACT_PERMISO_USUARIO` como `(usuario_id, recurso, accion, fecha_asignacion)`, el diseño agrega `permitido: Bool` y `asignado_por: String` para poder representar tanto la concesión como la revocación de un permiso sin `DELETE` (cada cambio es una fila nueva; el estado vigente de un permiso se resuelve con `argMax(permitido, fecha_asignacion)` por `(usuario_id, recurso, accion)`). Al registrarse un usuario se siembra la matriz de permisos por defecto de su rol (constante en código, no en tabla — ver Open Questions). Alternativa descartada: modelar solo altas y borrar filas al revocar — se rechaza porque ClickHouse no soporta `DELETE` eficiente y porque perder el historial de revocaciones contradice el propósito de auditoría de esta misma capability.

### FACT_AUDIT_LOG y FACT_ERROR_SISTEMA son append-only puro — sin fricción
A diferencia de identidad/sesión/permisos, estas dos tablas son un log de eventos inmutable por naturaleza (un cambio de rol o un error ya ocurrió y no se modifica retroactivamente), por lo que encajan en MergeTree sin ningún ajuste — mismo patrón que `LOG_LLAMADAS_PARTNER`/`FACT_ENGAGEMENT_USUARIO` ya usado en el proyecto. `antes`/`despues` en `FACT_AUDIT_LOG` se serializan como JSON (`String`) del subconjunto de campos afectado, no del registro completo.

### Captura de errores de sistema vía exception handler global en FastAPI
`FACT_ERROR_SISTEMA` se alimenta desde un `@app.exception_handler(Exception)` registrado una sola vez en `main.py`, que registra `codigo` (tipo de excepción), `mensaje`, `servicio` (path del router que la originó), `usuario_id` (si `request.state` tiene sesión resuelta) y responde igualmente 500 al cliente. Es la única pieza de esta capability que toca `main.py` de forma transversal; no se modifica el código de negocio de otros paquetes. `resolved` se deja en `false` por defecto — su actualización a `true` es una operación administrativa manual (fuera de alcance de este cambio, ver Open Questions).

### Autorización granular nueva, adopción progresiva
Se agrega `paquetes/seguridad/deps.py::require_permiso(recurso, accion)`, que consulta `FACT_PERMISO_USUARIO` (vía `argMax`) además de mantener el chequeo por rol ya usado en el resto del proyecto. Se aplica únicamente a los endpoints administrativos nuevos de `seguridad` (gestión de permisos, consulta de auditoría, consulta de errores) — no reemplaza `require_b2b_panel_access`/`require_staff`/`require_b2c_user` en otras capabilities.

## Risks / Trade-offs

- [Riesgo] Un cambio de rol en `DIM_USUARIO` (nueva versión insertada) puede tardar hasta que ClickHouse fusione partes para que `FINAL` sea barato en lectura frecuente → Mitigación: el rol autoritativo para autorización sigue siendo el de PocketBase (leído en cada request vía `get_current_user`), no `DIM_USUARIO`; esta tabla es un espejo analítico/de auditoría, nunca la fuente de verdad para decisiones de acceso en caliente.
- [Riesgo] Sesiones sin logout (cierre de navegador) quedan con `fecha_fin`/`duracion` en `NULL` permanentemente, sesgando reportes de duración promedio → Mitigación: documentado como comportamiento esperado (no hay heartbeat de sesión en este alcance); cualquier reporte de duración debe filtrar explícitamente `fecha_fin IS NOT NULL`.
  **Nota para capabilities futuras**: `FACT_SESION` no define ni impone ninguna noción de expiración/staleness — una fila sin `fecha_fin` es indistinguible entre "sesión activa ahora mismo" y "sesión abandonada hace semanas". Cualquier capability futura que necesite calcular duración de sesión o "usuarios activos" a partir de esta tabla (p. ej. métricas de engagement de una futura capability `experiencia`) deberá definir su propia lógica de TTL/staleness (p. ej. "sin `fecha_fin` y `fecha_inicio` > hace N horas ⇒ se considera cerrada/abandonada") — `seguridad` no la provee ni la va a proveer dentro de este cambio.
- [Riesgo] `require_permiso` granular y los chequeos por rol existentes pueden divergir con el tiempo (dos mecanismos de autorización conviviendo) → Mitigación: aceptado como Non-Goal explícito de este cambio; el mecanismo nuevo solo gobierna los endpoints propios de `seguridad`, sin tocar el resto del código.
- [Riesgo] El exception handler global podría enmascarar errores si falla la propia inserción a `FACT_ERROR_SISTEMA` → Mitigación: la escritura a ClickHouse se envuelve en `try/except` silencioso (mismo patrón que `partner_call_logger`), nunca bloquea ni altera la respuesta 500 real al cliente.
- [Riesgo] El proxy de registro/login en FastAPI agrega un salto de red adicional (FastAPI → PocketBase) donde antes el navegador iba directo → Mitigación: es el mismo patrón ya validado en `suscripciones`/`partners` (latencia local dentro de la red de Docker Compose, no perceptible).

## Migration Plan

1. Crear las 6 tablas nuevas en `init_clickhouse.py` (idempotente, `CREATE TABLE IF NOT EXISTS`, sin afectar tablas existentes).
2. Desplegar `api/paquetes/seguridad/` y montarlo en `main.py` (nuevo router, nuevo exception handler global).
3. Actualizar `app/js/api.js`/`app/js/auth.js` para apuntar a `/app/v1/seguridad/auth/*` en vez de PocketBase directo — **BREAKING** para el frontend, sin cambios de contrato hacia PocketBase (la colección `users` no cambia de forma).
4. Los usuarios ya existentes en PocketBase no tienen fila en `DIM_USUARIO`/`FACT_PERMISO_USUARIO` hasta su próximo login: el login backfillea `DIM_USUARIO` (upsert por versión) y siembra permisos por defecto si no existen, evitando una migración batch manual.
5. Despliegue vía `docker compose up`, sin pasos manuales adicionales (consistente con el resto del proyecto).

## Open Questions

- La matriz de permisos por defecto por rol (qué `recurso`/`accion` recibe cada uno de user/analyst/admin al registrarse) se define como constante en código (`paquetes/seguridad/deps.py` o `queries.py`) en la fase de implementación — no está fijada en este documento porque depende del catálogo final de recursos/acciones de cada capability, que excede el alcance de `seguridad`.
- La resolución (`resolved = true`) de un error en `FACT_ERROR_SISTEMA` como flujo administrativo (¿endpoint dedicado? ¿solo consulta?) queda abierta; este cambio solo garantiza el registro y la consulta de errores, no su gestión completa de ciclo de vida.
