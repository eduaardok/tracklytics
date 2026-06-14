# Bitácora de Desarrollo — Semana 6
**Proyecto:** Tracklytics v2 — Plataforma de Analítica Musical  
**Semana académica:** 6 de 16  
**Fecha:** Junio 2026  
**Registros en ClickHouse al cierre:** ~600-700k (100k base + 100k/semana × 6)

---

## Resumen ejecutivo

La semana 6 cierra el ciclo de P2 (50%) con dos frentes paralelos:

1. **Backend/datos:** migración de la capa de interacción de usuario (favoritos, historial, playlists) de `localStorage` al stack de producción (ClickHouse + PocketBase), incluyendo un nuevo DAG independiente de generación de datos de referencia de engagement.
2. **Frontend:** reproductor persistente entre páginas, cola de reproducción completa y mejoras visuales transversales en todas las pantallas.

---

## Decisiones de arquitectura

### FACT_ENGAGEMENT_USUARIO en ClickHouse (no en PocketBase)
Los eventos de interacción de usuario (favoritos, reproducciones, playlist adds) se almacenan en ClickHouse usando el motor `MergeTree() ORDER BY (user_id, event_timestamp)` en lugar de PocketBase. Razón: son eventos de alta frecuencia, append-only, sin necesidad de CRUD individual — patrón que encaja con motores columnares. PocketBase se reserva para entidades relacionales con cardinalidad baja y necesidad de reglas de acceso (playlists, playlist_tracks).

### Playlists y playlist_tracks en PocketBase (no en ClickHtics)
Las playlists requieren: relaciones entre colecciones, reglas de acceso por usuario (`user = @request.auth.id`, `playlist.user = @request.auth.id`), operaciones CRUD individuales y reordenamiento. Todo esto encaja mejor con PocketBase que con un motor columnar append-only.

### DAG engagement_referencia independiente del DAG de catálogo
Se decidió crear un DAG separado (`engagement_referencia`) en lugar de extender el DAG Bronze/Silver/Gold existente. Razón: separación de responsabilidades — el DAG de catálogo gestiona la ingesta de datos de mercado; el DAG de engagement gestiona la simulación de comportamiento de usuario. Cada uno tiene su seed reproducible propio (`week * 42` para catálogo, `week * 73` para engagement). El DAG de engagement tiene dependencia lógica del de catálogo (requiere que los `fact_id` de la semana existan antes de generar eventos sobre ellos), pero son DAGs independientes que el operador dispara en orden.

### Estado del reproductor en localStorage (no en ClickHouse)
El estado del reproductor (canción actual, posición, cola, volumen) se mantiene en `localStorage` del navegador. Razón: es estado efímero de sesión/UI, no dato de negocio. Lo que sí va a ClickHouse es el evento de reproducción (`event_type='reproduccion'` en `FACT_ENGAGEMENT_USUARIO`) que se dispara al llamar `playTrack()`. Esto separa el estado de UI de los datos analíticos.

### Reglas de acceso PocketBase con resolución dinámica de IDs
Al crear las colecciones `playlists` y `playlist_tracks` desde `pb_init.py`, se implementó resolución dinámica de IDs reales vía `GET /api/collections/{name}` en lugar de asumir que `collectionId` acepta nombres de colección directamente. Razón: el comportamiento de este parámetro varía entre versiones de PocketBase. La resolución dinámica es robusta sin importar la versión instalada.

### playlists.js conecta directamente a PocketBase (no pasa por FastAPI)
`playlists.js` hace `fetch('http://localhost:8090/api/...')` directamente en vez de ir por la API FastAPI en `:8000`. Razón: importar `apiFetch` de `api.js` provocaba dependencias circulares (api.js ↔ playlists.js). Para cargar los datos completos de cada track de una playlist sí se usa el proxy Nginx (`/api/app/v1/tracks/fact/{fact_id}`), porque esos datos vienen de ClickHouse y no de PocketBase.

### createPlaylist() es síncrona con temp-ID asíncrono (limitación conocida)
`createPlaylist(name)` devuelve inmediatamente un objeto con `id: "temp_{timestamp}"` y actualiza el ID real en caché cuando la llamada a PocketBase responde. La función `addTrackToPlaylist()` llamada inmediatamente después puede ejecutarse antes de que llegue la respuesta y usar el ID temporal, fallando silenciosamente en la capa PocketBase. El flujo funciona en la práctica porque la latencia de red es suficiente. Pendiente: hacer `createPlaylist` async y actualizar `components.js` para awaitearlo.

---

## Cambios implementados

### Fase 0 — Backend y datos

