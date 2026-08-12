# Auditoría de validación — `seguridad`

12 `BaseModel`, 17 endpoints de escritura — el paquete más grande del repo (censo confirmado).

## Endpoints y modelos

| Endpoint | Modelo | Hallazgo | Corrección |
|---|---|---|---|
| `POST /auth/registro` | `RegistroBody` | `email: str` libre; `password` sin `min_length`; `rol: str = "user"` validado en runtime contra `ROLES_AUTO_REGISTRABLES` (nunca `admin`, pero por chequeo, no por tipo) | `EmailStr`; `password` `min_length=8` (misma regla que cambio de password); `rol: Literal["user","analyst"]` — un rol admin ni siquiera pasa la deserialización |
| `POST /auth/login` | `LoginBody` | sin cotas de longitud | `EmailStr` + `max_length` en todos los strings |
| `POST /auth/logout`, `DELETE /sesiones/{id}` | `LogoutBody` | `dispositivo_id` sin cota | `max_length=200` |
| `PATCH /perfil` | `ActualizarPerfilBody` | `nombre`/`pais` sin cota | `max_length` en ambos |
| `PATCH /password` | `CambiarPasswordBody` | regla de 8 caracteres solo en runtime (`if len(...) < 8`) | movida a `Field(min_length=8)` — mismo resultado, declarativo |
| `POST /permisos` | `PermisoBody` | **`usuario_id`/`recurso`/`accion` texto libre sin verificar contra nada** (ver hallazgo abajo) | corregido |
| `POST /auth/recuperar` | `RecuperarBody` | `email: str` libre | `EmailStr` |
| `POST /auth/restablecer` | `RestablecerBody` | regla de 8 caracteres solo en runtime | `Field(min_length=8)` |
| `POST /auth/verificar-email` | `VerificarEmailBody` | `token` sin cota | `max_length=100` |
| `POST /auth/reenviar-verificacion` | `ReenviarVerificacionBody` | `email: str` libre | `EmailStr` |
| `POST /perfil/baja` | — (sin body) | — | sin cambios |
| `POST /admin/usuarios/{id}/rol-admin` | `AsignarRolAdminBody` | **`rol_admin: str` libre** (ver hallazgo abajo) | `Literal` con los 6 roles reales |
| `DELETE /admin/usuarios/{id}/rol-admin/{rol_admin}` | path | ya usaba el mismo valor de rol vía path | sin cambios necesarios (no es body) |
| `POST /admin/usuarios/{id}/strikes` | `EmitirStrikeBody` | `motivo` sin cota | `min_length=1, max_length=500` |
| `POST /admin/usuarios/{id}/suspender`, `/reactivar` | — (sin body) | — | sin cambios (idempotentes por diseño: repetir la acción no rompe nada) |

## Hallazgo: roles administrativos como string libre

`AsignarRolAdminBody.rol_admin` era `str` — la única barrera era un `422` en runtime
(`ROL_ADMIN_EXISTE` contra la tabla `DIM_ROL_ADMINISTRATIVO`). Se agregó
`RolAdminLiteral = Literal["superadmin", "admin_finanzas", "admin_contenido",
"admin_comunidad", "admin_datos", "admin_comercial"]` (los 6 roles reales sembrados en
`init_clickhouse.py`, confirmados en el código, no de memoria) — ahora un rol inválido ni
siquiera pasa la deserialización del body. Se **conserva** el chequeo en runtime contra
`ROL_ADMIN_EXISTE`: sigue siendo necesario para rechazar un rol desactivado en base de datos
(`activo=0`), algo que un `Literal` fijo en código no puede saber.

## Hallazgo: permisos podían apuntar a un usuario/recurso/acción inexistentes

`POST /permisos` (`PermisoBody`) aceptaba `usuario_id`/`recurso`/`accion` como texto completamente
libre — el frontend (`PermisosPage.tsx`) ya restringe `recurso`/`accion` a un `<select>` con
`_RECURSOS_CONOCIDOS`/`_ACCIONES_CONOCIDAS`, pero eso es solo UX: una llamada directa a la API
podía crear un permiso para un `usuario_id` que no existe, o sobre un recurso/acción inventados
que ningún `require_permiso` real consulta jamás — un permiso "fantasma" que no protege ni
habilita nada. Se agregó verificación explícita en el handler: `usuario_id` debe existir en
`DIM_USUARIO` (404 si no), `recurso`/`accion` deben estar en las listas reales derivadas de
`PERMISOS_POR_DEFECTO` (422 si no). No se usó `Literal` para `recurso`/`accion` porque esas
listas se derivan dinámicamente de `PERMISOS_POR_DEFECTO` (no son un enum fijo en código).

## PK inmutable

Todos los identificadores de recurso (`sesion_id`, `usuario_id`, `rol_admin`) viajan solo por el
path en los endpoints de actualización — ninguno es campo editable de un body. Sin hallazgos.

## Inyección SQL

Sin hallazgos — todas las escrituras usan `parameters` o `get_client().insert()`, incluyendo
`audit.py` y `deps.py` (revisados explícitamente por el riesgo de que el módulo de auditoría
mismo tuviera SQL sin parametrizar).

## Frontend

`RegisterPage.tsx`: `maxLength` en nombre (150) y password (128) — email/password ya tenían
`type="email"`/`minLength={8}`. `ProfilePage.tsx`: `maxLength` en los 3 inputs de cambio de
password (128), en el nombre editable (150) y en el email de invitación a plan familiar (254).
`LoginPage.tsx`: `maxLength` en email/password de login, token y nueva contraseña de
recuperación — reflejando exactamente los límites del backend.
