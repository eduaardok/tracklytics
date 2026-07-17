# Bitácora de Desarrollo — Semana 11, Bloque P0
**Proyecto:** Tracklytics v2 — Plataforma de Analítica Musical
**Semana académica:** 11 de 16
**Fecha:** 16–17 de julio de 2026
**Alcance:** gobierno de identidad y autorización administrativa — change OpenSpec `roles-gestion-usuarios`
(extensión de la capability `seguridad`, sin capabilities nuevas).

---

## Resumen ejecutivo

Hasta este bloque, la autorización administrativa de Tracklytics era monolítica: ~50 endpoints
`/admin/*` de 15 capabilities compartían un único check (`role == "admin"`), de modo que cualquier
administrador podía liquidar regalías, moderar comentarios, cambiar precios de planes y aprobar
artistas indistintamente. El change `roles-gestion-usuarios` introduce un catálogo de **seis roles
administrativos por área de negocio**, migra el gating a esos roles sin romper el acceso de las
cuentas `admin` existentes, y agrega las piezas de gobierno de identidad que faltaban: gestión de
usuarios desde el sistema (vista 360°, suspender/reactivar, asignar/revocar roles), bloqueo por
intentos fallidos, recuperación de contraseña simulada y baja de cuenta propia.

Todo se implementó como extensión de `seguridad` (no se creó ninguna capability nueva) y se verificó
de punta a punta contra el stack real levantado con `docker compose up` (6 escenarios curl, todos en
verde).

---

## Decisiones de arquitectura

### 1. `require_rol_admin(*roles)` reemplaza al `require_admin` monolítico, con retrocompatibilidad
La mayoría de capabilities ya **importaban y reexportaban** un único `require_admin`
(`api/paquetes/seguridad/deps.py`) en su propio `deps.py`, en vez de duplicarlo. Esa centralización
fue la palanca del cambio: se introdujo `require_rol_admin(*roles_permitidos)` en el mismo módulo, y
la migración de cada capability se redujo a redefinir su reexport (`require_admin =
require_rol_admin("admin_finanzas")`, etc.), **sin editar línea por línea cada router**.
`require_admin` se conserva como alias delgado de `require_rol_admin("superadmin")` para no romper
imports existentes; revertir un router a `Depends(require_admin)` restaura su comportamiento previo
sin tocar datos.

### 2. `admin` de PocketBase → `superadmin` por auto-backfill (backward compatible)
`superadmin` es el equivalente al `admin` general previo. Toda cuenta con `role == "admin"` en
PocketBase queda reflejada con `superadmin` en `BRIDGE_USUARIO_ROL_ADMIN` de forma automática al
resolver la autorización (mismo patrón best-effort que el backfill de `DIM_USUARIO` en el login), sin
migración manual y sin que ningún administrador existente pierda acceso.

### 3. Resolución de estado con `argMax`, sin `OPTIMIZE FINAL`
Los roles vigentes (revocación = borrado lógico) y el `estado_cuenta` vigente se resuelven con
`argMax` por clave, igual que `FACT_PERMISO_USUARIO`/`FACT_SESION` — nunca filtrando la tabla cruda
del `ReplacingMergeTree`. Durante la verificación se reprodujo el gotcha de aliasing de ClickHouse
(`max(fecha) AS fecha` reescribe el `fecha` interno de `argMax` → agregación anidada ilegal, Code
184), el mismo ya documentado en `PERMISOS_VIGENTES`; se corrigió renombrando el alias agregado.

### 4. `estado_cuenta` verificado en cada request
PocketBase no conoce el estado de cuenta; vive solo en el espejo `DIM_USUARIO`. `get_current_user`
(`api/core/deps.py`) lo verifica en cada petición autenticada y rechaza con 403 una cuenta
`suspendido`/`eliminado` aunque su token de PocketBase siga siendo válido. Lectura inline (sin
importar de `paquetes`) para no invertir la capa; fail-open ante fallo de lectura de ClickHouse.

### 5. Lockout sobre `FACT_AUDIT_LOG`, sin tabla nueva
Los intentos fallidos se registran como `accion='login_fallido'` (con `usuario_id = email`, porque
un login fallido no tiene identidad resuelta). Antes de autenticar contra PocketBase se cuentan los
fallos del email en los últimos 15 min; ≥5 → 429. Reusar la tabla de auditoría evita una tabla
dedicada y deja rastro consultable.

### 6. Recuperación de contraseña simulada con token de un solo uso
`POST /auth/recuperar` responde **siempre** genérico (no revela si el correo existe); solo genera
token cuando el correo corresponde a un usuario real. `POST /auth/restablecer` valida token no
vencido/no usado, cambia la contraseña vía la API de superusuario de PocketBase (sin `oldPassword`,
porque el token ya validó la identidad) y marca el token como usado (fila nueva con `usado=1`,
resuelta por `argMax`). No se envía correo real (patrón de simulación del proyecto).

---

## Tablas creadas (ClickHouse `tracklytics`)

