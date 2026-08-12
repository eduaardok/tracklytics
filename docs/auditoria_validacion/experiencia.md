# Auditoría de validación — `experiencia`

5 `BaseModel`, 9 endpoints de escritura (censo confirmado).

## Endpoints y modelos

| Endpoint | Modelo/param | Hallazgo | Corrección |
|---|---|---|---|
| `GET /reproduccion/youtube-video-id` | `Query` | `q` sin `max_length` | `max_length=200` |
| `POST /tickets` | `TicketBody` | `asunto`/`descripcion` sin cota; `usuario_id` (admin en nombre de otro) sin cota | `max_length` en los tres |
| `PUT /tickets/{fact_id}` | `ActualizarTicketBody` | `estado` ya era `Literal` (correcto); `fact_id` sin cota inferior | `Path(..., ge=1)` agregado |
| `POST /familia/titular` | `TitularBody` | `usuario_id` sin cota **y sin formato** (ver hallazgo crítico abajo) | `Field(pattern=...)` |
| `POST /familia/{id}/miembros` | `MiembroBody` | igual | igual |
| `DELETE /familia/{id}/miembros/{usuario_id}` | path | `usuario_id` sin formato | `Path(pattern=...)` |
| `POST /familia` (self-service) | `MiembroEmailBody` | `email: str` libre | regex de formato + `.lower()` (ver nota de estilo abajo) |
| `POST /familia/miembros` (self-service) | — | usa la sesión, sin cambios | — |
| `DELETE /familia/miembros/{usuario_id}` (self-service) | path | usa la sesión, sin cambios | — |

## Hallazgo crítico: `usuario_id` sin validar interpolado en filtro de PocketBase (alcanzable desde `experiencia`)

Mismo patrón exacto que `partners`/`biblioteca`: `api/paquetes/experiencia/pb_client.py::
suscripcion_activa_de_usuario()` arma un filtro de PocketBase por f-string
(`f'usuario_o_cliente="{usuario_id}" && estado="activa"'`) sin escapar. Esta función es
alcanzable con **input directamente controlado por un admin** (no derivado de la sesión) desde
dos puntos:

- `POST /familia/titular` (`TitularBody.usuario_id`) → `crear_titular()` → llama a
  `suscripcion_activa_de_usuario(usuario_id)` directo con el valor del body.
- `GET /familia/resolver-suscripcion/{usuario_id}` → llama a la misma función con el path param.

Un `usuario_id` con `"` rompe el filtro. Se agregó `_PB_ID_PATTERN = r"^[a-z0-9]{15}$"` (mismo
patrón que `partners`/`biblioteca`) vía `Field(pattern=...)` en `TitularBody`/`MiembroBody` y
`Path(pattern=...)` en los path params `usuario_id` de `resolver_suscripcion_de_usuario` y
`quitar_miembro`. `MiembroBody.usuario_id` no llega a esta función vulnerable en el código
actual (solo a queries de ClickHouse parametrizadas), pero se corrige igual por consistencia:
es el mismo tipo de campo (ID real de PocketBase) en el mismo flujo de negocio.

No se tocó `pb_client.py` en sí (el fix vive en el borde de la API, mismo criterio que
`partners`/`biblioteca`) — la validación en el modelo/`Path` ya impide que un valor malformado
llegue hasta la función.

## Nota de estilo: `MiembroEmailBody.email` usa regex en vez de `EmailStr`

A diferencia de `seguridad`/`suscripciones`/`partners` (que usan `EmailStr`), este campo usa un
regex propio (`_EMAIL_RE`) + `field_validator` que además normaliza a minúsculas
(`v.lower()`) — funcionalmente correcto y más estricto en un aspecto (normalización), pero
inconsistente en estilo con el resto del repo. Se deja sin tocar: no es un bug, es una
diferencia de implementación entre dos correcciones aplicadas en pasadas distintas de esta
misma auditoría.

## PK inmutable

`fact_id` (tickets), `usuario_id`/`suscripcion_id` (plan familiar) viajan solo por el path en
los endpoints de actualización — ninguno es campo editable de un body.

## Inyección SQL (ClickHouse)

Sin hallazgos — todas las escrituras usan `parameters` o `get_client().insert()`. El hallazgo
real de este paquete es del lado de PocketBase (arriba).

## Frontend

`SoportePage.tsx`/`TicketsAdminPage.tsx`: `maxLength` en asunto (200) y descripción (5000) de
tickets, en ambos formularios (usuario final y admin-en-nombre-de-otro). `FamiliaAdminPage.tsx`
ya usa `UserPicker` (búsqueda de usuarios reales) en vez de un input de texto libre para
`usuario_id` — sin cambios necesarios, la superficie de ataque real era la API, no el formulario.
El email de invitación al plan familiar (self-service) vive en
`frontend/src/packages/seguridad/pages/ProfilePage.tsx` (`maxLength={254}` agregado en la
auditoría de `seguridad`).
