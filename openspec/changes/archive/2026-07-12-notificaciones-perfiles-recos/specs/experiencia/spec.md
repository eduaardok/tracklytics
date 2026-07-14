## ADDED Requirements

### Requirement: Recomendaciones personalizadas en secciones
El sistema SHALL presentar las recomendaciones personalizadas de un Usuario B2C autenticado agrupadas en hasta tres secciones independientes: "Hecho para ti" (similitud de audio real dentro de sus géneros más escuchados, con mismo género que sus favoritos y popularidad global como niveles de respaldo si no hay señal suficiente — siempre presente), "Novedades de artistas que sigues" (tracks recientes de artistas con seguimiento activo) y "Redescubre" (tracks del propio historial o favoritos con la interacción menos reciente). Una sección SHALL omitirse de la respuesta, en vez de incluirse vacía, cuando no exista señal suficiente para generarla.

#### Scenario: Usuario con historial de escucha y artistas seguidos recibe las tres secciones
- **WHEN** un Usuario B2C autenticado con historial de reproducción y al menos un artista seguido con tracks recientes solicita sus recomendaciones
- **THEN** el sistema retorna las tres secciones, cada una con su propio título y sus propios tracks

#### Scenario: Usuario sin artistas seguidos no recibe la sección de novedades
- **WHEN** un Usuario B2C autenticado que no sigue a ningún artista, o cuyos artistas seguidos no tienen tracks nuevos, solicita sus recomendaciones
- **THEN** el sistema retorna sus recomendaciones sin la sección "Novedades de artistas que sigues"

#### Scenario: Usuario sin historial ni favoritos no recibe la sección de redescubrimiento
- **WHEN** un Usuario B2C autenticado que nunca marcó un favorito ni reprodujo un track solicita sus recomendaciones
- **THEN** el sistema retorna sus recomendaciones sin la sección "Redescubre"

#### Scenario: "Hecho para ti" siempre está presente
- **WHEN** cualquier Usuario B2C autenticado solicita sus recomendaciones, incluso sin historial ni favoritos
- **THEN** el sistema retorna la sección "Hecho para ti" con tracks populares como respaldo final
