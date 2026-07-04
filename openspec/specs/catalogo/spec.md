# Capability: catalogo

## Objetivo

Permitir que un Usuario B2C o Cliente B2B explore el catálogo musical global, consulte el detalle de cualquier entidad musical, y gestione su biblioteca personal (favoritos, playlists, historial de reproducción).

## Contexto

Tracklytics necesita una capa de exploración musical funcional para sostener el modelo B2C freemium: el catálogo es el gancho de adquisición, y la biblioteca personal (favoritos/playlists/historial) es la fuente de datos de comportamiento que alimenta el motor analítico B2B (modelo data flywheel).

## Actores

- **Usuario B2C**: consumidor final, navega catálogo y gestiona su biblioteca.
- **Cliente B2B**: también explora catálogo (acceso de solo lectura al catálogo, sin biblioteca personal).

## Tabla de trazabilidad

| Nivel empresarial | Departamento | Paquete | Caso de uso | Historia de usuario |
|---|---|---|---|---|
| Operativo | Usuario B2C / Cliente B2B | Catálogo y biblioteca personal | CU-O02 Buscar y explorar catálogo musical | Como Usuario B2C, quiero buscar tracks por nombre, artista o género, para descubrir música de mi interés |
| Operativo | Usuario B2C / Cliente B2B | Catálogo y biblioteca personal | CU-O03 Consultar detalle de track/artista/álbum/género | Como Usuario B2C, quiero ver el detalle completo de un track, para conocer sus características antes de guardarlo |
| Operativo | Usuario B2C | Catálogo y biblioteca personal | CU-O04 Gestionar favoritos y playlists | Como Usuario B2C, quiero guardar tracks en favoritos y organizarlos en playlists, para acceder rápido a mi música preferida |
| Operativo | Usuario B2C | Catálogo y biblioteca personal | CU-O05 Consultar historial de reproducción | Como Usuario B2C, quiero ver mi historial de reproducción, para recordar qué he escuchado |

## Requirements

### Requirement: Búsqueda de catálogo musical
El sistema SHALL permitir buscar tracks por nombre, artista o género contra FACT_TRACKS en ClickHouse, con resultados paginados, y SHALL responder en menos de 1 segundo bajo condiciones normales de carga (~700k registros en FACT_TRACKS).

#### Scenario: Búsqueda por nombre, artista o género
- **WHEN** un usuario autenticado o Cliente B2B ingresa un término de búsqueda válido (nombre, artista o género)
- **THEN** el sistema retorna una lista paginada de tracks coincidentes en menos de 1 segundo

### Requirement: Filtro de búsqueda por género
El sistema SHALL permitir filtrar los resultados de búsqueda por género, entre los 114 valores de DIM_GENRES.

#### Scenario: Filtrar resultados por género
- **WHEN** un usuario aplica un filtro de género sobre una búsqueda de catálogo
- **THEN** el sistema retorna únicamente los tracks que pertenecen al género seleccionado

### Requirement: Detalle de track por fact_id
El sistema SHALL mostrar el detalle de un track identificado por su `fact_id` como punto de entrada, resolviendo internamente todos los géneros asociados al mismo `track_id` y presentándolos agregados, incluyendo sus 7 atributos de audio principales.

#### Scenario: Consultar detalle de un track con un único género
- **WHEN** un usuario solicita el detalle de un track mediante su `fact_id` y ese track pertenece a un solo género
- **THEN** el sistema muestra los 7 atributos de audio principales del track junto con su artista, álbum y el género único

#### Scenario: Consultar detalle de un track con múltiples géneros
- **WHEN** un usuario solicita el detalle de un track mediante su `fact_id` y ese track pertenece a más de un género en FACT_TRACKS
- **THEN** el sistema muestra los 7 atributos de audio principales del track junto con su artista, álbum y todos sus géneros concatenados (ej. "pop / dance pop"), sin repetir la fila por cada género

### Requirement: Tracks con múltiples géneros en vistas de lista
El sistema SHALL mostrar cada track una única vez en todas las vistas de lista (top tracks, por artista, por álbum, búsqueda, favoritos, historial), agregando todos los géneros del track en un solo campo cuando este pertenezca a más de uno.

#### Scenario: Track multi-género en lista de álbum, artista o búsqueda
- **WHEN** un usuario navega a la lista de canciones de un álbum, artista o resultado de búsqueda, y hay tracks que pertenecen a múltiples géneros
- **THEN** el sistema muestra cada track una sola vez con todos sus géneros concatenados (ej. "pop / dance pop"), sin duplicar la fila por género

#### Scenario: Track multi-género en favoritos o historial
- **WHEN** un usuario consulta su lista de favoritos o su historial de reproducción, y alguno de los tracks pertenece a múltiples géneros
- **THEN** el sistema muestra todos los géneros del track concatenados (ej. "pop / dance pop") en esa vista, con la misma presentación que en las listas de catálogo

#### Scenario: Track con un único género en lista
- **WHEN** un track pertenece a un único género
- **THEN** el sistema lo muestra normalmente con su género sin concatenación

### Requirement: Navegación cruzada desde el detalle
El sistema SHALL permitir navegación cruzada entre track, artista, álbum y género desde la vista de detalle.

#### Scenario: Navegar desde un track a su artista, álbum o género
- **WHEN** un usuario está en la vista de detalle de un track
- **THEN** el sistema permite navegar a la vista del artista, álbum o género asociado

### Requirement: Gestión de favoritos
El sistema SHALL permitir agregar o quitar un track de favoritos para el usuario autenticado, reflejando el cambio de forma inmediata en la interfaz (optimistic UI) mientras el backend registra el evento de forma síncrona en ClickHouse (`FACT_ENGAGEMENT_USUARIO`). Un usuario solo puede ver sus propios favoritos.

