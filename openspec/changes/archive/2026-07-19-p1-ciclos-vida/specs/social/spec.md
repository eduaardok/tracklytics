## ADDED Requirements

### Requirement: Denuncia de contenido por usuarios
El sistema SHALL permitir a un usuario B2C autenticado denunciar un comentario (`tipo_objeto = 'comentario'`) o un track (`tipo_objeto = 'track'`) indicando un motivo tipificado (`spam` | `contenido_inapropiado` | `derechos_de_autor` | `otro`) y una descripción opcional. La denuncia SHALL registrarse en `FACT_DENUNCIA` con estado `pendiente`.

#### Scenario: Denunciar un comentario
- **WHEN** un usuario B2C denuncia un comentario indicando el motivo `spam`
- **THEN** el sistema registra la denuncia en estado `pendiente` con su motivo y objeto

### Requirement: Bandeja administrativa de denuncias
El sistema SHALL permitir a un usuario con rol `admin_comunidad` listar de forma paginada las denuncias con filtros por tipo de objeto, motivo y estado, y actualizar el estado de una denuncia (`revisada` | `resuelta`). La actualización SHALL auditarse.

#### Scenario: Listar denuncias pendientes
- **WHEN** un `admin_comunidad` lista las denuncias filtrando por estado `pendiente`
- **THEN** el sistema devuelve la página de denuncias pendientes con su tipo, motivo y objeto

#### Scenario: Marcar una denuncia como revisada
- **WHEN** un `admin_comunidad` actualiza una denuncia a estado `revisada`
- **THEN** el sistema actualiza el estado de la denuncia y audita la acción
