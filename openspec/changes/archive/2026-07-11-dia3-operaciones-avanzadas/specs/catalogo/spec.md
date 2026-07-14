## MODIFIED Requirements

### Requirement: Gestión de playlists propias
El sistema SHALL permitir crear, renombrar y eliminar playlists propias del usuario, y agregar, quitar o reordenar tracks de una playlist propia o de una playlist en la que el usuario sea colaborador. Un track solo puede agregarse una vez a la misma playlist (sin duplicados dentro de una playlist). Renombrar o eliminar una playlist SHALL estar restringido exclusivamente al usuario propietario, incluso si la playlist tiene colaboradores. Eliminar una playlist SHALL eliminar también todos sus tracks asociados.

#### Scenario: Crear, renombrar o eliminar una playlist
- **WHEN** el propietario de una playlist la crea, renombra o elimina
- **THEN** el sistema aplica el cambio en PocketBase y lo asocia exclusivamente al usuario propietario

#### Scenario: Eliminar una playlist con tracks
- **WHEN** el propietario elimina una playlist que tiene uno o más tracks
- **THEN** el sistema elimina primero los tracks asociados y luego la playlist, sin dejar registros huérfanos

#### Scenario: Agregar un track a una playlist
- **WHEN** el propietario o un colaborador agrega un track que no está presente en la playlist
- **THEN** el sistema agrega el track a la playlist

#### Scenario: Track duplicado en playlist
- **WHEN** un track ya pertenece a una playlist y el propietario o un colaborador intenta agregarlo de nuevo a la misma playlist
- **THEN** el sistema rechaza la operación y muestra un mensaje indicando que el track ya está en la playlist

#### Scenario: Colaborador intenta renombrar o eliminar la playlist
- **WHEN** un colaborador (no propietario) intenta renombrar o eliminar una playlist en la que colabora
- **THEN** el sistema rechaza la operación indicando que solo el propietario puede hacerlo

## ADDED Requirements

### Requirement: Filtro de búsqueda por popularidad y atributos de audio
El sistema SHALL permitir filtrar los resultados de búsqueda de catálogo por popularidad mínima y por rango de tempo y energy mínima, de forma opcional y combinable con el término de búsqueda y el filtro de género.

#### Scenario: Filtrar búsqueda por popularidad mínima
- **WHEN** un usuario aplica un filtro de popularidad mínima sobre una búsqueda de catálogo
- **THEN** el sistema retorna únicamente tracks con popularidad mayor o igual al valor indicado

#### Scenario: Filtrar búsqueda por rango de tempo
- **WHEN** un usuario aplica un filtro de tempo mínimo y/o máximo sobre una búsqueda de catálogo
- **THEN** el sistema retorna únicamente tracks cuyo tempo cae dentro del rango indicado

#### Scenario: Combinar filtros avanzados con término de búsqueda
- **WHEN** un usuario combina un término de búsqueda con filtros de popularidad, tempo y energy
- **THEN** el sistema retorna únicamente los tracks que satisfacen simultáneamente todas las condiciones indicadas

### Requirement: Reordenamiento de tracks en una playlist
El sistema SHALL permitir al propietario de una playlist o a cualquiera de sus colaboradores reordenar los tracks de esa playlist, especificando el nuevo orden completo de `fact_id`.

#### Scenario: Propietario o colaborador reordena los tracks de una playlist
- **WHEN** el propietario o un colaborador envía un nuevo orden de tracks para una playlist con acceso
- **THEN** el sistema persiste ese orden y las consultas posteriores del detalle de la playlist lo reflejan

### Requirement: Colaboradores de una playlist
El sistema SHALL permitir al propietario de una playlist invitar a otro usuario como colaborador identificándolo por correo electrónico, y quitarlo en cualquier momento. Un colaborador SHALL poder ver la playlist y agregar, quitar y reordenar sus tracks, pero NO SHALL poder renombrarla, eliminarla, ni gestionar la lista de colaboradores. El detalle de una playlist SHALL indicar si el usuario que consulta es el propietario y SHALL listar sus colaboradores actuales.

#### Scenario: Propietario invita a un colaborador por correo
- **WHEN** el propietario de una playlist invita a un usuario registrado por su correo electrónico
- **THEN** el sistema agrega a ese usuario como colaborador de la playlist, quien pasa a poder verla y gestionar sus tracks

#### Scenario: Propietario invita a un correo que no corresponde a ningún usuario
- **WHEN** el propietario intenta invitar a un correo que no corresponde a ningún usuario registrado
- **THEN** el sistema rechaza la operación indicando que no existe un usuario con ese correo

#### Scenario: Propietario quita a un colaborador
- **WHEN** el propietario quita a un colaborador de una playlist
- **THEN** ese usuario deja de poder ver o modificar la playlist

#### Scenario: Colaborador consulta el detalle de una playlist compartida con él
- **WHEN** un colaborador consulta el detalle de una playlist en la que fue invitado
- **THEN** el sistema muestra los tracks de la playlist y la lista de colaboradores, indicando que el usuario no es el propietario