#### Scenario: Agregar track a favoritos
- **WHEN** el usuario está autenticado y el track existe en FACT_TRACKS, y el usuario marca el track como favorito
- **THEN** el sistema registra el evento en ClickHouse (`FACT_ENGAGEMENT_USUARIO`) asociado al usuario y lo refleja inmediatamente en la interfaz

#### Scenario: El favorito persiste entre sesiones
- **WHEN** un usuario agrega un track a favoritos, cierra sesión y vuelve a iniciar sesión
- **THEN** el track sigue apareciendo en la lista de favoritos del usuario

### Requirement: Gestión de playlists propias
El sistema SHALL permitir crear, renombrar y eliminar playlists propias del usuario, y agregar o quitar tracks de una playlist propia. Un track solo puede agregarse una vez a la misma playlist (sin duplicados dentro de una playlist). Un usuario solo puede ver, editar o eliminar sus propias playlists.

#### Scenario: Crear, renombrar o eliminar una playlist
- **WHEN** un usuario autenticado crea, renombra o elimina una de sus playlists
- **THEN** el sistema aplica el cambio en PocketBase y lo asocia exclusivamente al usuario propietario

#### Scenario: Agregar un track a una playlist
- **WHEN** un usuario agrega un track que no está presente en una de sus playlists
- **THEN** el sistema agrega el track a la playlist

#### Scenario: Track duplicado en playlist
- **WHEN** un track ya pertenece a una playlist del usuario y el usuario intenta agregarlo de nuevo a la misma playlist
- **THEN** el sistema rechaza la operación y muestra un mensaje indicando que el track ya está en la playlist

### Requirement: Historial de reproducción
El sistema SHALL registrar automáticamente cada reproducción en el historial del usuario, sin acción manual adicional, mediante un evento escrito de forma síncrona en ClickHouse (`FACT_ENGAGEMENT_USUARIO`), y SHALL permitir consultar el historial ordenado del más reciente al más antiguo. El historial de reproducción es de solo lectura para el usuario; no se puede editar ni eliminar manualmente un registro individual.

#### Scenario: Registro automático de reproducción
- **WHEN** ocurre una reproducción de un track por parte del usuario
- **THEN** el sistema actualiza el historial del usuario sin intervención manual

#### Scenario: Consultar historial ordenado
- **WHEN** un usuario solicita su historial de reproducción
- **THEN** el sistema lo muestra ordenado del registro más reciente al más antiguo

#### Scenario: El historial es de solo lectura
- **WHEN** un usuario intenta editar o eliminar manualmente un registro individual de su historial
- **THEN** el sistema rechaza la operación

### Requirement: Reproductor persistente con barra de progreso navegable
El sistema SHALL mostrar un reproductor persistente en todas las páginas que permita controlar la reproducción (play/pause, anterior, siguiente) y SHALL permitir al usuario posicionarse en cualquier punto de la simulación de tiempo haciendo clic o arrastrando la barra de progreso. El estado del reproductor (track activo, posición, cola) SHALL persistir en `localStorage` y sobrevivir la navegación entre páginas.

#### Scenario: Navegar a un punto específico de la barra de progreso
- **WHEN** un usuario hace clic o arrastra sobre la barra de progreso mientras hay un track activo
- **THEN** el sistema mueve la posición de reproducción al punto seleccionado de forma inmediata, actualiza el tiempo transcurrido, y continúa o mantiene pausa según el estado previo

#### Scenario: Estado del reproductor persiste al navegar entre páginas
- **WHEN** un usuario navega a otra página mientras hay un track activo
- **THEN** el reproductor se rehidrata automáticamente con el mismo track, posición aproximada y estado de reproducción previos

### Requirement: Acceso de solo lectura al catálogo para Cliente B2B
Un Cliente B2B SHALL tener acceso de solo lectura al catálogo; no puede gestionar favoritos, playlists ni historial (estos son exclusivos de Usuario B2C).

#### Scenario: Cliente B2B intenta gestionar biblioteca personal
- **WHEN** un Cliente B2B autenticado intenta agregar un favorito, crear una playlist o consultar un historial de reproducción
- **THEN** el sistema rechaza la operación porque la biblioteca personal es exclusiva de Usuario B2C

## Entradas

- Término de búsqueda y filtro de género (exploración de catálogo).
- `fact_id` de track (consulta de detalle).
- `fact_id` (agregar/quitar favorito, registrar reproducción).
- `fact_id` + `playlist_id` (gestión de tracks dentro de una playlist).
- Nombre de playlist (creación/edición).

## Salidas

- Lista paginada de tracks que coinciden con la búsqueda.
- Vista de detalle con atributos de audio, artista, álbum y género(s) agregados.
- Confirmación de favorito/playlist actualizada, o mensaje de error.
- Historial de reproducción ordenado cronológicamente.

## Dependencias

- **PocketBase**: playlists (con sus tracks).
- **ClickHouse**: FACT_TRACKS, DIM_ARTISTS, DIM_ALBUMS, DIM_GENRES (catálogo técnico, solo lectura desde esta capability); FACT_ENGAGEMENT_USUARIO (registro de eventos de favoritos e historial, escritura síncrona y directa desde esta capability).
- **FastAPI**: endpoints de búsqueda, detalle y biblioteca bajo `/app/v1/biblioteca` y `/app/v1/catalogo`.

## Fuera de alcance

- Recuperación de contraseña.
- Recomendaciones automáticas de tracks (implementadas en `experiencia`, no en esta capability — algoritmo simple, no un motor de machine learning).
- Streaming de archivos de audio propios (la reproducción de audio real, agregada por `experiencia`, depende de un directorio de video externo por búsqueda de texto, no de audio alojado por Tracklytics).
