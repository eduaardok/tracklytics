# social Specification

## Purpose
TBD - created by archiving change social. Update Purpose after archive.
## Requirements
### Requirement: Seguir a un artista
El sistema SHALL permitir a un Usuario B2C autenticado seguir a un artista existente del catálogo, quedando la relación registrada como activa. Un usuario SHALL tener como máximo una relación de seguimiento activa por artista.

#### Scenario: Seguimiento exitoso
- **WHEN** un Usuario B2C autenticado sigue a un artista existente al que no sigue actualmente
- **THEN** el sistema registra el seguimiento como activo, asociado a ese usuario y ese artista

#### Scenario: Intento de seguir a un artista ya seguido
- **WHEN** un Usuario B2C autenticado intenta seguir a un artista al que ya sigue activamente
- **THEN** el sistema rechaza la operación indicando que ya existe un seguimiento activo

#### Scenario: Intento de seguir a un artista inexistente
- **WHEN** un Usuario B2C autenticado intenta seguir un artista que no existe en el catálogo
- **THEN** el sistema rechaza la operación con un error de artista no encontrado

### Requirement: Dejar de seguir a un artista
El sistema SHALL permitir a un Usuario B2C autenticado dejar de seguir a un artista que sigue activamente, marcando la relación como inactiva sin eliminar el registro histórico.

#### Scenario: Dejar de seguir exitosamente
- **WHEN** un Usuario B2C autenticado deja de seguir a un artista al que sigue activamente
- **THEN** el sistema marca esa relación de seguimiento como inactiva, conservando el registro

#### Scenario: Intento de dejar de seguir a un artista no seguido
- **WHEN** un Usuario B2C autenticado intenta dejar de seguir a un artista al que no sigue activamente
- **THEN** el sistema rechaza la operación indicando que no existe un seguimiento activo

### Requirement: Consulta de artistas seguidos
El sistema SHALL permitir a un Usuario B2C autenticado consultar la lista de artistas que sigue activamente.

#### Scenario: Consultar mis artistas seguidos
- **WHEN** un Usuario B2C autenticado solicita su lista de artistas seguidos
- **THEN** el sistema retorna únicamente los artistas con relación de seguimiento activa para ese usuario

### Requirement: Comentar un track
El sistema SHALL permitir a un Usuario B2C autenticado comentar un track existente del catálogo, quedando el comentario visible de inmediato sin aprobación previa. El sistema SHALL permitir que el comentario sea una respuesta a otro comentario existente del mismo track mediante una referencia al comentario padre.

#### Scenario: Comentario raíz exitoso
- **WHEN** un Usuario B2C autenticado envía un comentario con contenido no vacío para un track existente, sin indicar comentario padre
- **THEN** el sistema registra el comentario en estado visible, asociado a ese track y ese usuario

#### Scenario: Respuesta a un comentario existente
- **WHEN** un Usuario B2C autenticado envía un comentario indicando como padre un comentario existente del mismo track
- **THEN** el sistema registra el comentario en estado visible, asociado a ese comentario padre

#### Scenario: Intento de comentar un track inexistente
- **WHEN** un Usuario B2C autenticado intenta comentar un track que no existe en el catálogo
- **THEN** el sistema rechaza la operación con un error de track no encontrado

### Requirement: Consulta de comentarios de un track
El sistema SHALL permitir a cualquier usuario autenticado consultar los comentarios de un track existente cuyo estado de moderación no sea eliminado, excluyendo también cualquier comentario cuyo comentario padre esté eliminado.

#### Scenario: Consultar comentarios de un track
- **WHEN** un usuario autenticado solicita los comentarios de un track existente
- **THEN** el sistema retorna los comentarios de ese track cuyo estado de moderación no sea eliminado, y cuyo comentario padre —si existe— tampoco esté eliminado

### Requirement: Moderación de un comentario
El sistema SHALL permitir a un usuario con rol admin ocultar o eliminar un comentario existente, registrando quién realizó la moderación y cuándo. Esta operación SHALL estar restringida exclusivamente a usuarios con rol admin.

#### Scenario: Admin oculta un comentario
- **WHEN** un usuario con rol admin oculta un comentario existente
- **THEN** el sistema marca el comentario como oculto y registra el administrador y la fecha de moderación