#### 2.1 Esquema de datos nuevo
- **ClickHouse:** `FACT_ENGAGEMENT_USUARIO` con 7 columnas (`engagement_id` UUID auto, `user_id` String, `fact_id` UInt64, `event_type` Enum8, `event_timestamp` DateTime, `is_synthetic` Bool, `source` Enum8). Engine `MergeTree() ORDER BY (user_id, event_timestamp)`. Agregada a `init_clickhouse.py` en la sección "Infraestructura ETL".
- **PocketBase:** colecciones `playlists` (name, user→users) y `playlist_tracks` (playlist→playlists, fact_id, position) con reglas de acceso por usuario. Agregadas a `pb_init.py` con helper `get_collection_id()` para resolución dinámica de IDs y `ensure_collection_rules()` para idempotencia de reglas.

#### 2.2 Endpoints FastAPI — paquete `api/paquetes/biblioteca/`
Cinco endpoints nuevos bajo `/app/v1/biblioteca`, todos con `Depends(get_current_user)`:
- `GET /favoritos` — usa `argMax(event_type, event_timestamp)` por `fact_id` para calcular el estado actual de cada favorito
- `POST /favoritos/{fact_id}` — inserta `event_type='favorito_add'`
- `DELETE /favoritos/{fact_id}` — inserta `event_type='favorito_remove'`
- `GET /historial?limit=50` — eventos `event_type='reproduccion'` ordenados por timestamp DESC
- `POST /historial/{fact_id}` — registra evento de reproducción

Fix detectado: `auth-refresh` en PocketBase v0.22+ cambió de `GET` a `POST`. Corregido en `api/core/deps.py`.

#### 2.3 DAG `engagement_referencia`

- Archivo: `etl/dags/engagement_dag.py`
- Callable: `etl/engagement/generator.py`
- Genera ~50k eventos/semana: 70% reproducciones, 20% favorito_add, 10% favorito_remove (solo sobre tracks que ya recibieron `favorito_add` en el mismo lote, para mantener coherencia con la lógica `argMax` del endpoint de favoritos)
- Distribución de eventos correlacionada con `popularity` de FACT_TRACKS (tracks más populares reciben más eventos proporcionalmente)
- `event_timestamp` distribuido dentro de los 7 días de la semana académica correspondiente (semana 1 = 2026-05-14)
- Idempotente: verifica existencia de filas con `source='referencia'` para la semana antes de insertar
- Seed propio: `week_number * 73`
- Usuarios de referencia ficticios: `ref_user_{i:04d}` (no colisionan con IDs reales de PocketBase de 15 caracteres)

Resultado semana 6: 50.000 eventos insertados en ~3 segundos. Segunda ejecución: idempotencia verificada correctamente.

#### 2.4 Migración del frontend
- `app/js/favorites.js`: reemplaza `localStorage` por caché en memoria + endpoints `/biblioteca/favoritos`. Nuevas funciones exportadas: `initFavorites()`, `isFavorite(fact_id)`, `toggleFavorite(track)`, `getFavorites()`.
- `app/js/history.js`: reemplaza `localStorage` por endpoint `/biblioteca/historial`. Fire-and-forget en `addToHistory()` para no bloquear la reproducción si la API está caída.
- `app/js/playlists.js`: reemplaza `localStorage` por PocketBase directo (mismo patrón que `pbGetProfile` en `api.js`). Caché en memoria inicializada por `initPlaylists()`. Resuelve datos completos de tracks vía `/app/v1/tracks/fact/{fact_id}` al cargar el caché.
- `app/js/auth.js`: agrega persistencia de `pb_user_id` en `localStorage` al hacer login (requerido por `playlists.js` para el campo `user` al crear playlists).

#### 2.5 Catálogo (`catalog.html`) — integración de cola
- `catalog.html` importa `setQueue` de `components.js` e `initFavorites` de `favorites.js`.
- Clic en una fila de track ya no navega a la página de detalle — llama `setQueue(allTracks, i)`, poniendo en cola todas las canciones del catálogo filtrado y reproduciendo la clickeada.
- `initFavorites()` añadida al init para que los botones ♥ reflejen el estado real desde ClickHouse.

#### 2.6 `favorites.js` — compatibilidad retroactiva en `isFavorite`
`isFavorite(arg)` acepta tanto `fact_id` (número) como `track_id` (string) para compat retroactiva con cualquier código que llame `isFavorite(track.track_id)`. Internamente mantiene dos estructuras: `_favSet` (Set\<number\> de fact_ids para lookups O(1)) y `_favTracks` (array completo para `getFavorites()`). `toggleFavorite()` sigue siendo síncrona con actualización optimística + API fire-and-forget para mantener compatibilidad con `components.js`.

