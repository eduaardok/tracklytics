## MODIFIED Requirements

### Requirement: Subida de un track por un artista con cuenta aprobada
El sistema SHALL permitir a un usuario cuya cuenta de artista esté en estado `aprobada` subir un track (nombre, álbum opcional, género existente, duración y marca de contenido explícito), quedando registrado en `STG_ARTIST_UPLOADS` y su revisión en estado `pendiente`. El sistema SHALL rechazar la subida si el usuario no tiene una cuenta de artista aprobada. Las características de audio de partida del track SHALL calibrarse contra el perfil típico del género elegido (mismo perfil empírico por género que usa la ingesta), en vez de un valor neutro fijo idéntico para cualquier género; si el género no tiene una muestra mínima de tracks de origen, el sistema SHALL usar el perfil general del catálogo como respaldo.

#### Scenario: Subida exitosa de un track
- **WHEN** un usuario con cuenta de artista `aprobada` envía nombre, género válido, duración y marca de contenido explícito para un nuevo track
- **THEN** el sistema registra el track subido asociado a esa cuenta de artista, con su revisión en estado `pendiente`

#### Scenario: Usuario sin cuenta de artista aprobada intenta subir un track
- **WHEN** un usuario sin cuenta de artista, o con cuenta `pendiente` o `rechazada`, intenta subir un track
- **THEN** el sistema rechaza la subida indicando que se requiere una cuenta de artista aprobada

#### Scenario: Las características de audio de partida se calibran contra el género elegido
- **WHEN** un artista sube un track eligiendo un género que cuenta con suficientes tracks de origen para calcular su perfil de audio
- **THEN** el sistema guarda como valores de partida del track características de audio dentro del perfil típico de ese género

#### Scenario: Género sin muestra suficiente usa el perfil general como respaldo
- **WHEN** un artista sube un track eligiendo un género que no cuenta con una muestra mínima de tracks de origen
- **THEN** el sistema guarda como valores de partida del track características de audio dentro del perfil general del catálogo
