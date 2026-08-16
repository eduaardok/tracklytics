## ADDED Requirements

### Requirement: Panel de marca público con datos reales del catálogo
El sistema SHALL mostrar, en el panel de marca de las páginas de login y registro, un resumen de los tracks más populares del catálogo (portada, nombre, artista y valor de popularidad), obtenido exclusivamente de endpoints públicos que no requieren sesión iniciada. El sistema SHALL omitir esta sección por completo cuando la carga de esos datos falle, sin sustituirla por valores inventados ni dejar la interfaz en un estado de carga indefinido.

#### Scenario: Carga exitosa del resumen de catálogo
- **WHEN** un visitante sin sesión iniciada abre la página de login o registro y la consulta de tracks más populares responde correctamente
- **THEN** el panel de marca muestra los tracks reales devueltos, cada uno con su portada, nombre, artista y valor de popularidad real

#### Scenario: Falla la carga del resumen de catálogo
- **WHEN** un visitante sin sesión iniciada abre la página de login o registro y la consulta de tracks más populares falla
- **THEN** el panel de marca omite la sección de resumen de catálogo y muestra igualmente el resto de su contenido (identidad de marca, propuesta de valor, funcionalidades), sin quedar vacío

#### Scenario: Portada individual sin resolver dentro del resumen
- **WHEN** un track del resumen de catálogo no tiene una portada real resuelta
- **THEN** el sistema muestra un reemplazo visual determinístico para ese track en vez de un espacio vacío o una imagen rota
