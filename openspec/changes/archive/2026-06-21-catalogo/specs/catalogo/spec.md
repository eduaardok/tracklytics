# Capability: catalogo

## Objetivo

Permitir que un Usuario B2C o Cliente B2B se autentique en la plataforma, explore el catálogo musical global, consulte el detalle de cualquier entidad musical, y gestione su biblioteca personal (favoritos, playlists, historial de reproducción).

## Contexto

Tracklytics necesita una capa de exploración musical funcional para sostener el modelo B2C freemium: el catálogo es el gancho de adquisición, y la biblioteca personal (favoritos/playlists/historial) es la fuente de datos de comportamiento que alimenta el motor analítico B2B (modelo data flywheel).

## Actores

- **Usuario B2C**: consumidor final, navega catálogo y gestiona su biblioteca.
- **Cliente B2B**: también explora catálogo (acceso de solo lectura al catálogo, sin biblioteca personal).

## Tabla de trazabilidad

| Nivel empresarial | Departamento | Paquete | Caso de uso | Historia de usuario |
|---|---|---|---|---|
| Operativo | Usuario B2C / Cliente B2B | Catálogo y biblioteca personal | CU-O01 Registrarse, iniciar y cerrar sesión | Como Usuario B2C, quiero crear una cuenta e iniciar sesión, para acceder a mi biblioteca personal |
| Operativo | Usuario B2C / Cliente B2B | Catálogo y biblioteca personal | CU-O02 Buscar y explorar catálogo musical | Como Usuario B2C, quiero buscar tracks por nombre, artista o género, para descubrir música de mi interés |
| Operativo | Usuario B2C / Cliente B2B | Catálogo y biblioteca personal | CU-O03 Consultar detalle de track/artista/álbum/género | Como Usuario B2C, quiero ver el detalle completo de un track, para conocer sus características antes de guardarlo |
| Operativo | Usuario B2C | Catálogo y biblioteca personal | CU-O04 Gestionar favoritos y playlists | Como Usuario B2C, quiero guardar tracks en favoritos y organizarlos en playlists, para acceder rápido a mi música preferida |
| Operativo | Usuario B2C | Catálogo y biblioteca personal | CU-O05 Consultar historial de reproducción | Como Usuario B2C, quiero ver mi historial de reproducción, para recordar qué he escuchado |

## ADDED Requirements

### Requirement: Registro de usuario
El sistema SHALL permitir registrar un nuevo usuario con correo y contraseña vía PocketBase.

#### Scenario: Registro exitoso
- **WHEN** un visitante envía un correo electrónico y contraseña válidos para crear una cuenta
- **THEN** el sistema crea el usuario en PocketBase y queda disponible para iniciar sesión

### Requirement: Inicio de sesión
El sistema SHALL permitir iniciar sesión validando credenciales contra PocketBase y SHALL devolver un token de sesión cuando las credenciales son correctas.

#### Scenario: Login exitoso
- **WHEN** el usuario está registrado en PocketBase con correo y contraseña válidos e ingresa sus credenciales correctas
- **THEN** el sistema inicia sesión, devuelve un token de sesión válido y lo redirige a la pantalla principal del catálogo

#### Scenario: Login fallido
- **WHEN** el usuario ingresa un correo o contraseña incorrectos
- **THEN** el sistema muestra un mensaje de error de autenticación genérico (el devuelto por PocketBase) sin indicar cuál campo falló, y no inicia sesión

### Requirement: Cierre de sesión
El sistema SHALL permitir cerrar sesión invalidando el token de sesión activo en el cliente.

#### Scenario: Logout invalida el token activo
- **WHEN** un usuario autenticado solicita cerrar sesión
- **THEN** el sistema invalida el token activo en el cliente y el usuario deja de tener acceso a la biblioteca personal hasta volver a iniciar sesión

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
El sistema SHALL mostrar el detalle de un track identificado por su `fact_id` (no `track_id`, dado que un mismo track puede repetirse en múltiples géneros), incluyendo sus 7 atributos de audio principales.

#### Scenario: Consultar detalle de un track
- **WHEN** un usuario solicita el detalle de un track mediante su `fact_id`
- **THEN** el sistema muestra los 7 atributos de audio principales del track junto con su artista, álbum y género

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

### Requirement: Acceso de solo lectura al catálogo para Cliente B2B
Un Cliente B2B SHALL tener acceso de solo lectura al catálogo; no puede gestionar favoritos, playlists ni historial (estos son exclusivos de Usuario B2C).

#### Scenario: Cliente B2B intenta gestionar biblioteca personal
- **WHEN** un Cliente B2B autenticado intenta agregar un favorito, crear una playlist o consultar un historial de reproducción
- **THEN** el sistema rechaza la operación porque la biblioteca personal es exclusiva de Usuario B2C

### Requirement: Seguridad de credenciales
El sistema SHALL asegurar que las credenciales nunca se almacenen ni transmitan en texto plano; PocketBase gestiona el hashing.

#### Scenario: Las credenciales no se almacenan en texto plano
- **WHEN** un usuario se registra o inicia sesión
- **THEN** el sistema delega el hashing de la contraseña a PocketBase y nunca persiste ni transmite la contraseña en texto plano

## Entradas

- Correo electrónico y contraseña (registro/login).
- Término de búsqueda y filtro de género (exploración de catálogo).
- `fact_id` de track (consulta de detalle).
- `fact_id` (agregar/quitar favorito, registrar reproducción).
- `fact_id` + `playlist_id` (gestión de tracks dentro de una playlist).
- Nombre de playlist (creación/edición).

## Salidas

- Token de sesión válido o mensaje de error de autenticación.
- Lista paginada de tracks que coinciden con la búsqueda.
- Vista de detalle con atributos de audio, artista, álbum, género.
- Confirmación de favorito/playlist actualizada, o mensaje de error.
- Historial de reproducción ordenado cronológicamente.

## Dependencias

- **PocketBase**: autenticación, playlists (con sus tracks).
- **ClickHouse**: FACT_TRACKS, DIM_ARTISTS, DIM_ALBUMS, DIM_GENRES (catálogo técnico, solo lectura desde esta capability); FACT_ENGAGEMENT_USUARIO (registro de eventos de favoritos e historial, escritura síncrona y directa desde esta capability).
- **FastAPI**: endpoints de búsqueda, detalle y biblioteca bajo `/app/v1/biblioteca` y `/app/v1/catalogo`.

## Fuera de alcance

- Recuperación de contraseña.
- Recomendaciones automáticas de tracks (cubierto en analítica como técnica de IA aplicable, no implementado en esta capability).
- Reproducción de audio real (el sistema gestiona metadatos, no streaming de archivos de audio).
