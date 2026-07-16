## MODIFIED Requirements

### Requirement: Acceso a paneles analíticos condicionado a suscripción activa
El acceso a los paneles analíticos B2B SHALL requerir una suscripción activa (ver capability
`suscripciones`); un Cliente B2B sin plan activo no puede consultar estos dashboards. Además, el
acceso SHALL graduarse según el tier de la suscripción activa (`básico < pro < enterprise`): los
paneles comparativos (comparar artistas, benchmark de artista vs. género, índice de desempeño
relativo, adquisición por canal) SHALL requerir tier Pro o superior; el resto de paneles operativos
base (dashboard ejecutivo, perfil de audio por género, tendencias temporales, disponibilidad de
infraestructura, engagement de un track/artista, y la búsqueda de artista que lo soporta) SHALL
permanecer accesibles desde tier Básico. Los paneles predictivos/estratégicos (proyección de
tendencia de género, proyección de trayectoria de artista) SHALL requerir tier Enterprise. Esta
graduación por tier es independiente del gating de `role == admin` (reporte diario operativo,
churn, funnel de conversión, P&L, MRR/ARR), que SHALL seguir siendo exclusivo de Data Analyst/BI
Lead o Lead Data Engineer/CTO sin relación con el tier de ningún Cliente B2B.

#### Scenario: Acceso sin suscripción activa
- **WHEN** un Cliente B2B sin una suscripción activa intenta acceder a cualquier panel analítico
- **THEN** el sistema le niega el acceso y lo redirige a la pantalla de suscripción

#### Scenario: Cliente B2B Básico accede a un panel operativo base
- **WHEN** un Cliente B2B con tier Básico activo consulta el dashboard ejecutivo, el perfil de
  audio de un género, las tendencias temporales, la disponibilidad de infraestructura, o el
  engagement de un track/artista
- **THEN** el sistema muestra el panel solicitado

#### Scenario: Cliente B2B Básico intenta acceder a un panel comparativo
- **WHEN** un Cliente B2B con tier Básico activo intenta comparar artistas, consultar un
  benchmark, el índice de desempeño relativo, o la adquisición por canal
- **THEN** el sistema le niega el acceso indicando que ese panel requiere tier Pro o superior, sin
  desactivar la suscripción activa del cliente

#### Scenario: Cliente B2B Pro accede a los paneles comparativos
- **WHEN** un Cliente B2B con tier Pro o Enterprise activo consulta cualquier panel comparativo
- **THEN** el sistema muestra el panel solicitado

#### Scenario: Cliente B2B Pro intenta acceder a un panel predictivo Enterprise
- **WHEN** un Cliente B2B con tier Pro (no Enterprise) intenta consultar la proyección de
  tendencia de un género o la proyección de trayectoria de un artista
- **THEN** el sistema le niega el acceso indicando que ese panel requiere tier Enterprise

### Requirement: Adquisición de usuarios por canal
El sistema SHALL registrar cada alta de usuario nuevo con su canal de adquisición y región, y
SHALL exponer un conteo de usuarios nuevos agrupado por canal y semana a Data Analyst/BI Lead y
Lead Data Engineer/CTO, y a Cliente B2B con tier Pro o superior.

#### Scenario: Consulta de adquisición con datos disponibles
- **WHEN** un Data Analyst/BI Lead, Lead Data Engineer/CTO, o Cliente B2B con tier Pro o superior
  y suscripción B2B activa consulta la vista de adquisición
- **THEN** el sistema devuelve el conteo de usuarios nuevos agrupado por canal de marketing y
  semana, cubriendo al menos las últimas semanas con datos cargados

#### Scenario: Acceso sin suscripción B2B activa
- **WHEN** un usuario sin suscripción B2B activa intenta acceder a la vista de adquisición
- **THEN** el sistema deniega el acceso con el mismo mecanismo ya usado en el resto de vistas
  tácticas de `analitica`