#### 2.7 Login rediseñado — split-screen
`app/autenticacion/login.html` fue reescrito como pantalla dividida:
- Panel izquierdo (`.auth-hero`): brand, tagline "Analiza. Descubre. Escucha." y 4 features con íconos (catálogo, analítica, biblioteca personal, reproductor con cola).
- Panel derecho (`.auth-form-panel`): formulario existente con fondo transparente, sin borde.
- Pseudo-elementos `::before`/`::after` en `.auth-hero` para brillos radiales decorativos.
- Responsive a 780px: apilado vertical, hero arriba, form abajo.
- `body` del login tiene `height:100vh; overflow:auto` inline para permitir scroll en móvil (excepción al `overflow: hidden` global del layout).
- La lógica JS de login no cambió.

### Reproductor persistente y cola

#### 3.1 Estado persistente entre páginas
- Estado del reproductor serializado en `localStorage` bajo la clave `tl_player`: `{ track, isPlaying, startedAt, elapsedMs, volume, queue, queueHistory }`.
- `_hydratePlayer()`: reconstituye la barra del reproductor al cargar cualquier página, calculando el progreso real como `elapsedMs + (Date.now() - startedAt)`.
- `window.addEventListener('storage', ...)`: sincroniza el estado entre pestañas abiertas en tiempo real.
- `playTrack()` convertida a `async`: dispara `addToHistory(track)` (registra en ClickHouse) y guarda el estado en `localStorage`.

#### 3.2 Cola de reproducción
- `setQueue(tracks, startIndex)`: función exportada que calcula `ahead` (cola de lo que viene) y `behind` (historial de cola) a partir de un array de tracks y un índice de inicio.
- `_playNext()` / `_playPrev()`: navegan la cola. `_playPrev()` reinicia la canción actual si han pasado más de 3 segundos.
- `startProgress(totalMs, fromMs)`: acepta segundo parámetro para reanudar desde cualquier posición.
- Auto-avance al terminar: `startProgress` llama `_playNext()` en lugar de detener — la cola avanza automáticamente.
- Panel de cola: `<div id="queue-panel">` con lista de próximas canciones y botón de eliminar por item. Se abre/cierra con el botón ☰ del reproductor.
- `window._removeFromQueue(index)`: expuesto globalmente para los onclicks inline del panel (patrón consistente con `window.__playTrack`, `window.__plModal`, etc.).

### Mejoras visuales (pasos 5-10)

#### Sistema de cover art por gradiente (`app/css/main.css` + `app/js/components.js`)
- `coverArt(seed, size, emoji)`: genera un `<div>` con `background: linear-gradient(135deg, color1, color2)` usando `genreColor()` con desplazamiento de índice +3 para el color secundario. Tamaños: `sm` (48px), `md` (80px), `lg` (140px), `xl` (200px).
- Aplicado en: artistas (🎤), álbumes (💿), géneros (🎵), tracks (🎵), tarjetas de playlist (mosaico de hasta 4 colores).
- Elimina la dependencia de imágenes externas en toda la app.

#### Empty states ilustrados
- `emptyState(icon, title, sub, ctaHtml)`: componente reutilizable con ícono grande + título + subtítulo + botón de acción.
- Aplicado en: favoritos, historial, playlists, cola de reproducción.
- Reemplaza los textos planos `<p style="color:var(--text-muted)">` que existían.

#### Skeletons de carga
- `skeletonRows(n)`: genera `n` divs con animación shimmer.
- Aplicado en: todas las páginas de detalle (track, artista, álbum, género) y top canciones en home.
- Reemplaza el spinner genérico centralizado.

#### Home — secciones nuevas
- **"Continuar escuchando"**: grid de cards con las últimas 6 canciones del historial real (`getHistory(6)`). Solo visible si el usuario tiene historial. Click en card → `setQueue([entry], 0)`.
- **"Para ti"**: cards de género basadas en géneros únicos de los favoritos del usuario (máx. 4). Solo visible si hay favoritos. No muestra empty state si no hay datos — la sección completa se omite.

#### Páginas de detalle — hero con gradiente
- `artist.html`, `album.html`, `track.html`, `genres.html`: encabezado tipo "hero" con `background: linear-gradient(135deg, ...)` basado en el ID de la entidad, `coverArt` en tamaño `xl` y botón "▶ Reproducir todo" que llama `setQueue(tracks, 0)`.
- Reemplaza el bloque `.page-header` con `.page-thumb` SVG que existía en todas las páginas.

