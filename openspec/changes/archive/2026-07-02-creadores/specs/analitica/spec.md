## MODIFIED Requirements

### Requirement: Dashboard ejecutivo de KPIs
El sistema SHALL mostrar un dashboard con KPIs agregados del catálogo (total tracks, total artistas, total géneros, popularidad promedio, energy promedio, danceability promedio) en una sola pantalla. Las consultas del dashboard ejecutivo SHALL completarse en menos de 3 segundos en condiciones normales (volumen actual ~700k registros en FACT_TRACKS). El total de tracks y la popularidad promedio SHALL incluir todo el catálogo, incluidos los tracks publicados por artistas (`source_type='user_uploaded'`); energy promedio y danceability promedio SHALL excluir esos tracks, ya que sus atributos de audio son valores por defecto sin análisis real, no mediciones.

#### Scenario: Mostrar KPIs agregados del catálogo
- **WHEN** un Cliente B2B o Data Analyst/BI Lead con acceso autorizado abre el dashboard ejecutivo
- **THEN** el sistema muestra en una sola pantalla el total de tracks, total de artistas, total de géneros, popularidad promedio, energy promedio y danceability promedio, en menos de 3 segundos

#### Scenario: Los KPIs de audio no se ven distorsionados por tracks publicados por artistas
- **WHEN** el catálogo incluye uno o más tracks con `source_type='user_uploaded'`
- **THEN** el energy promedio y el danceability promedio del dashboard se calculan excluyendo esos tracks, mientras que el total de tracks y la popularidad promedio sí los incluyen

### Requirement: Perfil de audio por género
El sistema SHALL permitir seleccionar un género y mostrar su perfil de audio como gráfico de radar con los 7 atributos principales, calculado únicamente sobre tracks con atributos de audio reales o derivados del catálogo base (excluyendo `source_type='user_uploaded'`, cuyos atributos de audio son valores por defecto sin análisis real). El conteo de tracks del género (`track_count`) SHALL seguir incluyendo todos los tracks del género, sin excluir ninguno.

#### Scenario: Consulta exitosa de perfil de audio por género
- **WHEN** existen tracks registrados para un género en FACT_TRACKS y el Cliente B2B selecciona ese género
- **THEN** el sistema muestra el radar de 7 atributos de audio promedio para ese género en menos de 3 segundos

#### Scenario: El perfil de audio de un género con tracks publicados por artistas no se distorsiona
- **WHEN** un género tiene tracks con `source_type='user_uploaded'` además de tracks del catálogo base
- **THEN** el radar de 7 atributos de audio se calcula excluyendo los tracks `user_uploaded`, mientras que `track_count` del género sí los incluye

### Requirement: Comparación lado a lado de dos artistas
El sistema SHALL permitir seleccionar dos artistas y mostrar una comparación lado a lado de sus métricas de audio. Las métricas de audio (danceability, energy, speechiness, acousticness, instrumentalness, liveness, valence) SHALL excluir los tracks `source_type='user_uploaded'` de ese artista, ya que sus atributos de audio son valores por defecto sin análisis real; el conteo de tracks, la popularidad promedio y el conteo de contenido explícito SHALL seguir incluyendo todos los tracks del artista.

#### Scenario: Comparar dos artistas seleccionados
- **WHEN** un Cliente B2B selecciona dos artistas a comparar
- **THEN** el sistema muestra una comparación lado a lado de las métricas de audio de ambos artistas

#### Scenario: Comparar un artista con tracks publicados junto a tracks del catálogo base
- **WHEN** uno de los artistas comparados tiene tracks con `source_type='user_uploaded'` además de tracks del catálogo base
- **THEN** sus métricas de audio se calculan excluyendo los tracks `user_uploaded`, mientras que su conteo de tracks, popularidad promedio y conteo de contenido explícito sí los incluyen

### Requirement: Benchmark de artista contra su género
El sistema SHALL permitir comparar un artista contra el promedio de su género (benchmark). El benchmark de género SHALL calcularse sobre el promedio de popularidad de todos los tracks de ese género en FACT_TRACKS, sin excluir outliers. Cuando el benchmark involucre atributos de audio (no solo popularidad), SHALL excluir los tracks `source_type='user_uploaded'` del promedio, ya que sus atributos de audio son valores por defecto sin análisis real y no constituyen una medición del género — esta exclusión no es una exclusión de outliers, sino de datos no medidos.

#### Scenario: Comparar artista contra el promedio del género
- **WHEN** un Cliente B2B selecciona un artista y su género para benchmark
- **THEN** el sistema muestra la comparación del artista contra el promedio de popularidad de todos los tracks de ese género, sin excluir outliers

#### Scenario: El benchmark de audio de un género no se distorsiona por tracks publicados por artistas
- **WHEN** el género usado como benchmark incluye uno o más tracks con `source_type='user_uploaded'`
- **THEN** el promedio de atributos de audio del benchmark excluye esos tracks, mientras que el benchmark de popularidad sí los incluye

### Requirement: Tendencias temporales por semana
El sistema SHALL mostrar la evolución de popularidad y energy promedio por semana de carga (`load_week`) en un gráfico de serie temporal. La popularidad promedio SHALL incluir todos los tracks de la semana, incluidos los `source_type='user_uploaded'`; el energy promedio SHALL excluir esos tracks, ya que sus atributos de audio son valores por defecto sin análisis real.

#### Scenario: Consultar serie temporal para un rango de semanas válido
- **WHEN** un Cliente B2B solicita la serie temporal para un rango de semanas válido
- **THEN** el sistema muestra la evolución de popularidad y energy promedio por semana, sin errores

#### Scenario: El energy promedio semanal no se distorsiona por tracks publicados por artistas
- **WHEN** una semana incluye uno o más tracks con `source_type='user_uploaded'`
- **THEN** el energy promedio de esa semana se calcula excluyendo esos tracks, mientras que la popularidad promedio sí los incluye
