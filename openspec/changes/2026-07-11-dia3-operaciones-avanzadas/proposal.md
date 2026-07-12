## Why

El plan de cierre de S10 (3 días) identificó que, tras `2026-07-09-mejoras-produccion` y
`2026-07-11-regalias-publicidad`, seguían faltando piezas del RT-04 (dashboards interactivos)
para las 6 capabilities de negocio nuevas de esta iteración, y varios gaps operativos concretos
detectados en la propia auditoría: no había forma de que un usuario viera ni cerrara sus
sesiones abiertas en otros dispositivos (solo existía `FACT_SESION` como dato, sin superficie
de consulta propia); la búsqueda de catálogo no soportaba filtrar por popularidad ni por
atributos de audio (tempo/energy) pese a que esas columnas ya existían en `FACT_TRACKS`; el
feed social solo mostraba la lista de artistas seguidos, sin ninguna actividad agregada; y las
playlists no se podían reordenar ni compartir con otro usuario — dos limitaciones que un
gestor de música real no tendría. Por separado, verificar estos cambios con datos reales
expuso un bug preexistente (no introducido en esta iteración): `eliminar_playlist` fallaba con
un 500 opaco para cualquier playlist con al menos un track, porque PocketBase rechaza borrar un
registro referenciado por una relation `required` con `cascadeDelete: false`.

## What Changes

- **Dashboards administrativos (RT-04)** para las 6 capabilities de negocio sin panel visual
  aún: `seguridad` (acciones/errores por día, sesiones abiertas), `facturacion` (ingreso por
  día, transacciones 24h), `creadores` (subidas por estado, cuentas de artista), `social`
  (actividad social por día, artistas más seguidos), `distribucion` (restricciones por país,
  licencias activas) y `experiencia` (tickets por estado). Cada uno agrega un endpoint
  `GET /admin/dashboard` (rol `admin`) y una página React con gráficos reales (recharts,
  paleta validada del proyecto) — sin datos inventados, todo agregado sobre filas ya existentes
  en ClickHouse.
- **Sesiones activas multi-dispositivo (`seguridad`)**: `GET /seguridad/sesiones` (las propias
  sesiones abiertas del usuario autenticado) y `DELETE /seguridad/sesiones/{sesion_id}` (cierre
  remoto, con verificación de ownership), más una sección "Mis sesiones" en el perfil.
- **Búsqueda avanzada (`catalogo`)**: `GET /tracks/search` acepta `popularity_min`,
  `tempo_min`, `tempo_max` y `energy_min` opcionales, con un panel de filtros colapsable en la
  UI de catálogo.
- **Feed de actividad social (`social`)**: `GET /social/feed` agrega comentarios y
  comparticiones recientes de tracks de artistas que el usuario sigue (UNION de ambos eventos,
  ordenado por fecha). El modelo de datos de `social` sigue a nivel artista, no usuario
  (seguir artistas, no seguir personas) — el feed hereda esa misma semántica en vez de simular
  un follow de usuarios que no existe.
- **Playlists colaborativas y reordenables (`catalogo`)**: nuevo campo `colaboradores`
  (relation multi a `users`) en la colección `playlists` de PocketBase, con reglas ampliadas
  para que un colaborador pueda ver la playlist y agregar/quitar/reordenar tracks (nunca
  renombrarla ni eliminarla — exclusivo del owner). Nuevos endpoints:
  `PUT /biblioteca/playlists/{id}/reordenar`, `POST`/`DELETE
  /biblioteca/playlists/{id}/colaboradores[/{usuario_id}]`. El detalle de playlist ahora
  expone `is_owner` y `colaboradores`.
- **Fix de bug preexistente**: `eliminar_playlist` ahora borra en cascada los
  `playlist_tracks` de la playlist antes de borrar el registro `playlists` — PocketBase
  rechazaba el borrado del padre mientras existieran hijos referenciándolo (`cascadeDelete:
  false` en una relation `required`). Este bug es anterior a esta iteración (existía desde la
  implementación original de playlists) y se descubrió al verificar con curl el flujo de
  eliminación de una playlist con tracks.
- **Traducción de errores de PocketBase a códigos HTTP correctos**: `renombrar_playlist`,
  `eliminar_playlist`, `reordenar_playlist` y la gestión de colaboradores ahora traducen el 404
  que PocketBase devuelve cuando una `updateRule`/`deleteRule` rechaza la operación (oculta el
  registro en vez de admitir que existe) a un 403 legible ("Solo el propietario puede hacer
  esto"). Antes de playlists colaborativas esto nunca era alcanzable (solo el owner conocía el
  `playlist_id`); ahora un colaborador legítimamente puede intentar una acción exclusiva del
  owner y necesita un error claro, no un 500 opaco.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `seguridad`: nuevo endpoint de dashboard administrativo; nueva consulta y cierre remoto de
  sesiones activas propias.
- `facturacion`: nuevo endpoint de dashboard administrativo.
- `creadores`: nuevo endpoint de dashboard administrativo.
- `social`: nuevo endpoint de dashboard administrativo; nuevo feed de actividad de artistas
  seguidos.
- `distribucion`: nuevo endpoint de dashboard administrativo.
- `experiencia`: nuevo endpoint de dashboard administrativo.
- `catalogo`: búsqueda extendida con filtros de popularidad/tempo/energy; gestión de playlists
  extendida con reorder y colaboradores; fix de bug de eliminación de playlist con tracks.

## Impact

- **Backend**: `api/paquetes/{seguridad,facturacion,creadores,social,distribucion,experiencia}/{queries.py,router.py}`
  (dashboards); `api/paquetes/seguridad/{queries.py,router.py}` (sesiones); `api/paquetes/catalogo/router.py`
  (filtros de búsqueda); `api/paquetes/biblioteca/{pb_playlists.py,router.py}` (reorder,
  colaboradores, fix de eliminación); `api/paquetes/social/{queries.py,router.py}` (feed).
- **PocketBase**: campo `colaboradores` en `playlists` y reglas ampliadas en
  `playlists`/`playlist_tracks` — `pb_init.py` (instalación nueva) y
  `scripts/migrar_playlists_colaborativas.py` (instancia ya viva, mismo patrón que
  `scripts/migrar_sellos.py`).
- **Frontend (`frontend/`, React)**: 6 páginas de dashboard nuevas
  (`AuditoriaPage`, `AuditoriaFacturacionPage`, `RevisionCreadoresPage`, `ModeracionSocialPage`,
  `DistribucionAdminPage`, `TicketsAdminPage`) + componentes de gráfico reusables en
  `shared/components/charts/`; sección "Mis sesiones" en `ProfilePage`; panel de filtros
  avanzados en `CatalogPage`; sección de actividad reciente en `SeguidosSocialPage`; controles
  de reorder y panel de colaboradores en `PlaylistsTab`.
- **Fuera de alcance**: recorrido manual en navegador de las pantallas nuevas/tocadas — no hay
  herramienta de automatización de navegador disponible en este entorno de ejecución (mismo gap
  documentado en `2026-07-09-mejoras-produccion`, tarea 11.2). La verificación se hizo con
  `npm run build` (typecheck limpio) y con curl extremo a extremo contra la API viva, incluyendo
  casos de error (403 por rol no-owner, cascada de borrado, validación de PocketBase).
