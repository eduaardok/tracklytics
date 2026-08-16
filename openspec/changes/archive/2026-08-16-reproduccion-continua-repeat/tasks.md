## 1. Reproductor persistente (PlayerContext)

- [x] 1.1 Agregar `playList(tracks, startIndex)`: reproduce `tracks[startIndex]` y
      encola el resto vía el mecanismo existente de reemplazo de cola.
- [x] 1.2 Agregar snapshot de sesión (`sessionQueueRef`) para poder reencolar la lista
      completa en modo "repetir cola".
- [x] 1.3 Agregar estado `repeatMode` (`none`/`all`/`one`) con ref espejo para lectura
      segura desde los callbacks de larga vida del reproductor.
- [x] 1.4 Ramificar el avance automático de cola: repetir canción reinicia el track
      actual; repetir cola reencola la sesión al agotarse; sin repetición, se detiene
      limpiamente como antes.
- [x] 1.5 Asegurar que el avance manual ("Siguiente") ignore "repetir canción" y avance
      siempre.

## 2. Control visual de repetición

- [x] 2.1 Botón de repetición en la barra de reproducción, cicla entre los 3 modos.
- [x] 2.2 Estado visual distinguible por forma/ícono (no solo color) para cada modo.

## 3. Encolado automático desde listados existentes

- [x] 3.1 Catálogo (vista lista y vista cuadrícula).
- [x] 3.2 Resultados de búsqueda (mejor resultado + lista de canciones).
- [x] 3.3 Tracks de detalle de álbum.
- [x] 3.4 Tracks de detalle de artista.
- [x] 3.5 Favoritos.
- [x] 3.6 Tracks de una playlist.
- [x] 3.7 Historial de reproducción.
- [x] 3.8 Perfil público (playlists de otro usuario).
- [x] 3.9 Secciones de recomendaciones ("Para ti").
- [x] 3.10 Migrar radio y mix diario al mecanismo centralizado (mismo resultado, ahora
      también habilita "repetir cola" para esos dos flujos).

## 4. Verificación

- [x] 4.1 Type-check del frontend sin errores nuevos introducidos por este cambio.
- [x] 4.2 Verificación end-to-end con Playwright: reproducir desde catálogo, confirmar
      "siguiente" disponible y avance correcto; agotar cola sin repetición y confirmar
      detención limpia; activar "repetir canción" y confirmar reinicio automático.
