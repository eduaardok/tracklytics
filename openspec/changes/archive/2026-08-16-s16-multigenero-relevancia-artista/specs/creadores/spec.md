## MODIFIED Requirements

### Requirement: Subida de un track por un artista con cuenta aprobada
El sistema SHALL permitir a un usuario cuya cuenta de artista esté en estado `aprobada` subir un track (nombre, álbum opcional, uno o más géneros existentes, duración y marca de contenido explícito), quedando registrado en `STG_ARTIST_UPLOADS` y su revisión en estado `pendiente`. El sistema SHALL aceptar hasta 5 géneros por track. El sistema SHALL rechazar la subida si el usuario no tiene una cuenta de artista aprobada, o si alguno de los géneros indicados no existe. Las características de audio de partida del track SHALL calibrarse contra el perfil típico del primer género elegido (mismo perfil empírico por género que usa la ingesta), en vez de un valor neutro fijo idéntico para cualquier género; si ese género no tiene una muestra mínima de tracks de origen, el sistema SHALL usar el perfil general del catálogo como respaldo.

#### Scenario: Subida exitosa de un track con un género
- **WHEN** un usuario con cuenta de artista `aprobada` envía nombre, un género válido, duración y marca de contenido explícito para un nuevo track
- **THEN** el sistema registra el track subido asociado a esa cuenta de artista, con su revisión en estado `pendiente`

#### Scenario: Subida exitosa de un track con múltiples géneros
- **WHEN** un usuario con cuenta de artista `aprobada` envía nombre, dos o más géneros válidos, duración y marca de contenido explícito para un nuevo track
- **THEN** el sistema registra el track subido con todos los géneros indicados, y al ser aprobado promueve una fila de `FACT_TRACKS` por cada género, todas compartiendo el mismo `track_id`

#### Scenario: Usuario sin cuenta de artista aprobada intenta subir un track
- **WHEN** un usuario sin cuenta de artista, o con cuenta `pendiente` o `rechazada`, intenta subir un track
- **THEN** el sistema rechaza la subida indicando que se requiere una cuenta de artista aprobada

#### Scenario: Las características de audio de partida se calibran contra el género elegido
- **WHEN** un artista sube un track eligiendo un género que cuenta con suficientes tracks de origen para calcular su perfil de audio
- **THEN** el sistema guarda como valores de partida del track características de audio dentro del perfil típico de ese género

#### Scenario: Género sin muestra suficiente usa el perfil general como respaldo
- **WHEN** un artista sube un track eligiendo un género que no cuenta con una muestra mínima de tracks de origen
- **THEN** el sistema guarda como valores de partida del track características de audio dentro del perfil general del catálogo

### Requirement: Retiro de un track propio por el artista
El sistema SHALL permitir a un artista con cuenta aprobada retirar un track propio, marcándolo con estado `retirado` y ejecutando el takedown equivalente en el catálogo (`FACT_TRACKS.disponible = 0` para todas las filas que compartan el `track_id` del track retirado, sin importar cuántos géneros tenga).

#### Scenario: Retirar un track propio de un solo género
- **WHEN** un artista aprobado retira un track propio que pertenece a un único género
- **THEN** el sistema marca el track como `retirado` y lo oculta del catálogo público

#### Scenario: Retirar un track propio con múltiples géneros
- **WHEN** un artista aprobado retira un track propio que fue promovido a más de una fila de `FACT_TRACKS` (uno por género)
- **THEN** el sistema oculta todas esas filas del catálogo público, no solo la del género principal

## ADDED Requirements

### Requirement: Vista de comentarios recibidos en tracks propios
El sistema SHALL permitir a un artista con cuenta aprobada acceder, desde la lista de sus tracks subidos, a los comentarios recibidos en cada track propio que ya fue aprobado y promovido al catálogo.

#### Scenario: Artista accede a los comentarios de un track propio aprobado
- **WHEN** un artista con cuenta aprobada consulta la lista de sus tracks subidos y selecciona un track ya aprobado y promovido
- **THEN** el sistema le permite ver el hilo de comentarios reales recibidos en ese track

#### Scenario: Track todavía no promovido no ofrece vista de comentarios
- **WHEN** un artista consulta un track propio que todavía está `pendiente` de revisión (sin promover al catálogo)
- **THEN** el sistema no ofrece un enlace a comentarios para ese track, porque todavía no existe en el catálogo real
