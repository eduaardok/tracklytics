# Capability: social

## Objetivo

Permitir que un Usuario B2C siga artistas, comente tracks (incluyendo respuestas en hilo) y registre la intención de compartir contenido, con moderación administrativa reactiva sobre los comentarios publicados.

## Contexto

Hoy Tracklytics es una plataforma de consumo pasivo: un Usuario B2C explora el catálogo y arma su biblioteca personal (favoritos, historial, playlists), pero no tiene ninguna forma de interactuar con otros usuarios ni de expresar afinidad por un artista fuera de su propia biblioteca privada. Esta capability introduce las tres piezas sociales mínimas — seguir, comentar, compartir — reutilizando la identidad de usuario ya existente (`seguridad`) y el catálogo ya existente (`catalogo`), sin duplicar ninguna de las dos entidades.

## Actores

- **Usuario B2C** (`role=user`): sigue y deja de seguir artistas, comenta tracks y responde a comentarios, comparte contenido, y consulta sus propios seguidos y los comentarios públicos de cualquier track.
- **Cliente B2B** (`role=analyst`): solo lectura — consulta comentarios ya publicados, pero no puede seguir, comentar ni compartir.
- **Lead Data Engineer / CTO** (`role=admin`): modera comentarios (ocultar/eliminar) y consulta la cola administrativa de comentarios.

## Tabla de trazabilidad

| Nivel empresarial | Departamento | Paquete | Caso de uso | Historia de usuario |
|---|---|---|---|---|
| Operativo | Usuario B2C | Interacción social | CU-O29 Seguir a un artista | Como Usuario B2C, quiero seguir a un artista, para recibir su música asociada en mi experiencia de exploración |
| Operativo | Usuario B2C | Interacción social | CU-O30 Dejar de seguir a un artista | Como Usuario B2C, quiero dejar de seguir a un artista, para dejar de asociar mi actividad a él |
| Operativo | Usuario B2C | Interacción social | CU-O31 Consultar los artistas que sigo | Como Usuario B2C, quiero ver la lista de artistas que sigo, para llevar control de mis preferencias |
| Operativo | Usuario B2C | Interacción social | CU-O32 Comentar un track | Como Usuario B2C, quiero comentar un track o responder a un comentario existente, para participar en la conversación alrededor de la música |
| Operativo | Usuario B2C / Cliente B2B | Interacción social | CU-O33 Consultar comentarios de un track | Como Usuario B2C, quiero ver los comentarios visibles de un track, para conocer la opinión de otros usuarios |
| Operativo | Lead Data Engineer / CTO | Interacción social | CU-O34 Moderar un comentario | Como Lead Data Engineer/CTO, quiero ocultar o eliminar un comentario, para mantener la calidad de la conversación pública |
| Operativo | Lead Data Engineer / CTO | Interacción social | CU-O35 Consultar la cola administrativa de comentarios | Como Lead Data Engineer/CTO, quiero ver todos los comentarios con su estado de moderación, para priorizar mi trabajo de revisión |
| Operativo | Usuario B2C | Interacción social | CU-O36 Compartir contenido | Como Usuario B2C, quiero generar un enlace o texto para compartir un track, una playlist o un perfil de artista, para difundirlo fuera de la plataforma |

## ADDED Requirements

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

## Entradas

- Identificador de artista a seguir o dejar de seguir.
- Contenido del comentario, identificador del track, e identificador opcional del comentario padre (comentar/responder).
- Decisión de moderación (ocultar/eliminar) e identificador del comentario objetivo (moderación administrativa).
- Filtros opcionales por track o estado de moderación (cola administrativa).
- Identificador del contenido a compartir en su propio campo — track, artista o playlist — y canal seleccionado.

## Salidas

- Confirmación del seguimiento o del cese de seguimiento, y listado de artistas seguidos.
- Confirmación del comentario publicado, con su identificador y estado de moderación (`visible` por defecto).
- Listado de comentarios de un track (público) o listado administrativo completo con estado de moderación.
- Confirmación de la moderación aplicada (`oculto`/`eliminado`), con administrador y fecha de resolución.
- Confirmación de la intención de compartir, con el enlace o texto generado para el canal indicado.
- Mensaje de error si el objeto de la interacción no existe, si la operación administrativa no está autorizada, o si un Cliente B2B intenta seguir, comentar o compartir.

## Dependencias

- **ClickHouse**: `BRIDGE_SEGUIMIENTO_ARTISTA`, `FACT_COMENTARIO`, `FACT_COMPARTICION`, `DIM_TIPO_INTERACCION_SOCIAL` (tablas nuevas); `DIM_USUARIO` y `DIM_ARTISTS`/`FACT_TRACKS` (lectura, para validar existencia y resolver identidad).
- **Capability `seguridad`**: token de sesión autenticado (`core.deps.get_current_user`), restricción de Cliente B2B (`core.deps.require_b2c_user`), gating de `admin` (`paquetes.seguridad.deps.require_admin`) y auditoría (`paquetes.seguridad.audit.record`).
- **Capability `catalogo`**: `FACT_TRACKS`/`DIM_ARTISTS` como objeto de la interacción (seguir, comentar, compartir).

## Fuera de alcance

- Integración real con APIs de X/WhatsApp — solo se registra la intención de compartir.
- Notificaciones push/email al seguir, comentar o responder.
- Likes/reacciones a comentarios.
- Reportes de usuarios sobre comentarios — la moderación es exclusivamente administrativa y reactiva.
- Límite de profundidad de hilos de comentarios (respuestas a respuestas).
