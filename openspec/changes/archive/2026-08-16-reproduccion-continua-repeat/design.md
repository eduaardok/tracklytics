## Context

El reproductor persistente vive en `PlayerContext` (React Context, estado de sesión de
navegador, no persistido en PocketBase ni ClickHouse — se resetea en cada recarga
completa, igual que antes de este cambio). La cola de reproducción (`queue`) y el
historial de "anterior" también son solo de sesión en memoria del cliente. Ninguna
entidad nueva se agrega a PocketBase ni a ClickHouse: este cambio es puramente de
comportamiento del cliente sobre datos que cada listado ya trae consigo.

Antes de este cambio, `play(track)` reproducía un track suelto sin tocar la cola. Solo
dos flujos (radio, mix diario) poblaban la cola manualmente con `play(lista[0])` seguido
de `replaceQueue(lista.slice(1))`.

## Goals / Non-Goals

**Goals:**
- Que reproducir un track desde cualquier listado del catálogo/biblioteca continúe
  automáticamente con el resto de esa lista.
- Agregar modos de repetición de canción y de cola completa, con control visual propio.
- Reusar el mecanismo ya validado de radio/mix diario en vez de duplicar lógica por
  cada listado.

**Non-Goals:**
- Aleatorio (shuffle) — mayor complejidad (mantener orden mezclado sin repetir hasta
  agotar la cola) y menor prioridad frente a repetición para esta iteración.
- Persistir la cola o el modo de repetición entre sesiones/recargas — se mantiene el
  mismo comportamiento de sesión-únicamente que ya tenía la cola.

## Decisions

- **`playList(tracks, startIndex)` centralizado en `PlayerContext`**, en vez de que cada
  listado arme `play(lista[i]); replaceQueue(lista.slice(i+1))` a mano: un solo lugar
  para el mecanismo (ya usado así por radio y mix diario, ahora extraído) y el único
  punto que necesita conocer el snapshot completo de la sesión para repetir-cola.
- **Snapshot de sesión en un ref aparte (`sessionQueueRef`), no derivado de `queue`**:
  `queue` se va vaciando a medida que se reproduce (necesario para que la cola visible
  en la UI baje en tiempo real); repetir-cola necesita la lista *completa* tal como
  empezó la sesión para reencolarla, así que no puede derivarse del estado que ya se
  consumió. Un `play()` suelto (sin pasar por `playList`) resetea este snapshot a un
  único track, para que repetir-cola sobre un track suelto no reencole por error una
  sesión anterior ya terminada.
- **Refs en vez de state para todo lo leído dentro de `advanceQueue`** (modo de
  repetición, track actual, snapshot de sesión): el archivo ya sigue este patrón para
  `queue`/`volumen` porque el ticker de progreso simulado y el handler `onStateChange`
  de YouTube son closures de larga vida que no ven actualizaciones de React state
  directamente — se mantiene la misma convención para no introducir una nueva clase de
  bug de closure obsoleta.
- **"Siguiente" manual siempre avanza, incluso con repetir-canción activo**: es el
  comportamiento esperado de cualquier reproductor — repetir-canción solo actúa sobre el
  fin *natural* del track (temporizador/evento `ENDED`), no sobre un clic explícito en
  Siguiente.
- **Prop `queue` opcional en las cards de track** (`TrackCard`, `TrackGridCard`,
  `LibraryTrackRow`) en vez de una prop obligatoria: mantiene compatibilidad con
  cualquier uso futuro de esas cards que muestre un track aislado sin lista (ej. un
  resultado único), sin forzar a todo consumidor a construir un array de un elemento.

## Risks / Trade-offs

- [Un `enqueue()` manual (agregar un track suelto a la cola desde la UI) no se refleja
  en el snapshot de sesión] → Aceptado: repetir-cola reencola la sesión original que el
  usuario empezó a reproducir, no cualquier agregado manual posterior — es el
  comportamiento más predecible (el usuario sabe qué reencola: lo que puso a sonar, no
  lo que fue agregando sobre la marcha).
- [Reproducir un track fuera de un listado (ej. desde el detalle de la canción) no tiene
  "resto de lista" que encolar] → No es una regresión: ese caso ya se comportaba como
  track suelto antes de este cambio, y sigue igual.
