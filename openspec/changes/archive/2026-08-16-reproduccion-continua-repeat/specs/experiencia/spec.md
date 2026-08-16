## ADDED Requirements

### Requirement: Reproducción en contexto desde cualquier listado
El sistema SHALL encolar automáticamente, al iniciar la reproducción de un track desde un listado de tracks (catálogo, resultados de búsqueda, tracks de un álbum, tracks de un artista, una playlist, favoritos o historial de reproducción), el resto de los tracks de ese listado en el mismo orden en que se muestran, a partir del track siguiente al reproducido. El reproductor persistente SHALL exponer que existe un track siguiente disponible mientras la cola resultante no esté vacía.

#### Scenario: Reproducir un track intermedio de un listado
- **WHEN** un usuario reproduce el tercer track de una lista de diez tracks mostrados en
  el catálogo
- **THEN** el sistema reproduce ese track y encola los siete tracks restantes de la
  lista, en el mismo orden, y el control de "siguiente" queda disponible

#### Scenario: Reproducir el último track de un listado
- **WHEN** un usuario reproduce el último track de un listado
- **THEN** el sistema reproduce ese track sin encolar ningún track adicional, y el
  control de "siguiente" queda no disponible salvo que la repetición de cola esté activa

#### Scenario: Avanzar automáticamente al terminar un track encolado en contexto
- **WHEN** un track reproducido desde un listado termina de forma natural y existen
  tracks encolados a partir de ese listado
- **THEN** el sistema reproduce automáticamente el siguiente track encolado sin
  intervención del usuario

### Requirement: Modo de repetición del reproductor
El reproductor persistente SHALL soportar tres modos de repetición: apagado, repetir canción actual, y repetir toda la cola. El modo activo SHALL persistir mientras dure la sesión de reproducción y SHALL ser visible mediante un control con estado visual propio para cada uno de los tres modos (no distinguible solo por color).

#### Scenario: Repetir canción actual
- **WHEN** el modo de repetición está en "repetir canción" y el track en reproducción
  termina de forma natural
- **THEN** el sistema reinicia el mismo track desde el comienzo en vez de avanzar a
  cualquier otro track, sin alterar el contenido de la cola

#### Scenario: Repetir toda la cola al agotarse
- **WHEN** el modo de repetición está en "repetir cola", la cola de reproducción se
  vacía por completo, y el track final de la lista original termina de forma natural
- **THEN** el sistema reencola la lista completa desde su primer track y continúa la
  reproducción en el mismo orden original

#### Scenario: Avance manual ignora "repetir canción"
- **WHEN** el modo de repetición está en "repetir canción" y el usuario acciona
  manualmente el control de "siguiente"
- **THEN** el sistema avanza al siguiente track disponible en la cola en vez de reiniciar
  el track actual

#### Scenario: Fin de reproducción sin repetición activa
- **WHEN** el modo de repetición está apagado y la cola de reproducción se agota tras el
  fin natural del último track
- **THEN** el sistema detiene la reproducción de forma limpia, sin iniciar ningún audio
  adicional y sin dejar el reproductor en un estado de error
