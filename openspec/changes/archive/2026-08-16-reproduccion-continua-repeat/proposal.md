## Why

Tocar reproducir sobre un track suelto dentro de un listado (catálogo, resultados de
búsqueda, tracks de un álbum/artista, playlist, favoritos, historial) reproduce solo
esa canción: al terminar, el reproductor no encuentra nada más en la cola y la
reproducción se corta en silencio, sin aviso al usuario. Solo la radio y el mix diario
encolan correctamente el resto de su lista. Este comportamiento rompe el modelo mental
universal de un servicio de música ("reproducción en contexto": tocar play dentro de un
álbum/playlist/artista continúa con el resto). Tampoco existe repetición de canción ni
de cola — funcionalidad esperada de cualquier reproductor.

## What Changes

- `play()` invocado desde cualquier listado del catálogo (tracks de catálogo, resultados
  de búsqueda, álbum, artista, playlist, favoritos, historial) ahora encola
  automáticamente el resto de esa lista, con el mismo mecanismo que ya usaban la radio y
  el mix diario — reactiva los botones de transporte Anterior/Siguiente en todo listado.
- Nuevo modo de repetición de reproductor (`repeatMode`: apagado / repetir cola /
  repetir canción):
  - Repetir canción: al terminar el track actual, se reinicia en vez de avanzar.
  - Repetir cola: al agotarse la cola, se reencola desde el principio en vez de
    detenerse la reproducción.
  - Control visual de 3 estados en la barra de reproducción, con ícono e indicador
    propios por estado (no solo color).
- Aleatorio (shuffle) queda explícitamente fuera de alcance de este cambio.

## Capabilities

### New Capabilities
(ninguna — este cambio extiende comportamiento ya cubierto por `experiencia`)

### Modified Capabilities
- `experiencia`: se agregan requisitos de encolado automático desde cualquier listado
  reproducible y de modos de repetición del reproductor persistente (hoy la spec solo
  cubre radio, mix diario y reproducción simulada/real de un track individual).

## Impact

- Frontend: contexto del reproductor persistente (nuevo método de reproducción en
  contexto + estado de modo de repetición), barra de reproducción (control visual de
  repetición), y todos los listados de tracks del catálogo, biblioteca y
  recomendaciones (pasan a informar la lista completa al reproducir).
- No afecta APIs de backend ni modelo de datos — es comportamiento 100% de cliente sobre
  datos ya disponibles en cada listado.
