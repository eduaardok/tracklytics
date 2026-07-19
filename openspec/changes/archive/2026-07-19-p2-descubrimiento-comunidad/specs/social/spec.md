## ADDED Requirements

### Requirement: Bloqueo entre usuarios
El sistema SHALL permitir a un usuario autenticado bloquear a otro usuario, deshacer ese bloqueo y consultar la lista de usuarios que tiene bloqueados. Un usuario SHALL NO poder bloquearse a sí mismo. El bloqueo SHALL conservarse como historial, sin borrado físico de datos.

#### Scenario: Bloquear a un usuario
- **WHEN** un usuario bloquea a otro usuario
- **THEN** el sistema registra el bloqueo y el usuario bloqueado aparece en su lista de bloqueados

#### Scenario: Deshacer un bloqueo
- **WHEN** un usuario desbloquea a alguien que tenía bloqueado
- **THEN** el usuario deja de aparecer en su lista de bloqueados y los efectos del bloqueo se revierten

#### Scenario: Intentar bloquearse a uno mismo
- **WHEN** un usuario intenta bloquearse a sí mismo
- **THEN** el sistema rechaza la operación

### Requirement: Efectos del bloqueo sobre la comunidad
El sistema SHALL ocultar los comentarios de un usuario bloqueado en las vistas de comentarios y en el feed de actividad de quien lo bloqueó. El sistema SHALL impedir que un usuario bloqueado responda a los comentarios de quien lo bloqueó. El bloqueo SHALL ser unidireccional en la lectura: quien es bloqueado sigue viendo el contenido de quien lo bloqueó, de modo que el bloqueo no se le revele.

#### Scenario: Los comentarios del bloqueado desaparecen
- **WHEN** un usuario que ha bloqueado a otro consulta los comentarios de un track donde el bloqueado comentó
- **THEN** los comentarios del usuario bloqueado no aparecen en la respuesta

#### Scenario: El bloqueado no puede dirigirse a quien lo bloqueó
- **WHEN** un usuario bloqueado intenta responder a un comentario de quien lo bloqueó
- **THEN** el sistema rechaza la operación

#### Scenario: El bloqueo no se revela al bloqueado
- **WHEN** un usuario bloqueado consulta los comentarios de un track donde comentó quien lo bloqueó
- **THEN** esos comentarios siguen siendo visibles para él

#### Scenario: Revertir el bloqueo restaura la visibilidad
- **WHEN** un usuario desbloquea a otro y vuelve a consultar los comentarios
- **THEN** los comentarios del usuario desbloqueado vuelven a aparecer

### Requirement: Emisión de strike al resolver una denuncia
El sistema SHALL permitir a un usuario con rol `admin_comunidad` emitir opcionalmente un strike contra el autor del contenido denunciado en la misma acción con la que resuelve la denuncia, indicando el motivo. La acción SHALL auditarse.

#### Scenario: Resolver una denuncia emitiendo strike
- **WHEN** un `admin_comunidad` resuelve una denuncia indicando que se emita un strike con un motivo
- **THEN** el sistema registra la denuncia como resuelta y emite un strike contra el autor del contenido denunciado

#### Scenario: Resolver una denuncia sin emitir strike
- **WHEN** un `admin_comunidad` resuelve una denuncia sin solicitar strike
- **THEN** el sistema registra la denuncia como resuelta y no emite ningún strike

#### Scenario: Contenido denunciado sin autor resoluble
- **WHEN** un `admin_comunidad` resuelve con strike una denuncia sobre contenido cuyo autor no puede determinarse
- **THEN** el sistema resuelve la denuncia e informa de que no fue posible emitir el strike
