## ADDED Requirements

### Requirement: Asignación de año de lanzamiento y país de origen
Al integrar un álbum o artista nuevo que no exista todavía en el catálogo, el sistema SHALL asignarle un año de lanzamiento y, para el artista, un país de origen, con valores plausibles dentro de rangos y distribuciones realistas de la industria musical, en vez de dejar el campo sin informar. La asignación SHALL ser determinista: recalcularla para el mismo álbum o artista SHALL producir siempre el mismo valor.

#### Scenario: Integrar un álbum nuevo
- **WHEN** la ingesta integra un álbum que no existía previamente en el catálogo
- **THEN** el sistema le asigna un año de lanzamiento plausible, sin dejarlo sin informar

#### Scenario: Integrar un artista nuevo
- **WHEN** la ingesta integra un artista que no existía previamente en el catálogo
- **THEN** el sistema le asigna un país de origen plausible, sin dejarlo sin informar

#### Scenario: Recalcular el mismo álbum no cambia su año
- **WHEN** se recalcula el año de lanzamiento de un álbum que ya tiene uno asignado por este mecanismo
- **THEN** el sistema produce exactamente el mismo año que ya tenía asignado

### Requirement: Coherencia entre características de audio y género musical
Al integrar tracks nuevos, el sistema SHALL calibrar sus características de audio (energía, bailabilidad, acústica, instrumentalidad, valencia, tempo) contra el perfil típico del género musical que se les asigna, calculado a partir de los tracks del catálogo de origen que pertenecen a ese mismo género. Si un género no cuenta con una muestra mínima de tracks de origen para calcular un perfil confiable, el sistema SHALL usar el perfil general del catálogo como respaldo para ese género.

#### Scenario: Integrar un track de un género con perfil de referencia disponible
- **WHEN** la ingesta integra un track nuevo asignado a un género que cuenta con suficientes tracks de origen para calcular su perfil de audio
- **THEN** el sistema genera las características de audio del track dentro del perfil típico de ese género

#### Scenario: Integrar un track de un género sin muestra suficiente
- **WHEN** la ingesta integra un track nuevo asignado a un género que no cuenta con una muestra mínima de tracks de origen
- **THEN** el sistema genera sus características de audio a partir del perfil general del catálogo

### Requirement: Recalificación administrativa del catálogo existente
El sistema SHALL permitir al Lead Data Engineer disparar, desde la interfaz de gestión, una recalificación en bloque de los registros del catálogo ya cargados que tengan año/país sin informar o un perfil de características de audio incoherente con su género asignado. La recalificación SHALL ejecutarse a través del pipeline de ingesta (no como una edición directa de la tabla de hechos desde la interfaz), SHALL excluir siempre los registros del catálogo de origen, y SHALL registrar en el log de auditoría cuántos registros fueron corregidos.

#### Scenario: Disparar una recalificación del catálogo
- **WHEN** el Lead Data Engineer dispara la recalificación desde la interfaz de gestión
- **THEN** el sistema corrige, vía el pipeline de ingesta, los álbumes/artistas con año o país sin informar y los tracks con un perfil de audio incoherente con su género, y registra en el log de auditoría cuántos registros corrigió

#### Scenario: La recalificación no toca el catálogo de origen
- **WHEN** se ejecuta una recalificación del catálogo
- **THEN** el sistema no modifica ningún registro del catálogo de origen, aunque su año, país o perfil de audio coincidan con los criterios de corrección
