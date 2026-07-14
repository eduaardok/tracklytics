## ADDED Requirements

### Requirement: Notificaciones de actividad social
El sistema SHALL generar una notificación in-app para un usuario cuando: (1) se aprueba un track nuevo de un artista que sigue activamente, (2) alguien comenta un track propio o responde a un comentario propio, o (3) es agregado como colaborador de una playlist. Cada notificación SHALL registrar el usuario destinatario, un tipo, una referencia al objeto relacionado, un mensaje, un estado de lectura y la fecha de creación. El sistema SHALL permitir a un usuario autenticado consultar sus notificaciones ordenadas por fecha descendente junto con el conteo de no leídas, y marcar una notificación individual o todas como leídas.

#### Scenario: Notificación al aprobar un track de un artista seguido
- **WHEN** un usuario con rol admin aprueba un track subido por una cuenta de artista que tiene al menos un seguidor activo
- **THEN** el sistema crea una notificación para cada seguidor activo de ese artista, referenciando el track aprobado

#### Scenario: Notificación al comentar un track propio
- **WHEN** un usuario comenta (comentario raíz) un track cuya cuenta de artista propietaria pertenece a otro usuario
- **THEN** el sistema crea una notificación para el dueño de la cuenta de artista, referenciando el track comentado

#### Scenario: Notificación al responder un comentario propio
- **WHEN** un usuario responde a un comentario existente de otro usuario
- **THEN** el sistema crea una notificación para el autor del comentario padre, referenciando ese comentario

#### Scenario: Sin autonotificación
- **WHEN** un usuario comenta su propio track o responde a su propio comentario
- **THEN** el sistema no crea ninguna notificación

#### Scenario: Notificación al agregar un colaborador de playlist
- **WHEN** el dueño de una playlist agrega a otro usuario como colaborador
- **THEN** el sistema crea una notificación para el usuario agregado, referenciando la playlist

#### Scenario: Consultar notificaciones propias
- **WHEN** un usuario autenticado solicita su lista de notificaciones
- **THEN** el sistema retorna sus notificaciones ordenadas por fecha descendente junto con el conteo total de no leídas

#### Scenario: Marcar una notificación como leída
- **WHEN** un usuario autenticado marca como leída una notificación propia
- **THEN** el sistema actualiza esa notificación a leída con la fecha de lectura, y rechaza la operación si la notificación pertenece a otro usuario

#### Scenario: Marcar todas las notificaciones como leídas
- **WHEN** un usuario autenticado solicita marcar todas sus notificaciones como leídas
- **THEN** el sistema actualiza a leídas todas las notificaciones no leídas de ese usuario

### Requirement: Perfil público de usuario
El sistema SHALL permitir a cualquier usuario, incluyendo visitantes sin sesión, consultar el perfil público de un usuario existente cuando este haya marcado su perfil como público, mostrando su nombre y sus playlists marcadas como públicas junto con los tracks de cada una. El sistema SHALL rechazar la consulta cuando el perfil sea privado y el solicitante no sea el propio dueño, sin distinguir en la respuesta entre "no existe" y "es privado".

#### Scenario: Consultar un perfil público sin sesión
- **WHEN** un visitante sin sesión consulta el perfil de un usuario que lo marcó como público
- **THEN** el sistema retorna el nombre del usuario y sus playlists públicas con sus tracks

#### Scenario: Consultar un perfil privado siendo otro usuario
- **WHEN** un usuario autenticado (o un visitante sin sesión) consulta el perfil de un usuario que no lo marcó como público
- **THEN** el sistema rechaza la operación indicando que el perfil no está disponible

#### Scenario: El dueño consulta su propio perfil, sea público o privado
- **WHEN** un usuario autenticado consulta su propio perfil público
- **THEN** el sistema retorna su nombre y playlists públicas sin importar si el perfil está marcado como público o privado