## ADDED Requirements

### Requirement: Proyección de tendencia de género (Enterprise)
El sistema SHALL permitir a un Cliente B2B con tier Enterprise consultar una proyección estimada
de la evolución de popularidad promedio de un género, calculada mediante una regresión lineal
simple sobre la serie semanal de popularidad de ese género, extrapolada a las semanas siguientes.
El sistema SHALL requerir al menos 3 semanas distintas con datos para calcular la proyección; con
menos datos, SHALL indicar que la proyección no puede calcularse en vez de mostrar un valor
extrapolado sin base suficiente. La proyección SHALL presentarse como una estimación estadística
("proyección"/"tendencia estimada"), nunca como una predicción de inteligencia artificial. Cuando
la proyección indique una caída sostenida (pendiente negativa que representa una baja acumulada
mayor al 10% del promedio de la serie en el horizonte proyectado), el sistema SHALL señalarlo
explícitamente como alerta temprana dentro de la misma respuesta.

#### Scenario: Proyección de un género con suficientes semanas de datos
- **WHEN** un Cliente B2B con tier Enterprise consulta la proyección de un género que tiene al
  menos 3 semanas distintas de datos de popularidad
- **THEN** el sistema muestra la proyección estimada de popularidad para las semanas siguientes,
  identificada explícitamente como estimación estadística

#### Scenario: Proyección de un género con datos insuficientes
- **WHEN** un Cliente B2B con tier Enterprise consulta la proyección de un género que tiene menos
  de 3 semanas distintas de datos de popularidad
- **THEN** el sistema indica que no hay datos suficientes para calcular la proyección, en vez de
  mostrar un valor extrapolado sin base suficiente

#### Scenario: Género con tendencia sostenida a la baja
- **WHEN** la proyección de un género resulta en una caída acumulada mayor al 10% del promedio de
  la serie en el horizonte proyectado
- **THEN** el sistema incluye una señal de alerta temprana en la respuesta, indicando la tendencia
  a la baja

### Requirement: Proyección de trayectoria de artista vs. género (Enterprise)
El sistema SHALL permitir a un Cliente B2B con tier Enterprise consultar una proyección estimada
de la trayectoria de un artista, comparando la pendiente proyectada de popularidad del artista
contra la pendiente proyectada de su género predominante, para indicar si el artista está ganando
o perdiendo tracción relativa a su género. El sistema SHALL requerir al menos 3 semanas distintas
de datos de popularidad del artista para calcular la proyección; con menos datos, SHALL indicar
que la proyección no puede calcularse. La proyección SHALL presentarse como una estimación
estadística, nunca como una predicción de inteligencia artificial. Cuando la trayectoria del
artista muestre una caída sostenida (mismo criterio de umbral que la proyección de género), el
sistema SHALL señalarlo explícitamente como alerta temprana dentro de la misma respuesta.

#### Scenario: Proyección de un artista con suficientes semanas de datos
- **WHEN** un Cliente B2B con tier Enterprise consulta la proyección de un artista que tiene al
  menos 3 semanas distintas de datos de popularidad
- **THEN** el sistema muestra la trayectoria estimada del artista ("ganando terreno", "perdiendo
  terreno" o "estable") respecto a su género predominante, identificada explícitamente como
  estimación estadística

#### Scenario: Proyección de un artista con datos insuficientes
- **WHEN** un Cliente B2B con tier Enterprise consulta la proyección de un artista que tiene menos
  de 3 semanas distintas de datos de popularidad
- **THEN** el sistema indica que no hay datos suficientes para calcular la proyección

#### Scenario: Artista con caída sostenida frente a su género
- **WHEN** la proyección de un artista resulta en una caída acumulada mayor al 10% del promedio de
  su serie en el horizonte proyectado
- **THEN** el sistema incluye una señal de alerta temprana en la respuesta, indicando la pérdida
  de tracción