| Tabla | Motor | Propósito |
|---|---|---|
| `DIM_ROL_ADMINISTRATIVO` | ReplacingMergeTree | Catálogo cerrado de los 6 roles admin y su alcance de capabilities. Sembrada en `init_clickhouse.py`. |
| `BRIDGE_USUARIO_ROL_ADMIN` | MergeTree | Asignaciones usuario→rol admin. Revocación = borrado lógico (`revocado=1`, `fecha` mayor). |
| `FACT_TOKEN_RECUPERACION` | MergeTree | Tokens de recuperación de contraseña de un solo uso, con vencimiento. |

Además: `ALTER TABLE DIM_USUARIO ADD COLUMN IF NOT EXISTS estado_cuenta String DEFAULT 'activa'`
(valores `activa` / `suspendido` / `eliminado`).

Total de tablas físicas: 68 → **71**.

## Catálogo de roles

| rol_admin | display | capabilities |
|---|---|---|
| `superadmin` | Superadministrador | todas |
| `admin_finanzas` | Gerente Financiero / CFO | facturacion, finanzas, regalias, publicidad |
| `admin_contenido` | Gerente de Contenido / A&R | creadores, distribucion, catalogo |
| `admin_comunidad` | Community Manager | social, experiencia |
| `admin_datos` | Lead Data Engineer | gestion_datos, analitica |
| `admin_comercial` | Director Comercial | suscripciones, partners |

---

## Endpoints agregados / modificados

**Nuevos (capability `seguridad`, prefijo `/app/v1/seguridad`):**
- `GET /admin/roles-admin` — catálogo de roles administrativos
- `GET /admin/usuarios` — listado paginado con filtros (rol, estado, fecha)
- `GET /admin/usuarios/{id}` — vista 360° (perfil, roles admin, suscripción, transacciones, sesiones, permisos, último login)
- `POST /admin/usuarios/{id}/rol-admin` — asignar rol administrativo (auditado)
- `DELETE /admin/usuarios/{id}/rol-admin/{rol}` — revocar rol administrativo (auditado)
- `POST /admin/usuarios/{id}/suspender` · `POST /admin/usuarios/{id}/reactivar`
- `POST /auth/recuperar` · `POST /auth/restablecer`
- `POST /perfil/baja`

**Modificados:**
- `POST /auth/login` — lockout por intentos fallidos + verificación de `estado_cuenta`
- `get_current_user` (`core/deps.py`) — rechazo de cuentas suspendidas/eliminadas
- Gating `/admin/*` migrado a rol de área en 12 capabilities: `creadores`, `distribucion`,
  `social`, `experiencia`, `facturacion`, `finanzas`, `regalias`, `publicidad`, `suscripciones`,
  `gestion_datos`, `partners`, `simulacion`/`seguridad` (estas dos ya bajo `superadmin`).

**Frontend:** `UsuariosAdminPage.tsx` (ruta `/seguridad/usuarios`, con vista 360° y gestión de
roles/estado) + entrada en `SeguridadShell`; enlace de recuperación de contraseña y flujo
recuperar/restablecer en `LoginPage`; baja de cuenta con confirmación doble en `ProfilePage`.

---

## Verificación

Stack levantado con `docker compose up`; la imagen `init-db` se reconstruyó para aplicar las 3
tablas nuevas + `estado_cuenta` (105/105 sentencias OK, `DIM_ROL_ADMINISTRATIVO` sembrada). El
servicio `api` monta `./api` como volumen y recarga en caliente. 6 escenarios curl, todos en verde:

1. Login `admin` → `superadmin` auto-asignado → accede a `seguridad`/`finanzas`/`creadores` (200).
2. Usuario con `admin_finanzas` → `finanzas`/`regalias` (200), `seguridad`/`creadores` (403);
   tras revocar el rol → `finanzas` (403).
3. Suspender → login 403; reactivar → login 200.
4. 5 logins fallidos → 6º rechazado con 429.
5. Recuperar → token generado → restablecer → login con nueva contraseña (200), vieja (401),
   reuso del token (400).
6. Baja de cuenta → login posterior 403.

Frontend: `npm run build` en verde (`UsuariosAdminPage` como chunk lazy propio, fuera del bundle
principal) y contenedor `frontend-react` reconstruido y sirviendo.

---

## Limpieza de `docs/`

Se eliminaron 5 documentos obsoletos (era S2 / pre-React / pre-B2B2C), cuyo contenido vigente ya
había migrado a bitácoras, README y los `design.md` archivados: `decisiones-refactorizacion.md`,
`ARQUITECTURA_S2.MD`, `TRACKLYTICS_PLAN_S2.md`, `PLAN_MEJORAS_FRONTEND_P2.md`,
`EMPRESA_TRACKLYTICS.md`.

## Cambios al README

- Eliminadas las 7 referencias a `decisiones-refactorizacion.md` (reemplazadas por `BITACORA_S10.md`
  §fact_id duplicado, `BITACORA_S11.md` §portadas, y `openspec/changes/archive/` para el resto).
- Conteo de tablas actualizado 68 → 71 (las 3 nuevas del cambio) en todas sus menciones.
- Sección "Auth" del stack ampliada con los roles administrativos especializados.
- Árbol de `docs/` y de la capability `seguridad` actualizados; `PENDIENTES.md` reescrito al estado
  post-S11.
