## ADDED Requirements

### Requirement: Mezclar la cola de reproducción (shuffle inteligente)
El reproductor persistente SHALL permitir mezclar el orden de la cola de reproducción restante bajo demanda. El sistema SHALL evitar, cuando la composición de la cola lo permita, que dos tracks consecutivos resultantes queden del mismo artista — a diferencia de una mezcla puramente aleatoria, que puede dejar pasar esa repetición por azar. La acción de mezclar SHALL estar disponible únicamente cuando la cola tiene más de un track.

#### Scenario: Mezclar una cola con varios artistas
- **WHEN** un usuario mezcla una cola de reproducción con tracks de más de un artista
- **THEN** el sistema reordena la cola evitando, cuando es posible, que dos tracks consecutivos sean del mismo artista

#### Scenario: Mezclar con un solo track en cola
- **WHEN** la cola de reproducción tiene un solo track o está vacía
- **THEN** el control de mezclar no está disponible

#### Scenario: Mezclar no altera el track en reproducción
- **WHEN** un usuario mezcla la cola mientras un track está sonando
- **THEN** el track en reproducción actual no cambia; solo se reordena la cola restante
