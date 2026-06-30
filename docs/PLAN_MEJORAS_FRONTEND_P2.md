> ✅ **Implementado en S6** (ver `BITACORA_S6.md` y README § Historial de sprints). Este
> documento queda como registro histórico del plan original — todas las fases (0 a 9)
> se ejecutaron. La única excepción explícita es la nota de la sección 3.1 sobre audio
> real, que sigue sin implementarse y está repreguntada en `docs/PENDIENTES.md`.

# Plan de Mejoras — Frontend Tracklytics (P2: Reproductor, Favoritos, Playlists, Perfil)

## 0. Contexto y vínculo con la documentación estratégica (EV04)

Estas mejoras corresponden a la fase P2 (50%) y se conectan directamente con la jerarquía OE→OT→OO definida en la documentación estratégica:

- **OT-1.2 Retención y conversión freemium→premium / OO-1.2.1 Gestionar favoritos, playlists e historial** — el reproductor persistente y la cola de reproducción son la base de la "biblioteca personal" que sostiene la retención del usuario B2C.
- **OE1 — Growth Hacking B2B2C** — el catálogo y home son el "gancho de adquisición"; pantallas vacías o poco atractivas debilitan ese gancho.
- **OO-4.5.1 Cruzar engagement propio vs. mercado** — depende de `FACT_ENGAGEMENT_USUARIO` con datos reales de favoritos/historial; mientras esto siga en `localStorage`, ese cruce es inviable. La Fase 0 de este plan resuelve esa dependencia.

## 1. Estado actual revisado (carpeta `app/`)

**Arquitectura:** MPA (multi-page app) — cada `.html` carga `components.js` como módulo ES de forma independiente. No hay estado compartido entre páginas; cada navegación es una recarga completa.

**Reproductor (`renderPlayer` / `playTrack` en `app/js/components.js`):**
- UI completa (barra inferior, portada, título/artista, controles, barra de progreso, volumen).
- No usa un elemento `<audio>` real: el progreso se simula con `setInterval`.
- El estado (`currentTrack`, `isPlaying`, `progress`) son variables de módulo → se pierden por completo al navegar a otra página (la barra vuelve a "Selecciona una canción").
- Los botones "Anterior" y "Siguiente" existen en el HTML pero no tienen `addEventListener` — no hacen nada.
- No existe el concepto de **cola de reproducción**: `playTrack(track)` solo conoce la canción actual, no la lista de donde proviene.

**Favoritos / historial / playlists (`favorites.js`, `history.js`, `playlists.js`):** todo vive en `localStorage` del navegador. No hay tabla en ClickHouse ni endpoints en FastAPI para esto.

**Pantallas existentes:**
- `catalogo/home.html` — saludo + 3 secciones (artistas destacados, géneros populares, top canciones).
- `biblioteca/library.html` — tabs de favoritos / historial / playlists, con estados vacíos en texto plano sin estilo (`pl-empty`, `detail-empty`).
- `catalogo/catalog.html` — lista de canciones con filtros de género/orden y búsqueda.
- `catalogo/track.html`, `artist.html`, `album.html` — páginas de detalle.
- `autenticacion/profile.html` — solo edición de nombre.

## 2. Fase 0 — Migración de datos a ClickHouse/PocketBase (prerequisito de backend)

Esta fase implementa lo diseñado en la Fase 3 del documento estratégico (`FACT_ENGAGEMENT_USUARIO`) y resuelve la deuda técnica de `PENDIENTES.md`. Es prerequisito de las secciones 4 (Biblioteca con estadísticas) y 5 (Home "Continuar escuchando"), porque esas vistas necesitan datos reales de uso, no solo locales al navegador.

### 2.1 Esquema de datos nuevo

