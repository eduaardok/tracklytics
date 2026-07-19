## ADDED Requirements

### Requirement: Búsqueda unificada multi-entidad
El sistema SHALL ofrecer una búsqueda única que, a partir de un solo término, devuelva resultados agrupados por tipo de entidad: tracks, artistas, álbumes y playlists. Cada grupo SHALL estar limitado a un número máximo de resultados configurable por el cliente. La búsqueda SHALL respetar la disponibilidad del catálogo, de modo que los tracks retirados por takedown no aparezcan en ningún grupo, ni directamente ni a través de los artistas y álbumes que los contienen.

#### Scenario: Buscar un término y obtener los cuatro grupos
- **WHEN** un usuario busca un término presente en el catálogo
- **THEN** el sistema devuelve un resultado con los grupos de tracks, artistas, álbumes y playlists, cada uno con como máximo el número de resultados solicitado

#### Scenario: Un track retirado no aparece en la búsqueda unificada
- **WHEN** un usuario busca un término que coincide con un track ocultado por takedown
- **THEN** el sistema no incluye ese track en el grupo de tracks

#### Scenario: Visibilidad de playlists en la búsqueda
- **WHEN** un usuario busca un término que coincide con playlists
- **THEN** el sistema devuelve únicamente las playlists públicas y, si el usuario está autenticado, además las suyas propias aunque sean privadas

#### Scenario: Búsqueda sin sesión iniciada
- **WHEN** un usuario sin sesión realiza una búsqueda unificada
- **THEN** el sistema responde con normalidad e incluye únicamente playlists públicas
