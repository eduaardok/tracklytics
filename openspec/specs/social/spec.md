# social Specification

## Purpose

Permitir que un Usuario B2C siga artistas, comente y responda en tracks, y comparta contenido
fuera de la plataforma, con moderación administrativa sobre los comentarios publicados y acceso
de solo lectura para Cliente B2B.

## Objetivo

Permitir que un Usuario B2C siga artistas, comente y responda en tracks, y comparta contenido
fuera de la plataforma, con moderación administrativa sobre los comentarios publicados y acceso
de solo lectura para Cliente B2B.

## Contexto

Hasta esta capability, un oyente podía explorar el catálogo y armar su propia biblioteca, pero no
tenía forma de interactuar con la comunidad de la plataforma. `social` introduce seguimiento de
artistas, comentarios con moderación y comparticiones, generando señales de comportamiento
adicionales para el motor analítico ofrecido a sellos discográficos y curadores de playlists.

## Actores

- **Usuario B2C** (`role=user`): sigue/deja de seguir artistas, comenta y responde en tracks,
  comparte contenido.
- **Cliente B2B** (`role=analyst`): consulta comentarios en modo exclusivamente de lectura.
- **Lead Data Engineer / CTO** (`role=admin`): modera comentarios (ocultar/eliminar) y consulta
  la cola administrativa de comentarios pendientes.

## Tabla de trazabilidad

| Nivel empresarial | Departamento | Paquete | Caso de uso | Historia de usuario |
|---|---|---|---|---|
| Operativo | Usuario B2C | Social | CU-O29 Seguir o dejar de seguir a un artista | Como Usuario B2C, quiero seguir o dejar de seguir a un artista, para expresar mi afinidad sin comprometerme a una acción permanente |
| Operativo | Usuario B2C | Social | CU-O30 Consultar artistas seguidos | Como Usuario B2C, quiero ver la lista de artistas que sigo, para volver fácilmente a su catálogo |
| Operativo | Usuario B2C | Social | CU-O31 Comentar y responder en un track | Como Usuario B2C, quiero comentar una canción y responder a otros comentarios, para participar de la conversación alrededor de la música |
| Operativo | Usuario B2C / Cliente B2B | Social | CU-O32 Consultar comentarios de un track | Como Usuario B2C o Cliente B2B, quiero ver los comentarios de una canción, para conocer la reacción de la comunidad |
| Operativo | Lead Data Engineer / CTO | Social | CU-O33 Moderar un comentario | Como Lead Data Engineer/CTO, quiero ocultar o eliminar un comentario que incumple las normas, para proteger la calidad de la conversación pública |
| Operativo | Lead Data Engineer / CTO | Social | CU-O34 Consultar cola administrativa de comentarios | Como Lead Data Engineer/CTO, quiero ver la cola de comentarios pendientes de revisión, para priorizar mi trabajo de moderación |
| Operativo | Usuario B2C | Social | CU-O35 Compartir contenido | Como Usuario B2C, quiero generar un enlace para compartir un track, playlist o perfil de artista, para promoverlo fuera de la plataforma |
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
El sistema SHALL permitir a cualquier usuario autenticado consultar los comentarios de un track existente cuyo estado de moderación no sea eliminado, excluyendo también cualquier comentario cuyo comentario padre esté eliminado. El usuario SHALL poder localizar el track mediante una búsqueda por nombre de track o de artista, sin requerir que conozca ni escriba su identificador interno.

#### Scenario: Buscar el track por nombre o artista antes de consultar sus comentarios
- **WHEN** un usuario autenticado escribe parte del nombre de un track o de un artista para ver sus comentarios
- **THEN** el sistema muestra las coincidencias encontradas para que el usuario seleccione el track exacto

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

El sistema SHALL permitir a un usuario con rol admin consultar los comentarios de la plataforma
de forma paginada, filtrables por track o por estado de moderación, incluyendo su estado de
moderación en la respuesta. La respuesta SHALL incluir el conteo total de comentarios que
coinciden con el filtro aplicado, además de la página solicitada.