**ClickHouse — `FACT_ENGAGEMENT_USUARIO`** (eventos de uso, alta frecuencia, append-only — encaja con el motor MergeTree):
- `engagement_id` (UUID), `user_id` (String, id de PocketBase), `fact_id` (UInt64, FK a FACT_TRACKS), `event_type` (Enum: `favorito_add`, `favorito_remove`, `reproduccion`), `event_timestamp` (DateTime), `is_synthetic` (UInt8), `source` (`app` | `referencia`).
- Engine `MergeTree() ORDER BY (user_id, event_timestamp)`.

**PocketBase — colecciones nuevas** (datos relacionales de baja cardinalidad, con reordenamiento/CRUD — no encajan bien en un motor columnar append-only):
- `playlists`: `id`, `user` (relación a `users`), `name`, `created`.
- `playlist_tracks`: `id`, `playlist` (relación a `playlists`), `fact_id`, `position`, `created`.

### 2.2 Endpoints FastAPI nuevos (paquete `biblioteca`)
- `GET/POST/DELETE /biblioteca/favoritos`
- `POST /biblioteca/historial` (registra evento de reproducción), `GET /biblioteca/historial`
- `GET/POST/DELETE /biblioteca/playlists` y `/biblioteca/playlists/{id}/tracks`

### 2.3 DAG nuevo — `engagement_referencia`
- Independiente del DAG de catálogo (Bronze/Silver/Gold), con dependencia: se ejecuta después de que el DAG de catálogo cargue la semana.
- Genera eventos de referencia (`is_synthetic=true`, `source='referencia'`) correlacionados con `popularity` (tracks más populares del catálogo reciben proporcionalmente más eventos), distribuidos entre un conjunto de usuarios de referencia.
- Seed propio y reproducible (consistente con el patrón ya usado para el catálogo).
- Esto habilita la vista "Mercado vs. Tracklytics" (OO-4.5.1) desde el primer ciclo, sin esperar a que usuarios reales generen suficiente actividad.

### 2.4 Migración del frontend
- `favorites.js` y `history.js`: reemplazar lectura/escritura de `localStorage` por llamadas a `/biblioteca/favoritos` y `/biblioteca/historial`, con una caché en memoria por sesión para no repetir peticiones en cada render.
- `playlists.js`: reemplazar `localStorage` por los endpoints de `/biblioteca/playlists`.
- Opcional: script de migración única — al primer login tras el despliegue, leer lo que el usuario tenga en `localStorage` y subirlo vía API, luego limpiar `localStorage`.

## 3. Mejoras funcionales del reproductor

### 3.1 Reproductor persistente entre páginas — Prioridad 1
Como el dataset no incluye URLs de audio reproducibles (no hay `preview_url`), la reproducción seguirá siendo **simulada** — pero el *estado* debe persistir y sentirse continuo.

Enfoque:
- Guardar `currentTrack`, `queue`, posición (`startedAt` timestamp + `elapsedMs`), `isPlaying` y `volumen` en `localStorage` (esto es estado de sesión/UI, no datos de negocio — se queda en el navegador, independiente de la Fase 0).
- En cada `renderPlayer()`, leer ese estado y "rehidratar" la barra (título, artista, progreso calculado como `Date.now() - startedAt`, ícono play/pausa).
- Sincronizar cambios entre pestañas abiertas con el evento `storage`.
- Cada `playTrack()` real (no solo rehidratación) dispara `POST /biblioteca/historial` (Fase 0) para registrar el evento de reproducción.
- Mejora futura opcional (fuera de P2): si se decide usar audio real, evaluar previews de la API de Spotify (requiere autenticación adicional y maneja CORS).

### 3.2 Cola de reproducción (queue)
Depende de 3.1.
- Al reproducir desde una lista (catálogo, álbum, playlist, favoritos, resultados de búsqueda), encolar el resto de la lista a partir de la canción seleccionada.
- Botones "Anterior"/"Siguiente" funcionales recorriendo la cola.
- Panel "Cola" accesible desde el reproductor: próximas canciones, opción de quitar de la cola.
- Fase posterior (opcional): aleatorio (shuffle) y repetir (repeat).