#### Scenario: Admin elimina un comentario
- **WHEN** un usuario con rol admin elimina un comentario existente
- **THEN** el sistema marca el comentario como eliminado, registra el administrador y la fecha de moderación, y el comentario deja de aparecer en el listado público

#### Scenario: Usuario sin rol admin intenta moderar un comentario
- **WHEN** un usuario con rol distinto de admin intenta ocultar o eliminar un comentario
- **THEN** el sistema rechaza la operación indicando que es exclusiva de admin

### Requirement: Cola administrativa de comentarios
El sistema SHALL permitir a un usuario con rol admin consultar todos los comentarios de la plataforma, filtrables por track o por estado de moderación, incluyendo su estado de moderación en la respuesta.

#### Scenario: Admin consulta todos los comentarios
- **WHEN** un usuario con rol admin solicita el listado administrativo de comentarios, opcionalmente filtrado por track o por estado de moderación
- **THEN** el sistema retorna los comentarios solicitados junto con su estado de moderación

#### Scenario: Usuario sin rol admin intenta consultar la cola administrativa
- **WHEN** un usuario con rol distinto de admin intenta acceder al listado administrativo de comentarios
- **THEN** el sistema rechaza la operación indicando que es exclusiva de admin

### Requirement: Compartir contenido
El sistema SHALL permitir a un Usuario B2C autenticado registrar la intención de compartir un track, un perfil de artista o una playlist a través de un canal soportado (X, WhatsApp o copiar enlace), sin realizar ninguna llamada real a servicios externos. Cada tipo de objeto compartido SHALL identificarse mediante su propio campo (track, artista o playlist), no un identificador genérico compartido entre los tres. El sistema SHALL validar la existencia del track o del artista compartido contra el catálogo; una playlist compartida SHALL aceptarse sin validar su existencia, por vivir fuera del catálogo administrado por esta capability.

#### Scenario: Compartir un track exitosamente
- **WHEN** un Usuario B2C autenticado comparte un track existente indicando un canal soportado
- **THEN** el sistema registra la intención de compartir y retorna el contenido (enlace o texto) correspondiente a ese canal

#### Scenario: Compartir un perfil de artista exitosamente
- **WHEN** un Usuario B2C autenticado comparte un perfil de artista existente indicando un canal soportado
- **THEN** el sistema registra la intención de compartir y retorna el contenido (enlace o texto) correspondiente a ese canal

#### Scenario: Compartir una playlist exitosamente
- **WHEN** un Usuario B2C autenticado comparte una playlist indicando un canal soportado
- **THEN** el sistema registra la intención de compartir y retorna el contenido (enlace o texto) correspondiente a ese canal, sin validar la existencia de la playlist

#### Scenario: Intento de compartir un track o un perfil de artista inexistente
- **WHEN** un Usuario B2C autenticado intenta compartir un track o un perfil de artista que no existe en el catálogo
- **THEN** el sistema rechaza la operación con un error de objeto no encontrado

#### Scenario: Intento de compartir con un canal no soportado
- **WHEN** un Usuario B2C autenticado intenta compartir indicando un canal distinto de los soportados
- **THEN** el sistema rechaza la operación indicando los canales válidos

### Requirement: Restricción de Cliente B2B a solo lectura
El sistema SHALL impedir que un usuario con rol analyst siga artistas, comente tracks o registre una intención de compartir, permitiéndole únicamente consultar los comentarios ya publicados.

#### Scenario: Cliente B2B intenta seguir, comentar o compartir
- **WHEN** un usuario con rol analyst intenta seguir a un artista, comentar un track o compartir contenido
- **THEN** el sistema rechaza la operación indicando que esa acción es exclusiva de Usuario B2C

#### Scenario: Cliente B2B consulta comentarios
- **WHEN** un usuario con rol analyst solicita los comentarios visibles de un track
- **THEN** el sistema retorna el listado, igual que para un Usuario B2C

### Requirement: Auditoría de moderación
El sistema SHALL registrar en FACT_AUDIT_LOG cada acción de moderación de un comentario, incluyendo el administrador que la ejecutó, la tabla afectada y el estado antes/después.

#### Scenario: Registro de auditoría al moderar un comentario
- **WHEN** un usuario con rol admin oculta o elimina un comentario
- **THEN** el sistema registra en FACT_AUDIT_LOG el administrador que ejecutó el cambio, la acción realizada, la tabla afectada y el estado antes/después

