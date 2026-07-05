## MODIFIED Requirements

### Requirement: Consulta de disponibilidad de un track por país
El sistema SHALL permitir a un Usuario B2C autenticado consultar si un track está disponible en su país antes de reproducirlo, localizando el track mediante una búsqueda por nombre de track o de artista en vez de un identificador interno escrito manualmente. Esta consulta SHALL ser de solo lectura y no SHALL bloquear ni registrar ningún intento de reproducción. La determinación del país del usuario SHALL depender del país declarado en su perfil; si ese valor no coincide con ningún país conocido por el sistema, el track SHALL considerarse disponible.

#### Scenario: Buscar el track por nombre o artista antes de consultar su disponibilidad
- **WHEN** un Usuario B2C autenticado escribe parte del nombre de un track o de un artista para consultar disponibilidad
- **THEN** el sistema muestra las coincidencias encontradas para que el usuario seleccione el track exacto, sin requerir que conozca ni escriba su identificador interno

#### Scenario: Consultar disponibilidad de un track disponible
- **WHEN** un Usuario B2C autenticado consulta la disponibilidad de un track que no tiene restricciones activas en su país
- **THEN** el sistema indica que el track está disponible, sin registrar ningún evento de restricción

#### Scenario: Consultar disponibilidad de un track restringido
- **WHEN** un Usuario B2C autenticado consulta la disponibilidad de un track que tiene una restricción activa en su país
- **THEN** el sistema indica que el track no está disponible junto con el tipo de restricción, sin bloquear nada ni registrar un evento en `FACT_RESTRICCION_REPRODUCCION`

#### Scenario: País del usuario no reconocido al consultar disponibilidad
- **WHEN** un Usuario B2C autenticado cuyo país de perfil no coincide con ningún país conocido por el sistema consulta la disponibilidad de un track
- **THEN** el sistema indica que el track está disponible, al no poder determinar de forma confiable el país del usuario