### 3.3 Acciones rápidas relacionadas
- "Reproducir todo" / "Aleatorio" en álbum, playlist y biblioteca (usa la cola de 3.2).
- Reanudar automáticamente la reproducción al recargar la página (mismo mecanismo de 3.1).

## 4. Mejoras visuales por pantalla

### Home (`catalogo/home.html`)
- Hoy: saludo + 3 listas simples. Se siente plano.
- Propuestas:
  - Sección **"Continuar escuchando"**, alimentada por `/biblioteca/historial` (Fase 0).
  - Sección **"Para ti"**: recomendaciones simples basadas en géneros de favoritos (lógica básica del lado cliente).
  - "Portadas" generadas por gradiente según `genreColor()` (ya existe la paleta `GENRES_COLORS`) para dar identidad visual sin depender de imágenes reales.

### Biblioteca (`biblioteca/library.html`)
- Estados vacíos actuales son texto plano (`pl-empty`, `detail-empty`) sin ícono ni llamada a la acción.
- Propuestas:
  - Empty states ilustrados (ícono Lucide + texto + botón "Explorar catálogo").
  - Resumen/estadísticas arriba: total de favoritos, playlists, canciones escuchadas (desde `/biblioteca/*`, Fase 0).
  - Tarjetas de playlist con "portada" en mosaico de colores de género de sus primeras canciones.

### Catálogo (`catalogo/catalog.html`)
- Hoy: lista de filas simples.
- Propuestas:
  - Filtros de género como chips con color (usa `GENRES_COLORS`).
  - Alternativa de vista en grid/tarjetas con portada por gradiente, manteniendo la vista de lista actual como opción.

### Detalle de track/artista/álbum
- Propuestas:
  - Encabezado tipo "hero" con gradiente de color según género/artista.
  - Secciones "Más de este artista" / "Canciones similares" (por género) para evitar pantallas cortas y dar más exploración (refuerza OE1).

### Perfil (`autenticacion/profile.html`)
- Hoy: solo editar nombre.
- Propuestas:
  - Resumen de actividad: nº de favoritos, playlists, canciones en historial (Fase 0).
  - Información de cuenta (rol, fecha de registro si está disponible en PocketBase).

## 5. Mejoras transversales de diseño
- Empty states consistentes (ícono + mensaje + CTA) en toda la app, no solo biblioteca.
- Skeletons de carga (placeholders animados) en lugar de solo el spinner genérico.
- "Cover art" por gradiente como sistema visual consistente para tracks/álbumes/playlists (sin depender de imágenes externas).
- Microinteracciones: hover/active en filas de tracks, botones, tarjetas.
- Revisión responsive de la barra del reproductor en pantallas pequeñas.

## 6. Orden de implementación propuesto

1. **Fase 0 — Backend/Datos**: esquema ClickHouse/PocketBase (2.1) → endpoints FastAPI (2.2) → DAG `engagement_referencia` (2.3) → migración de `favorites.js`/`history.js`/`playlists.js` (2.4).
2. **Reproductor persistente** (3.1) — depende de 2.4 para el registro de historial; el estado de UI en sí es independiente.
3. **Cola de reproducción** (3.2) — depende de 2.
4. **Empty states + sistema de "cover art" por gradiente** — transversal, impacto visual rápido y bajo riesgo, no depende de Fase 0.
5. **Home**: secciones "Continuar escuchando" y "Para ti" — depende de Fase 0.
6. **Biblioteca**: estadísticas + tarjetas de playlist — depende de Fase 0.
7. **Catálogo**: chips de género + vista grid opcional.
8. **Detalle (track/artist/album)**: hero + secciones relacionadas.
9. **Perfil**: estadísticas de actividad — depende de Fase 0.

Cada punto se trabajará con pruebas entre pasos, generando un prompt para Claude Code por feature. Dado que la Fase 0 es la más grande y bloquea varios puntos visuales, se puede dividir en sub-prompts (esquema → API → DAG → frontend) en lugar de uno solo.