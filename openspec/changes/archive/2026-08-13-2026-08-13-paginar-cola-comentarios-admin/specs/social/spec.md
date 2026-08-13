## MODIFIED Requirements

### Requirement: Cola administrativa de comentarios

El sistema SHALL permitir a un usuario con rol admin consultar los comentarios de la plataforma
de forma paginada, filtrables por track o por estado de moderación, incluyendo su estado de
moderación en la respuesta. La respuesta SHALL incluir el conteo total de comentarios que
coinciden con el filtro aplicado, además de la página solicitada.

#### Scenario: Admin consulta una página del listado administrativo de comentarios

- **WHEN** un usuario con rol admin solicita el listado administrativo de comentarios,
  opcionalmente filtrado por track o por estado de moderación, y opcionalmente indicando página
  y tamaño de página
- **THEN** el sistema retorna esa página de comentarios junto con su estado de moderación y el
  conteo total de comentarios que coinciden con el filtro

#### Scenario: Usuario sin rol admin intenta consultar la cola administrativa

- **WHEN** un usuario con rol distinto de admin intenta acceder al listado administrativo de
  comentarios
- **THEN** el sistema rechaza la operación
