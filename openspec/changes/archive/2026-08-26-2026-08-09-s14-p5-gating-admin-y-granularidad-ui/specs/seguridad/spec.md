## Purpose

Garantizar que el frontend reconozca exactamente el mismo modelo de autorización
administrativa que ya aplica el backend (superadmin o cualquier rol de área vigente en
`BRIDGE_USUARIO_ROL_ADMIN`), en vez de un chequeo más estricto que solo reconoce
`record.role == 'admin'` de PocketBase — ese campo solo vale `admin` para la cuenta
superadmin bootstrap; las cuentas con un rol de área asignado por `BRIDGE_USUARIO_ROL_ADMIN`
quedaban bloqueadas fuera del panel administrativo aunque el backend las autorizara.

## ADDED Requirements

### Requirement: El frontend reconoce el modelo real de autorización administrativa

El sistema SHALL exponer, en el autoservicio de perfil del usuario autenticado
(`GET /seguridad/perfil`), sus roles administrativos vigentes (`BRIDGE_USUARIO_ROL_ADMIN`).
Los guards de navegación del frontend que restringen una ruta a usuarios administrativos
SHALL autorizar el acceso si el usuario tiene `record.role == 'admin'` en PocketBase O al
menos un rol administrativo vigente — no SHALL depender exclusivamente del campo `role`
crudo de PocketBase, que no refleja los roles de área asignados por
`BRIDGE_USUARIO_ROL_ADMIN`.

#### Scenario: Cuenta con rol de área accede al panel administrativo desde el navegador
- **WHEN** un usuario cuyo único rol administrativo es `admin_finanzas` (asignado por
  `BRIDGE_USUARIO_ROL_ADMIN`, con `record.role == 'user'` en PocketBase) navega a una ruta
  administrativa del frontend
- **THEN** el sistema permite el acceso a la ruta (la autorización fina de cada endpoint
  sigue siendo responsabilidad del backend)

#### Scenario: Cuenta sin ningún rol administrativo intenta acceder
- **WHEN** un usuario sin `record.role == 'admin'` y sin ningún rol vigente en
  `BRIDGE_USUARIO_ROL_ADMIN` navega a una ruta administrativa del frontend
- **THEN** el sistema lo redirige fuera del panel administrativo

#### Scenario: Un usuario consulta su propio perfil
- **WHEN** cualquier usuario autenticado solicita `GET /seguridad/perfil`
- **THEN** la respuesta incluye la lista de sus roles administrativos vigentes, sin importar
  cuántos tenga (incluida una lista vacía)
