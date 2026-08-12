## MODIFIED Requirements

### Requirement: Radio basada en una canción

El sistema SHALL permitir a un usuario **autenticado** iniciar una radio a partir de un track
semilla, devolviendo una cola de aproximadamente 25 tracks similares. La similitud SHALL
calcularse por distancia sobre los atributos de audio del track (bailabilidad, energía, valencia,
tempo y acústica), dando mayor peso a los tracks del mismo género que la semilla. La cola SHALL
excluir el track semilla y SHALL excluir los tracks no disponibles. Un cliente sin sesión iniciada
SHALL recibir un rechazo de autenticación, sin recibir ninguna cola de tracks.

#### Scenario: Iniciar radio desde un track

- **WHEN** un usuario autenticado solicita la radio de un track del catálogo
- **THEN** el sistema devuelve una cola de tracks similares al semilla, sin incluir el propio
  semilla, predominando el género del track semilla

#### Scenario: Radio de un track inexistente

- **WHEN** un usuario autenticado solicita la radio de un track que no existe o no está disponible
- **THEN** el sistema responde que el track no fue encontrado

#### Scenario: Solicitud de radio sin sesión iniciada

- **WHEN** un cliente sin sesión iniciada solicita la radio de un track
- **THEN** el sistema rechaza la solicitud por falta de autenticación, sin devolver ninguna cola
  de tracks
