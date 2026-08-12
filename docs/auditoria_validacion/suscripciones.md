# Auditoría de validación — `suscripciones`

6 `BaseModel`, 7 endpoints de escritura (censo confirmado).

## Endpoints y modelos

| Endpoint | Modelo | Hallazgo | Corrección |
|---|---|---|---|
| `POST ""` (confirmar) | `ConfirmarSuscripcion` | `plan_id: str` libre (ya rechazada en runtime vía `PLANES.get`, pero tarde y sin declarar en schema); `metodo_pago_id`/`email_institucional` sin formato | `plan_id: PlanId` (Literal); `metodo_pago_id` `min_length=1`; `email_institucional: EmailStr` |
| `PUT /{id}/plan` | `CambiarPlanBody` | mismo patrón: `nuevo_plan_id: str` libre, `metodo_pago_id` sin `min_length` | `PlanId` + `min_length=1` |
| `POST /{id}/procesar-cobro` | `ProcesarCobroBody` | `metodo_pago_id` sin `min_length` | `min_length=1, max_length=100` |
| `PUT /admin/planes/{plan_id}/precio` | `PrecioPlanBody` | `precio_usd < 0` solo en runtime | `Field(ge=0)`, runtime check removido (redundante) |
| `POST /admin/suscripciones/{id}/cancelar` | `CancelarAdminBody` | `motivo` sin cota | `max_length=500` |
| `POST /admin/suscripciones/{id}/extender` | `ExtenderBody` | `dias <= 0` solo en runtime, **sin tope superior**; `motivo` sin cota | `Field(gt=0, le=365)`; `motivo` `max_length=500` |
| `POST /{id}/cancelar` (usuario final) | — (`Query`) | `motivo: MotivoCancelacion` ya era `Literal` | sin cambios, ya correcto |

`PlanId = Literal["free", "premium", "estudiante", "basico", "pro", "enterprise"]` (nuevo, en
`planes.py`) — catálogo cerrado de IDs de plan reales (`DIM_PLAN`), fijo en código porque un plan
nuevo es una decisión de negocio explícita, no algo que deba poder inventarse vía payload.

## Nota: este paquete quedó a medio corregir en un intento anterior de esta auditoría

Un intento previo aplicó los fixes de `ConfirmarSuscripcion` y dejó `EstadoSuscripcion`/`PlanId`
definidos pero **sin usar** en 4 de los 6 modelos restantes (`CambiarPlanBody`,
`ProcesarCobroBody`, `PrecioPlanBody`, `CancelarAdminBody`, `ExtenderBody`) — completado en esta
pasada, incluyendo el hallazgo real que motivó `EstadoSuscripcion`: ver abajo.

## Hallazgo: filtro admin "suspendida" que nunca podía devolver resultados

`GET /admin/suscripciones` tenía `estado: str | None` sin restricción — el frontend
(`AdminSuscripcionesPage.tsx`) ofrecía un `<select>` con 4 opciones (`activa`, `cancelada`,
`suspendida`, `pago_pendiente`), pero **el backend nunca escribe `estado="suspendida"` en
ningún lugar del paquete** (grep verificado): una suscripción incumplidora se degrada a
`free`/se cancela vía dunning (CU-O95), nunca queda "suspendida". Ese filtro era honesto en la
UI pero nunca podía devolver ni un solo resultado. Se agregó `EstadoSuscripcion =
Literal["activa", "cancelada", "pago_pendiente"]` (con "suspendida" explícitamente excluido y
documentado en el código) aplicado al `Query` de `estado`, y `PlanId` al de `plan_id`. Se quitó
`'suspendida'` del array `ESTADOS` del frontend.

## PK inmutable

Todos los identificadores (`suscripcion_id`, `plan_id`) viajan solo por el path — ninguno es
campo editable de un body.

## Inyección SQL / filtros PocketBase

`_pb_escape()` ya existía en el archivo (neutraliza comillas antes de armar filtros de
PocketBase por f-string en `listar_suscripciones_admin`) — a diferencia de `partners`/
`biblioteca`, este paquete **ya tenía** una mitigación básica contra la inyección de filtro. Se
revisó el resto de `pb_client.py` de este paquete sin encontrar interpolación sin escapar
adicional. Las escrituras a ClickHouse (`FACT_TRANSACCION_PAGO`, `FACT_CANCELACION_SUSCRIPCION`,
`DIM_PLAN`) usan `get_client().insert(...)`.

## Frontend

`AdminSuscripcionesPage.tsx`: quitada la opción "suspendida" del filtro de estado (documentado
por qué); `max="365"` en el input de días de extensión, `maxLength={500}` en los motivos de
cancelación/extensión administrativa. El input de `precio_usd` vive en
`distribucion/components/ConfiguracionGlobalTab.tsx` (llama a
`suscripcionesApi.actualizarPrecioPlan`) — revisado en `docs/auditoria_validacion/distribucion.md`.
