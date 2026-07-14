## ADDED Requirements

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
