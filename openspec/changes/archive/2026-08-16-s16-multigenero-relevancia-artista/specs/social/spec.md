## MODIFIED Requirements

### Requirement: Notificaciones de actividad social
El sistema SHALL generar una notificación in-app para un usuario cuando: (1) se aprueba un track nuevo de un artista que sigue activamente, (2) alguien comenta un track propio o responde a un comentario propio, o (3) es agregado como colaborador de una playlist. Cada notificación SHALL registrar el usuario destinatario, un tipo, una referencia al objeto relacionado, un mensaje, un estado de lectura y la fecha de creación. Toda notificación de comentario (raíz o respuesta) SHALL referenciar el track al que pertenece el comentario, para que el usuario destinatario pueda navegar a un destino real al abrirla — el sistema no expone ninguna vista de "detalle de comentario" aislada. El sistema SHALL permitir a un usuario autenticado consultar sus notificaciones ordenadas por fecha descendente junto con el conteo de no leídas, y marcar una notificación individual o todas como leídas.

#### Scenario: Notificación al aprobar un track de un artista seguido
- **WHEN** un usuario con rol admin aprueba un track subido por una cuenta de artista que tiene al menos un seguidor activo
- **THEN** el sistema crea una notificación para cada seguidor activo de ese artista, referenciando el track aprobado

#### Scenario: Notificación al comentar un track propio
- **WHEN** un usuario comenta (comentario raíz) un track cuya cuenta de artista propietaria pertenece a otro usuario
- **THEN** el sistema crea una notificación para el dueño de la cuenta de artista, referenciando el track comentado

#### Scenario: Notificación al responder un comentario propio
- **WHEN** un usuario responde a un comentario existente de otro usuario
- **THEN** el sistema crea una notificación para el autor del comentario padre, referenciando el track al que pertenece ese comentario

#### Scenario: Sin autonotificación
- **WHEN** un usuario comenta su propio track o responde a su propio comentario
- **THEN** el sistema no crea ninguna notificación
