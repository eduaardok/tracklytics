## MODIFIED Requirements

### Requirement: Consulta de comentarios de un track
El sistema SHALL permitir a cualquier usuario autenticado consultar los comentarios de un track existente cuyo estado de moderación no sea eliminado, excluyendo también cualquier comentario cuyo comentario padre esté eliminado. El usuario SHALL poder localizar el track mediante una búsqueda por nombre de track o de artista, sin requerir que conozca ni escriba su identificador interno.

#### Scenario: Buscar el track por nombre o artista antes de consultar sus comentarios
- **WHEN** un usuario autenticado escribe parte del nombre de un track o de un artista para ver sus comentarios
- **THEN** el sistema muestra las coincidencias encontradas para que el usuario seleccione el track exacto

#### Scenario: Consultar comentarios de un track
- **WHEN** un usuario autenticado solicita los comentarios de un track existente
- **THEN** el sistema retorna los comentarios de ese track cuyo estado de moderación no sea eliminado, y cuyo comentario padre —si existe— tampoco esté eliminado
