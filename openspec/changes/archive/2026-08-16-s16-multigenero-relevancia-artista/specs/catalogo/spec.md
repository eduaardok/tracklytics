## MODIFIED Requirements

### Requirement: Búsqueda de catálogo musical
El sistema SHALL permitir buscar tracks por nombre, artista o género contra FACT_TRACKS en ClickHouse, con resultados paginados, y SHALL responder en menos de 1 segundo bajo condiciones normales de carga (~700k registros en FACT_TRACKS). Cuando la búsqueda incluye un término de texto, el sistema SHALL ordenar los resultados por relevancia textual como criterio primario (coincidencia exacta de nombre de track o artista, luego coincidencia de prefijo, luego coincidencia parcial), usando la popularidad como desempate dentro de cada nivel de relevancia — sin reemplazar la popularidad como criterio de orden cuando la búsqueda no incluye texto.

#### Scenario: Búsqueda por nombre, artista o género
- **WHEN** un usuario autenticado o Cliente B2B ingresa un término de búsqueda válido (nombre, artista o género)
- **THEN** el sistema retorna una lista paginada de tracks coincidentes en menos de 1 segundo

#### Scenario: Una coincidencia exacta se muestra antes que una parcial más popular
- **WHEN** un usuario busca un término que coincide exactamente con el nombre de un track o artista de popularidad baja o media, y ese mismo término coincide solo parcialmente con el nombre de otro track o artista de popularidad más alta
- **THEN** el sistema muestra primero el resultado de coincidencia exacta, antes que el resultado de coincidencia parcial más popular

#### Scenario: Sin término de texto, el orden sigue siendo por popularidad
- **WHEN** un usuario filtra el catálogo sin ingresar ningún término de búsqueda (solo por género u otros atributos)
- **THEN** el sistema ordena los resultados por popularidad descendente, como antes de este cambio
