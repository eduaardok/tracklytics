# Auditoría de validación — `social`

6 `BaseModel`, 11 endpoints de escritura (censo confirmado).

## Endpoints y modelos

| Endpoint | Modelo/param | Hallazgo | Corrección |
|---|---|---|---|
| `POST/DELETE /seguimiento/{artista_id}` | path | `artista_id` sin cota inferior | `Path(..., ge=1)` |
| `POST /comentarios` | `ComentarioBody` | `fact_id_track`/`comentario_padre_id` sin cota; `contenido` sin `max_length` (texto de usuario final, riesgo real de abuso) | `ge=1` en los IDs; `contenido` `min_length=1, max_length=2000` |
| `POST /bloqueos`, `DELETE /bloqueos/{usuario_id}` | `BloqueoBody` / path | `usuario_id` sin trim/cota | `min_length=1` en ambos |
| `POST /admin/comentarios/{fact_id}/moderar` | path | `fact_id` sin cota inferior | `Path(..., ge=1)` |
| `POST /denuncias` | `DenunciaBody` | `objeto_id` sin cota; `descripcion` sin `max_length` | `objeto_id` `max_length=50`; `descripcion` `max_length=1000` |
| `PUT /admin/denuncias/{denuncia_id}` | `ActualizarDenunciaBody` | `motivo` sin `max_length`; **sin validar transición de estado** (ver hallazgo abajo) | `max_length=500`; transición inválida rechazada con 409 |
| `POST /comparticiones` | `ComparticionBody` | `fact_id_track`/`artista_id`/`playlist_id` sin cota | `ge=1` en los IDs; `playlist_id` `max_length=50` |
| `PATCH /notificaciones/{fact_id}/leer` | path | `fact_id` sin cota inferior | `Path(..., ge=1)` |
| `PATCH /notificaciones/leer-todas` | — (sin params) | — | sin cambios |

## Hallazgo: transición de estado inválida en denuncias

`PUT /admin/denuncias/{denuncia_id}` no verificaba el estado actual de la denuncia antes de
aplicar la actualización — una denuncia con `estado="resuelta"` podía volver a "revisada" o
resolverse una segunda vez (ej. emitiendo un segundo strike por el mismo caso). El diseño de
moderación (`p1-ciclos-vida`/`p2-descubrimiento-comunidad`) no contempla un flujo de "reabrir"
una denuncia resuelta — "resuelta" es terminal. Se agregó el chequeo explícito: si
`actual["estado"] == "resuelta"`, `409` con mensaje claro, antes de aplicar cualquier cambio
(incluido un strike nuevo).

## PK inmutable

No aplica de forma directa: los identificadores de recurso (`denuncia_id`, `fact_id` de
comentario/notificación) viajan solo por el path en todos los endpoints de actualización, nunca
como campo editable del body.

## Inyección SQL

Sin hallazgos — todas las queries de escritura usan `parameters` o `get_client().insert()`
(confirmado, incluyendo el módulo de notificaciones).

## Frontend

- `TrackSocialPage.tsx`: `maxLength={2000}` en el textarea de comentario/respuesta.
- `DenunciarButton.tsx`: `maxLength={1000}` en la descripción de la denuncia.
- `ModeracionSocialPage.tsx`: `maxLength={500}` en el motivo del strike. El botón "Resuelta" ya
  se deshabilitaba cuando `d.estado === 'resuelta'` (`disabled={isPending || d.estado ===
  'resuelta'}`) — coincide con el nuevo 409 del backend sin necesitar cambios adicionales.
