## ADDED Requirements

### Requirement: Edición de la metadata de un track propio por el artista
El sistema SHALL permitir a un artista con cuenta aprobada editar el nombre, álbum, género y descripción de un track propio (pendiente o aprobado). Si el track estaba `aprobado`, la edición SHALL devolverlo al estado `pendiente` para revisión editorial. Un artista SHALL poder editar únicamente sus propios tracks.

#### Scenario: Editar un track aprobado lo devuelve a pendiente
- **WHEN** un artista aprobado edita la metadata de un track propio que estaba aprobado
- **THEN** el sistema aplica los cambios y devuelve el track a estado `pendiente`

#### Scenario: Un artista no puede editar tracks ajenos
- **WHEN** un artista intenta editar un track que no le pertenece
- **THEN** el sistema rechaza la operación con 403

### Requirement: Retiro de un track propio por el artista
El sistema SHALL permitir a un artista con cuenta aprobada retirar un track propio, marcándolo con estado `retirado` y ejecutando el takedown equivalente en el catálogo (`FACT_TRACKS.disponible = 0`).

#### Scenario: Retirar un track propio
- **WHEN** un artista aprobado retira un track propio
- **THEN** el sistema marca el track como `retirado` y lo oculta del catálogo público
