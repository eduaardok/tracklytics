# Auditoría de validación — `biblioteca`

6 `BaseModel`, 12 endpoints de escritura (censo confirmado). Frontend en
`frontend/src/packages/catalogo/` (no tiene carpeta propia — `api/biblioteca.api.ts`,
`pages/BibliotecaPage.tsx`, `components/{FavoritosTab,HistorialTab,PlaylistsTab}.tsx`,
`hooks/useFavoritos.ts`, `components/AddToPlaylistMenu.tsx`).

## Hallazgo crítico: `playlist_id`/`usuario_id` sin validar interpolados en filtro/URL de PocketBase

Mismo patrón exacto que el hallazgo crítico de `partners` (ver
`docs/auditoria_validacion/partners.md`): `pb_playlists.py` interpola `playlist_id` sin validar
tanto en la URL del REST API (`f".../records/{playlist_id}"`, en `obtener`/`renombrar`/
`actualizar_visibilidad`/`eliminar`) como en filtros armados por f-string
(`f'playlist="{playlist_id}"'` en `listar_tracks`/`quitar_track_por_fact_id`). Un `playlist_id`
con `"` rompe el filtro; uno con `/` cambia el recurso de destino de la petición. `usuario_id` en
`DELETE /playlists/{playlist_id}/colaboradores/{usuario_id}` tiene el mismo problema potencial
(es un ID de la colección `users`).

### Corrección aplicada

`_PB_ID_PATTERN = r"^[a-z0-9]{15}$"` (mismo patrón que `partners`) en `Path(...)` de **los 9**
endpoints que reciben `playlist_id` — incluye `GET /playlists/{playlist_id}` aunque sea de solo
lectura: la vulnerabilidad de filtro/URL no depende del método HTTP, cualquier endpoint que
reciba `playlist_id` sin validar comparte el mismo riesgo. `usuario_id` en el endpoint de quitar
colaborador recibe el mismo `Path(pattern=...)`.

## Modelos

| Modelo | Campo | Antes | Después |
|---|---|---|---|
| `HistorialBody` | `dispositivo_id` | sin cota | `Field(min_length=1, max_length=200)` |
| | `porcentaje_completado` | sin `ge`/`le` (nunca puede exceder 100% ni ser negativo) | `Field(ge=0, le=100)` |
| | `impresion_id` | sin cota inferior | `Field(ge=1)` |
| `PlaylistBody` | `name` | sin cota | `Field(min_length=1, max_length=100)` — el frontend ya limita a 60, 100 da margen sin dejar pasar un nombre arbitrario si se llama a la API directo |
| `PlaylistTrackBody` | `fact_id` | sin cota inferior | `Field(ge=1)` |
| `PlaylistReordenarBody` | `fact_ids` | `list[int]` sin cota por elemento ni longitud máxima | `list[Annotated[int, Field(ge=1)]]` + `max_length=2000` en la lista |
| `PlaylistColaboradorBody` | `email` | `str` libre, nunca validado como email | `EmailStr` |

Los últimos dos hallazgos (`PlaylistReordenarBody`/`PlaylistColaboradorBody`) quedaron sin
terminar en un intento anterior de esta auditoría (se importaron `EmailStr`/`Annotated` sin
usarlos) — completados aquí.

## PK inmutable

No aplica de forma directa: `playlist_id`/`fact_id` de recurso viajan solo por el path en todos
los endpoints de actualización, nunca como campo editable del body.

## Inyección SQL (ClickHouse)

Sin hallazgos — las escrituras a ClickHouse (favoritos, historial) usan
`get_client().insert(...)`. El hallazgo real de este paquete es del lado de PocketBase (arriba).

## Frontend

`PlaylistsTab.tsx`/`AddToPlaylistMenu.tsx`: el nombre de playlist ya tenía `maxLength={60}` (sin
cambios). Se agregó `maxLength={254}` al input de email de colaborador (ya tenía `type="email"`
como hint de formato, sin protección real detrás hasta ahora).
