## ADDED Requirements

### Requirement: Takedown administrativo de un track
El sistema SHALL permitir a un usuario con rol `admin_contenido` ocultar un track del catálogo (`FACT_TRACKS.disponible = 0`) y restaurarlo (`disponible = 1`). Un track oculto SHALL seguir existiendo en la base de datos pero SHALL NO aparecer en las consultas públicas de catálogo. Ambas acciones SHALL auditarse.

#### Scenario: Ocultar un track
- **WHEN** un `admin_contenido` oculta un track por su `fact_id`
- **THEN** el track deja de aparecer en búsquedas y listados públicos, pero se conserva en la base de datos

#### Scenario: Restaurar un track oculto
- **WHEN** un `admin_contenido` restaura un track previamente oculto
- **THEN** el track vuelve a aparecer en el catálogo público

### Requirement: Filtrado de disponibilidad en el catálogo público
El sistema SHALL filtrar por `disponible = 1` todas las consultas públicas de catálogo (listado, búsqueda, top, detalle, por artista, por álbum y por género), de modo que los tracks retirados no sean visibles.

#### Scenario: Un track oculto no aparece en búsqueda
- **WHEN** un usuario busca un track que ha sido ocultado
- **THEN** el sistema no lo incluye en los resultados
