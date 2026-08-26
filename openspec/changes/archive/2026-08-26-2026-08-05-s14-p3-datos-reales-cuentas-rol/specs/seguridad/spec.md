## Purpose

Garantizar que cada rol administrativo del catálogo (`DIM_ROL_ADMINISTRATIVO`) tenga una
cuenta de referencia verificable, creada por los endpoints reales de autenticación y
asignación de roles, para poder demostrar y auditar el gating por departamento de forma
reproducible.

## Objetivo

Garantizar que cada rol administrativo del catálogo (`DIM_ROL_ADMINISTRATIVO`) tenga una
cuenta de referencia verificable, creada por los endpoints reales de autenticación y
asignación de roles, para poder demostrar y auditar el gating por departamento de forma
reproducible.

## MODIFIED Requirements

### Requirement: Asignación y revocación de roles administrativos

El sistema SHALL permitir a un usuario con rol `superadmin` asignar un rol administrativo a
un usuario (registrando en `BRIDGE_USUARIO_ROL_ADMIN` quién lo asignó y cuándo) y revocarlo.
El rol asignado SHALL pertenecer al catálogo `DIM_ROL_ADMINISTRATIVO`. Cada asignación o
revocación SHALL quedar registrada en `FACT_AUDIT_LOG`. El sistema SHALL permitir crear una
cuenta de referencia por cada rol del catálogo usando exclusivamente los endpoints reales de
registro y asignación (nunca escritura directa a la base de datos), de forma que la cuenta
quede sincronizada entre PocketBase (autenticación) y `DIM_USUARIO` (espejo analítico) desde
su creación.

#### Scenario: Asignar un rol administrativo
- **WHEN** un usuario con rol `superadmin` asigna el rol `admin_finanzas` a un usuario
- **THEN** el sistema registra la asignación en `BRIDGE_USUARIO_ROL_ADMIN` con el autor y la
  fecha, la audita, y el usuario objetivo pasa a acceder a los endpoints administrativos de
  finanzas

#### Scenario: Revocar un rol administrativo
- **WHEN** un usuario con rol `superadmin` revoca un rol administrativo previamente asignado
- **THEN** el sistema deja de considerar ese rol vigente para el usuario y audita la
  revocación

#### Scenario: Asignar un rol fuera del catálogo
- **WHEN** un usuario con rol `superadmin` intenta asignar un rol administrativo que no
  existe en `DIM_ROL_ADMINISTRATIVO`
- **THEN** el sistema rechaza la operación con un error de validación

#### Scenario: Crear una cuenta de referencia por cada rol administrativo
- **WHEN** se crea una cuenta por cada uno de los roles de `DIM_ROL_ADMINISTRATIVO` usando
  `POST /auth/registro` seguido de `POST /admin/usuarios/{id}/rol-admin`
- **THEN** cada cuenta resultante accede exclusivamente a los endpoints administrativos de
  su propio rol (y `superadmin` accede a todos), verificable con una petición autenticada
  por cuenta contra un endpoint de cada área
