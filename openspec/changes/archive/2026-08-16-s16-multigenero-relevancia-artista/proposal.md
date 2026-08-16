## Why

La auditoría de revisores (S16) encontró tres huecos de comportamiento real: la subida de
artista solo aceptaba un género por track aunque el catálogo ya modela N:M track-género; las
notificaciones de respuesta a un comentario no llevaban a ningún lado (referenciaban un
"detalle de comentario" que no existe); y la búsqueda de catálogo ordenaba solo por
popularidad, sin ningún criterio de relevancia textual, así que una coincidencia exacta poco
popular podía aparecer después de una coincidencia parcial muy popular.

## What Changes

- La subida de track de artista acepta uno o más géneros (hasta 5), promoviendo una fila de
  `FACT_TRACKS` por género — mismo modelo N:M que ya usa el resto del catálogo. El retiro de un
  track propio ahora oculta todas esas filas (antes solo ocultaba una).
- El badge de contenido explícito, ya capturado en la subida, se propaga y se muestra en el
  catálogo (Top Tracks, búsqueda, tracks por artista/álbum/género, detalle de track).
- La notificación de "alguien respondió tu comentario" ahora referencia el track (como ya
  hacía la de comentario raíz), en vez de un tipo de referencia sin destino navegable.
- La vista de artista expone un enlace a los comentarios recibidos en cada track propio ya
  promovido al catálogo.
- `/tracks/search` incorpora un criterio de relevancia textual (coincidencia exacta > prefijo >
  parcial) como orden primario, con popularidad como desempate — sin reemplazarla.

## Capabilities

### New Capabilities
(ninguna — extiende capabilities existentes)

### Modified Capabilities
- `creadores`: "Subida de un track por un artista con cuenta aprobada" pasa a aceptar múltiples
  géneros; "Retiro de un track propio por el artista" pasa a ocultar todas las filas del track
  (todos los géneros), no solo una.
- `social`: la notificación de respuesta a comentario referencia el track de destino en vez de
  un tipo de referencia sin vista asociada.
- `catalogo`: `/tracks/search` incorpora relevancia textual como criterio de orden primario,
  complementario a la popularidad.

## Impact

- Backend: `api/paquetes/creadores/{router,promocion,queries}.py`, `api/paquetes/social/router.py`,
  `api/paquetes/catalogo/{router,queries}.py`, DDL de `STG_ARTIST_UPLOADS` (columna nueva
  `genre_ids Array(UInt16)`, `genre_id` se conserva por compatibilidad).
- Frontend: formulario de subida de artista (selector multi-género), badge de explícito en
  componentes de track, enlace a comentarios en la vista de artista.
- Sin cambios al mecanismo de autenticación ni a la fórmula de engagement score (RN-ANA-001).
