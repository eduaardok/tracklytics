## Why

Tracklytics necesita una capa de exploración musical funcional para sostener el modelo B2C freemium: el catálogo es el gancho de adquisición, y la biblioteca personal (favoritos/playlists/historial) es la fuente de datos de comportamiento que alimenta el motor analítico B2B (modelo data flywheel).

## What Changes

- Registro, inicio y cierre de sesión de usuarios vía PocketBase, con token de sesión devuelto en login e invalidado en logout.
- Búsqueda y exploración del catálogo musical global (tracks por nombre, artista o género) contra FACT_TRACKS en ClickHouse, paginada y filtrable por género (DIM_GENRES).
- Consulta de detalle de track identificado por `fact_id`, incluyendo sus 7 atributos de audio principales, con navegación cruzada hacia artista, álbum y género.
- Gestión de biblioteca personal para Usuario B2C: favoritos (agregar/quitar), playlists propias (crear, renombrar, eliminar, agregar/quitar tracks) e historial de reproducción de solo lectura, registrado automáticamente.
- Acceso de solo lectura al catálogo para Cliente B2B (sin biblioteca personal).

## Capabilities

### New Capabilities
- `catalogo`: autenticación de usuarios, exploración y detalle del catálogo musical global (FACT_TRACKS, DIM_ARTISTS, DIM_ALBUMS, DIM_GENRES en ClickHouse), y gestión de biblioteca personal (favoritos, playlists, historial de reproducción) en PocketBase para Usuario B2C y Cliente B2B.

### Modified Capabilities
(ninguna; no existen specs previas en `openspec/specs/`)

## Impact

- **PocketBase**: nuevas colecciones para autenticación de usuarios y playlists (con sus tracks, vía `playlists`/`playlist_tracks`), con reglas de acceso por usuario.
- **ClickHouse**: lectura de FACT_TRACKS, DIM_ARTISTS, DIM_ALBUMS, DIM_GENRES (sin escritura de catálogo técnico desde esta capability); escritura síncrona y directa desde FastAPI de eventos de favoritos e historial de reproducción en `FACT_ENGAGEMENT_USUARIO` (ver design.md para el detalle y la justificación de esta excepción a RT-01).
- **FastAPI**: nuevos endpoints de búsqueda, detalle y biblioteca bajo `/app/v1/catalogo` y `/app/v1/biblioteca`.
- **Frontend**: paquetes funcionales `autenticacion/`, `catalogo/` y `biblioteca/`.
