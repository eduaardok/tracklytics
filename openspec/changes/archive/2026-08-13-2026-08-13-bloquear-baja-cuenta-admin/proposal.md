## Why

`POST /perfil/baja` (dar de baja la cuenta propia) solo exigía `get_current_user` — cualquier
cuenta autenticada podía autoeliminarse, incluida una cuenta con rol administrativo (superadmin o
cualquiera de los 6 roles de área en `BRIDGE_USUARIO_ROL_ADMIN`). Un clic accidental (o una
sesión de staff comprometida) podía dejar sin acceso administrativo a esa cuenta sin ningún paso
de por medio — la baja cierra sesiones, cancela suscripción y bloquea el login futuro, igual que
una cuenta suspendida. El frontend (`ProfilePage.tsx`) tampoco distinguía: mostraba la zona de
peligro "Dar de baja mi cuenta" a cualquier usuario, admin incluido, ofreciendo una acción que en
la práctica no debería existir para esas cuentas.

## What Changes

- **Backend**: `POST /perfil/baja` rechaza con 403 si la cuenta que llama tiene `record.role ==
  'admin'` (superadmin bootstrap) o algún rol vigente en `BRIDGE_USUARIO_ROL_ADMIN` (roles de
  área) — reusa `roles_admin_vigentes`, ya usado por `require_rol_admin`.
- **Frontend**: `ProfilePage.tsx` oculta la sección "Dar de baja mi cuenta" cuando
  `user.esAdmin` es verdadero (mismo campo que ya resuelve `RequireAuth`/`SeguridadShell` para
  superadmin + roles de área) — evita ofrecer una acción que el backend siempre va a rechazar.

## Capabilities

### Modified Capabilities

- `seguridad`: la baja de cuenta propia SHALL quedar restringida a cuentas sin rol
  administrativo.

## Impact

- **Backend**: `api/paquetes/seguridad/router.py` (`baja_cuenta` gana el chequeo de rol antes de
  ejecutar la baja).
- **Frontend**: `frontend/src/packages/seguridad/pages/ProfilePage.tsx` (zona de peligro
  condicionada a `!user.esAdmin`).
- **Compatibilidad**: cambio de comportamiento intencional — una cuenta admin que antes podía
  darse de baja (aunque nunca debió hacerlo) ahora recibe 403. Ninguna cuenta no-admin se ve
  afectada.