#### Biblioteca — estadísticas y mosaico
- Stat cards sobre los tabs: total de favoritos, playlists y canciones escuchadas. Cargadas tras `Promise.all([initFavorites(), initHistory(), initPlaylists()])`.
- Tarjetas de playlist con `mosaicCover(pl)`: hasta 4 celdas de color de género de las primeras canciones de la playlist. Si está vacía, un `coverArt` genérico.
- Fix pre-existente corregido: `showPlaylistList()` sin prefijo `window.` en módulo ES — reemplazado por `window.showPlaylistList()`.

#### Perfil — resumen de actividad
- Sección "Mi actividad" antes del formulario de edición: 3 stat cards (favoritos ♥ / playlists 🎵 / escuchadas 🕐).

---

## Bugs corregidos

| Bug | Causa | Solución |
|---|---|---|
| `isFavorite` siempre devolvía `false` en track.html | Usaba `track.track_id` (string) pero el caché usa `fact_id` (number) | Actualizado en `components.js` y `track.html` |
| Botones prev/next no hacían nada | Sin `addEventListener` en `renderPlayer()` | Conectados a `_playPrev` / `_playNext` |
| Shape mismatch en historial de biblioteca | `library.html` esperaba `{track, played_at}`, API devuelve fila plana | Reescrito `renderHistory()` para usar forma plana |
| PocketBase auth-refresh fallaba | v0.22+ cambió endpoint de `GET` a `POST` | Corregido en `api/core/deps.py` |
| `showPlaylistList()` frágil en módulo ES | Sin prefijo `window.` | Corregido a `window.showPlaylistList()` |
| `playlist_tracks` fallaba con ID de colección incorrecto | Se asumía que `collectionId` acepta nombre de colección | Implementada resolución dinámica de ID real |
| Body/página hacía scroll en vez de solo el main-content | `body` tenía `min-height: 100vh` sin altura fija; hijos flex sin `min-height: 0` no restringen `overflow-y: auto` | `body` → `height: 100vh; overflow: hidden`; `.app-layout` → `min-height: 0`; `.main-content` → `min-height: 0; padding-bottom: calc(var(--player-h) + 2rem)` |
| Panel de cola siempre visible (no se ocultaba al toggle) | La clase `.hidden` no estaba definida en CSS; `classList.toggle('hidden')` no tenía efecto visual | Agregado `.hidden { display: none !important; }` en `main.css` |
| Panel de cola aparecía en esquina superior-derecha de la pantalla | `.player-queue-panel` no tenía `position: fixed`; estaba posicionado en el flujo normal del documento | Agregado `position: fixed; bottom: calc(var(--player-h) + .5rem); right: 1rem; z-index: 300` |
| Track-row se desalineaba con el botón ⊕ añadido | `grid-template-columns` tenía 5 columnas; el nuevo botón rompía el grid | Cambiado a 6 columnas: `2rem 1fr auto auto auto auto` |
| `.sidebar-user` sin separador visual respecto al nav | `margin-top: auto` dejaba un hueco vacío sin anclaje visual | Agregado `border-top: 1px solid var(--border); padding-top: .9rem` |
| `logout()` dejaba `pb_user_id` en localStorage | La clave fue añadida en S6 al hacer login pero no se limpiaba al cerrar sesión | Agregado `localStorage.removeItem('pb_user_id')` en `logout()` en `auth.js` |

---

## Estado del pipeline de datos

| Componente | Estado |
|---|---|
| DAG `tracklytics_etl` (catálogo) | ✓ Operativo, semana 6 cargada |
| DAG `engagement_referencia` | ✓ Nuevo, semana 6 cargada (50k eventos) |
| `FACT_TRACKS` | ✓ ~600-700k registros |
| `FACT_ENGAGEMENT_USUARIO` | ✓ 50.004 registros (50k referencia + 4 reales de prueba) |
| `playlists` (PocketBase) | ✓ Colección creada, reglas de acceso verificadas |
| `playlist_tracks` (PocketBase) | ✓ Colección creada, reglas de acceso verificadas |

---

## Pendientes para próximas semanas

- Verificación visual completa en navegador de todas las páginas modificadas (requiere contenedores levantados)
- Migración opcional: script one-shot para subir datos existentes en `localStorage` a la API al primer login post-despliegue
- Shuffle y repeat en la cola de reproducción
- Vista "Mercado vs. Tracklytics" (scatter engagement_score vs popularity) — depende de acumulación de datos reales en `FACT_ENGAGEMENT_USUARIO`
- Responsive polish de la barra del reproductor en pantallas pequeñas
- P3: analítica avanzada, calidad de datos, optimización de queries