#### Scenario: Admin consulta una página del listado administrativo de comentarios

- **WHEN** un usuario con rol admin solicita el listado administrativo de comentarios,
  opcionalmente filtrado por track o por estado de moderación, y opcionalmente indicando página
  y tamaño de página
- **THEN** el sistema retorna esa página de comentarios junto con su estado de moderación y el
  conteo total de comentarios que coinciden con el filtro

#### Scenario: Usuario sin rol admin intenta consultar la cola administrativa

- **WHEN** un usuario con rol distinto de admin intenta acceder al listado administrativo de
  comentarios
- **THEN** el sistema rechaza la operación

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

### Requirement: Panel administrativo de métricas de social
El sistema SHALL exponer a un usuario con rol `admin` un panel con métricas operativas agregadas de la capability `social`: actividad social diaria (comentarios y comparticiones) y ranking de artistas con más seguidores.

#### Scenario: Admin consulta el panel de métricas de social
- **WHEN** un usuario con rol `admin` solicita el dashboard de social
- **THEN** el sistema retorna la serie diaria de comentarios y comparticiones, y el ranking de artistas por cantidad de seguidores activos

#### Scenario: Usuario sin rol admin intenta consultar el panel de social
- **WHEN** un usuario sin rol `admin` intenta consultar el dashboard de social
- **THEN** el sistema rechaza la operación

### Requirement: Feed de actividad de artistas seguidos
El sistema SHALL permitir a un usuario autenticado consultar un feed agregado con la actividad reciente (comentarios y comparticiones) sobre tracks de los artistas que sigue, ordenado por fecha descendente. Dado que el modelo de seguimiento de esta capability es a nivel artista (no existe un concepto de seguir a otro usuario), el feed SHALL reflejar esa misma semántica: actividad de terceros sobre tracks de artistas seguidos, no actividad de usuarios seguidos.

#### Scenario: Usuario consulta su feed de actividad
- **WHEN** un usuario autenticado que sigue a uno o más artistas consulta su feed
- **THEN** el sistema retorna los comentarios y comparticiones más recientes sobre tracks de esos artistas, con el nombre de quien comentó/compartió y el track involucrado

#### Scenario: Usuario sin artistas seguidos consulta su feed
- **WHEN** un usuario autenticado que no sigue a ningún artista consulta su feed
- **THEN** el sistema retorna una lista vacía

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

### Requirement: Denuncia de contenido por usuarios
El sistema SHALL permitir a un usuario B2C autenticado denunciar un comentario (`tipo_objeto = 'comentario'`) o un track (`tipo_objeto = 'track'`) indicando un motivo tipificado (`spam` | `contenido_inapropiado` | `derechos_de_autor` | `otro`) y una descripción opcional. La denuncia SHALL registrarse en `FACT_DENUNCIA` con estado `pendiente`.

#### Scenario: Denunciar un comentario
- **WHEN** un usuario B2C denuncia un comentario indicando el motivo `spam`
- **THEN** el sistema registra la denuncia en estado `pendiente` con su motivo y objeto

### Requirement: Bandeja administrativa de denuncias
El sistema SHALL permitir a un usuario con rol `admin_comunidad` listar de forma paginada las denuncias con filtros por tipo de objeto, motivo y estado, y actualizar el estado de una denuncia (`revisada` | `resuelta`). La actualización SHALL auditarse.

#### Scenario: Listar denuncias pendientes
- **WHEN** un `admin_comunidad` lista las denuncias filtrando por estado `pendiente`
- **THEN** el sistema devuelve la página de denuncias pendientes con su tipo, motivo y objeto

#### Scenario: Marcar una denuncia como revisada
- **WHEN** un `admin_comunidad` actualiza una denuncia a estado `revisada`
- **THEN** el sistema actualiza el estado de la denuncia y audita la acción

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

