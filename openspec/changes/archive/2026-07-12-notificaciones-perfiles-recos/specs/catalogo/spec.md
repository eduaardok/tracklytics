## ADDED Requirements

### Requirement: Visibilidad pública de una playlist propia
El sistema SHALL permitir al dueño de una playlist marcarla como pública o privada, privada por defecto. Solo las playlists marcadas como públicas SHALL aparecer en el perfil público de su dueño. Esta operación SHALL estar restringida exclusivamente al dueño de la playlist, incluyendo a sus colaboradores.

#### Scenario: El dueño marca una playlist como pública
- **WHEN** el dueño de una playlist la marca como pública
- **THEN** el sistema persiste ese cambio y la playlist queda visible en el perfil público del dueño, si este es público

#### Scenario: El dueño marca una playlist como privada
- **WHEN** el dueño de una playlist previamente pública la marca como privada
- **THEN** el sistema persiste ese cambio y la playlist deja de aparecer en el perfil público del dueño

#### Scenario: Un colaborador intenta cambiar la visibilidad
- **WHEN** un colaborador (no dueño) de una playlist intenta cambiar su visibilidad
- **THEN** el sistema rechaza la operación indicando que es exclusiva del propietario

#### Scenario: Playlist nueva nace privada
- **WHEN** un usuario crea una nueva playlist
- **THEN** la playlist queda marcada como privada hasta que su dueño la cambie explícitamente
