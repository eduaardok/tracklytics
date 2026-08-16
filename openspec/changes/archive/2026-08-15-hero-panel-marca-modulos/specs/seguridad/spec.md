## MODIFIED Requirements

### Requirement: Panel de marca público con datos reales del catálogo
El sistema SHALL mostrar, en el panel de marca de las páginas de login y registro, una
composición de módulos con datos reales del catálogo, obtenidos exclusivamente de endpoints
públicos que no requieren sesión iniciada: (1) un resumen de los tracks más populares (portada,
nombre, artista y valor de popularidad), (2) un módulo de popularidad promedio por género, y
(3) un bloque de estadísticas del catálogo (tracks totales y géneros catalogados). El sistema
SHALL omitir cada módulo individualmente cuando la carga de sus datos falle, sin sustituirlo por
valores inventados ni dejar la interfaz en un estado de carga indefinido, y sin que la falla de
un módulo afecte a los demás.

#### Scenario: Carga exitosa del resumen de catálogo
- **WHEN** un visitante sin sesión iniciada abre la página de login o registro y la consulta de tracks más populares responde correctamente
- **THEN** el panel de marca muestra los tracks reales devueltos, cada uno con su portada, nombre, artista y valor de popularidad real

#### Scenario: Falla la carga del resumen de catálogo
- **WHEN** un visitante sin sesión iniciada abre la página de login o registro y la consulta de tracks más populares falla
- **THEN** el panel de marca omite la sección de resumen de catálogo y muestra igualmente el resto de su contenido (identidad de marca, propuesta de valor, funcionalidades), sin quedar vacío

#### Scenario: Portada individual sin resolver dentro del resumen
- **WHEN** un track del resumen de catálogo no tiene una portada real resuelta
- **THEN** el sistema muestra un reemplazo visual determinístico para ese track en vez de un espacio vacío o una imagen rota

#### Scenario: Carga exitosa de la popularidad por género
- **WHEN** un visitante sin sesión iniciada abre la página de login o registro y la consulta de géneros del catálogo responde correctamente
- **THEN** el panel de marca muestra un módulo con los géneros de mayor popularidad promedio real, cada uno con su nombre y su valor de popularidad promedio real

#### Scenario: Falla la carga de la popularidad por género
- **WHEN** un visitante sin sesión iniciada abre la página de login o registro y la consulta de géneros del catálogo falla
- **THEN** el panel de marca omite el módulo de popularidad por género y muestra igualmente el resto de su contenido, sin quedar vacío

#### Scenario: Bloque de estadísticas con datos parcialmente disponibles
- **WHEN** un visitante sin sesión iniciada abre la página de login o registro y solo una de las consultas que alimentan el bloque de estadísticas del catálogo responde correctamente
- **THEN** el sistema muestra únicamente la estadística cuyo dato real está disponible, sin mostrar la otra como cero ni como valor inventado

#### Scenario: Bloque de estadísticas sin ningún dato disponible
- **WHEN** un visitante sin sesión iniciada abre la página de login o registro y ninguna consulta del bloque de estadísticas del catálogo responde correctamente
- **THEN** el sistema omite el bloque de estadísticas por completo y muestra igualmente el resto del panel de marca
