## ADDED Requirements

### Requirement: Radio basada en una canción
El sistema SHALL permitir a un usuario iniciar una radio a partir de un track semilla, devolviendo una cola de aproximadamente 25 tracks similares. La similitud SHALL calcularse por distancia sobre los atributos de audio del track (bailabilidad, energía, valencia, tempo y acústica), dando mayor peso a los tracks del mismo género que la semilla. La cola SHALL excluir el track semilla y SHALL excluir los tracks no disponibles.

#### Scenario: Iniciar radio desde un track
- **WHEN** un usuario solicita la radio de un track del catálogo
- **THEN** el sistema devuelve una cola de tracks similares al semilla, sin incluir el propio semilla, predominando el género del track semilla

#### Scenario: Radio de un track inexistente
- **WHEN** un usuario solicita la radio de un track que no existe o no está disponible
- **THEN** el sistema responde que el track no fue encontrado

### Requirement: Mix diario personalizado y determinista
El sistema SHALL ofrecer a un usuario autenticado un mix diario de aproximadamente 30 tracks construido a partir de su historial de reproducción y sus favoritos, combinando una mayoría de tracks afines a lo que consume con una porción minoritaria de exploración fuera de sus géneros habituales. El mix SHALL ser determinista para un mismo usuario dentro de un mismo día, y SHALL cambiar al día siguiente. Si el usuario no tiene historial ni favoritos, el sistema SHALL degradar el mix a tracks populares.

#### Scenario: El mix del día es estable
- **WHEN** un usuario solicita su mix diario dos veces el mismo día
- **THEN** el sistema devuelve exactamente el mismo conjunto de tracks en el mismo orden

#### Scenario: El mix cambia de un día a otro
- **WHEN** un usuario solicita su mix diario en dos días distintos
- **THEN** el sistema devuelve mixes diferentes

#### Scenario: Mix con exploración
- **WHEN** un usuario con historial suficiente solicita su mix diario
- **THEN** el mix incluye mayoritariamente tracks afines a sus géneros y atributos habituales, y una porción minoritaria de tracks fuera de esos géneros

#### Scenario: Usuario sin historial
- **WHEN** un usuario sin historial ni favoritos solicita su mix diario
- **THEN** el sistema devuelve un mix de tracks populares

### Requirement: Recomendaciones por afinidad de audio con motivo explicable
El sistema SHALL construir las recomendaciones de un usuario a partir de su perfil de audio, entendido como el promedio de los atributos de audio de los tracks que ha marcado como favoritos y ha reproducido, recomendando tracks disponibles cercanos a ese perfil que el usuario no haya escuchado ni marcado como favorito. Cada track recomendado SHALL incluir un motivo legible que explique por qué se sugiere. Si el usuario no tiene historial ni favoritos, el sistema SHALL degradar la recomendación a tracks populares de géneros diversos.

#### Scenario: Recomendaciones afines al perfil del usuario
- **WHEN** un usuario con favoritos e historial solicita sus recomendaciones
- **THEN** el sistema devuelve tracks disponibles cercanos a su perfil de audio, ninguno de los cuales ha escuchado ni marcado como favorito

#### Scenario: Cada recomendación explica su motivo
- **WHEN** un usuario solicita sus recomendaciones
- **THEN** cada track recomendado incluye un motivo legible que justifica la sugerencia

#### Scenario: Usuario sin señal de consumo
- **WHEN** un usuario sin favoritos ni historial solicita sus recomendaciones
- **THEN** el sistema devuelve tracks populares de géneros diversos
