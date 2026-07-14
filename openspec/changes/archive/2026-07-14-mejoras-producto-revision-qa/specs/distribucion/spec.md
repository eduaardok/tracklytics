## ADDED Requirements

### Requirement: Explorar disponibilidad del catálogo por país en una lista
El sistema SHALL permitir a un Usuario B2C autenticado consultar una lista paginada del catálogo
con su estado de disponibilidad (disponible o bloqueado) para su país o para un país indicado, sin
requerir que conozca de antemano el nombre de ningún track. La lista SHALL ser filtrable por estado
(disponible, bloqueado, todos) y SHALL admitir una búsqueda opcional por nombre de track o artista
para acotarla. Esta consulta SHALL ser de solo lectura y no SHALL bloquear ni registrar ningún
intento de reproducción, con el mismo criterio de determinación de país ya vigente para la consulta
de un track puntual.

#### Scenario: Explorar la lista de disponibilidad sin buscar un track específico
- **WHEN** un Usuario B2C autenticado abre la vista de disponibilidad sin escribir ningún término de búsqueda
- **THEN** el sistema muestra una página del catálogo con el estado de disponibilidad (disponible o bloqueado) de cada track para su país

#### Scenario: Filtrar la lista por estado de disponibilidad
- **WHEN** un Usuario B2C autenticado filtra la lista de disponibilidad por "bloqueado"
- **THEN** el sistema muestra únicamente los tracks bloqueados en su país

#### Scenario: Acotar la lista con una búsqueda por nombre
- **WHEN** un Usuario B2C autenticado escribe parte del nombre de un track o artista mientras explora la lista de disponibilidad
- **THEN** el sistema acota la lista a los tracks cuyo nombre o artista coincide, manteniendo el filtro de estado activo

#### Scenario: País del usuario no reconocido al explorar la lista
- **WHEN** un Usuario B2C autenticado cuyo país de perfil no coincide con ningún país conocido por el sistema abre la vista de disponibilidad
- **THEN** el sistema muestra todos los tracks de la página como disponibles, al no poder determinar de forma confiable el país del usuario
