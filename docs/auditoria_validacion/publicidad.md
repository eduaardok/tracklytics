# Auditoría de validación — `publicidad`

4 `BaseModel`, 12 endpoints de escritura (censo confirmado).

## Endpoints y modelos

| Endpoint | Modelo/param | Hallazgo | Corrección |
|---|---|---|---|
| `POST /admin/anunciantes` | `AnuncianteBody` | `nombre`/`sector` sin cota | `max_length` en ambos |
| `PUT /admin/anunciantes/{id}` | `AnuncianteEditBody` | igual; `anunciante_id` sin cota inferior | igual + `Path(ge=1)` |
| `POST /admin/anunciantes/{id}/desactivar` | path | `anunciante_id` sin cota inferior | `Path(ge=1)` |
| `POST /admin/campanas` | `CampanaBody` | `cpm`/`presupuesto_total` sin `Field` (solo `cpm` validado en runtime); `url_destino` sin cota; **`fecha_fin` sin validar contra `fecha_inicio`** | `Field(gt=0)` en montos; `max_length=2048` en URL; `field_validator` de fechas |
| `PUT /admin/campanas/{id}` | `CampanaEditBody` | mismo patrón, agravado por ser PATCH parcial (ver nota abajo); `campana_id` sin cota inferior | corregido + `Path(ge=1)` |
| `POST /admin/campanas/{id}/pausar`, `/reanudar`, `/finalizar` | path | `campana_id` sin cota inferior | `Path(ge=1)` en los 3 |
| `POST /impresion`, `/impresion-display` | — (sin body) | — | sin cambios |
| `POST /impresion/{id}/completar`, `/click` | path | `impresion_id` (UUID) sin cota | `Path(min_length=1, max_length=64)` |

## Hallazgo: fecha de fin de campaña no se validaba contra la de inicio

`CampanaBody`/`CampanaEditBody` no comparaban `fecha_fin` contra `fecha_inicio` — una campaña
podía crearse o editarse con `fecha_fin` anterior o igual a `fecha_inicio`. Se agregó
`field_validator` en ambos modelos. En `CampanaEditBody` (PATCH parcial) el validador de
Pydantic **no alcanza** por sí solo: si el request trae una sola de las dos fechas, el modelo no
tiene la otra para comparar. El handler (`editar_campana`) completa la fecha faltante con el
valor ya guardado en ClickHouse (`CAMPANA_POR_ID`) antes de comparar, para cubrir el caso real
de un PATCH parcial además del caso feliz (ambas fechas en el mismo request, ya cubierto por el
`field_validator`).

## Otros hallazgos

- `CampanaBody.cpm`/`presupuesto_total`: antes `cpm <= 0` se validaba en runtime (removido, ahora
  `Field(gt=0)`); `presupuesto_total` **no tenía ninguna validación**, aceptaba negativo o cero.
- `CampanaEditBody.presupuesto_total`: mismo caso, `Field(gt=0)`, runtime check redundante
  removido.
- IDs de recurso (`anunciante_id`, `campana_id`, `impresion_id`) sin cota inferior/formato en 9
  path params distintos — corregidos con `Path(...)` (no eran explotables, todas las queries ya
  usan `parameters`, pero permitían ruido como `anunciante_id=-1` llegando hasta la query SQL).

## PK inmutable

No aplica: ningún body de edición incluye el ID del recurso (siempre viaja por el path).

## Inyección SQL

Sin hallazgos — todas las escrituras usan `parameters` o `get_client().insert()`.

## Frontend — `PublicidadAdminPage.tsx`

- `maxLength` en nombre de campaña (200), URL de destino (2048), nombre/sector de anunciante
  (200/100), nombre en edición de campaña (200).
- `min="0.01"` en presupuesto de creación (antes `min="0"`, permitía 0 — inconsistente con el
  `gt=0` real del backend).
- Edición de campaña: `min={fechaInicio}` en el input de fecha de fin, validación
  `fechaFinValida` que bloquea el guardado y muestra un mensaje si la fecha de fin no es
  posterior a la de inicio (nueva clase `.modalWarn` en el CSS module — no existía un estilo de
  advertencia de texto en este módulo, se agregó siguiendo el mismo patrón de tokens que ya usa
  el resto del archivo).
