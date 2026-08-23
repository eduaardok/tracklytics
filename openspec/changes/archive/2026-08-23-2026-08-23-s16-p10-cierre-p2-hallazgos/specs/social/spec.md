## MODIFIED Requirements

### Requirement: Notificaciones de actividad social
El sistema SHALL generar una notificación in-app para un usuario cuando: (1) se aprueba un track nuevo de un artista que sigue activamente, (2) alguien comenta un track propio o responde a un comentario propio, o (3) es agregado como colaborador de una playlist — salvo que el destinatario haya desactivado ese tipo de notificación mediante su preferencia. Cada notificación SHALL registrar el usuario destinatario, un tipo, una referencia al objeto relacionado, un mensaje, un estado de lectura y la fecha de creación. Toda notificación de comentario (raíz o respuesta) SHALL referenciar el track al que pertenece el comentario, para que el usuario destinatario pueda navegar a un destino real al abrirla — el sistema no expone ninguna vista de "detalle de comentario" aislada. El sistema SHALL permitir a un usuario autenticado consultar sus notificaciones ordenadas por fecha descendente junto con el conteo de no leídas, y marcar una notificación individual o todas como leídas.

El sistema SHALL permitir a un usuario autenticado consultar y actualizar su preferencia de recepción por tipo de notificación (opt-out). La ausencia de una preferencia explícita SHALL considerarse "activo" — un usuario que nunca tocó su configuración sigue recibiendo todos los tipos, igual que antes de que existiera esta preferencia.

#### Scenario: Notificación al aprobar un track de un artista seguido

- **WHEN** se aprueba un track nuevo de un artista con seguidores activos
- **THEN** el sistema crea una notificación para cada seguidor activo de ese artista, referenciando el track aprobado, salvo los seguidores que hayan desactivado ese tipo

#### Scenario: Notificación al comentar un track propio

- **WHEN** alguien comenta un track propio
- **THEN** el sistema crea una notificación para el dueño de la cuenta de artista, referenciando el track comentado

#### Scenario: Notificación al responder un comentario propio

- **WHEN** alguien responde un comentario propio
- **THEN** el sistema crea una notificación para el autor del comentario padre, referenciando el track al que pertenece ese comentario

#### Scenario: Sin autonotificación

- **WHEN** un usuario comenta su propio track o responde su propio comentario
- **THEN** el sistema no crea ninguna notificación

#### Scenario: Notificación al agregar un colaborador de playlist

- **WHEN** un usuario es agregado como colaborador de una playlist
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

#### Scenario: Desactivar un tipo de notificación

- **WHEN** un usuario autenticado desactiva un tipo de notificación específico
- **THEN** el sistema deja de generar notificaciones de ese tipo para ese usuario, sin afectar los demás tipos

#### Scenario: Preferencia por defecto de un usuario que nunca la tocó

- **WHEN** un usuario autenticado que nunca configuró sus preferencias consulta su estado por tipo
- **THEN** el sistema responde "activo" para todos los tipos existentes
