# Capability: analitica

## Purpose

Proveer a Cliente B2B y Data Analyst/BI Lead un conjunto de paneles analíticos sobre el catálogo musical: dashboard ejecutivo de KPIs, perfiles de audio por género, comparación de artistas, tendencias temporales, índice de desempeño relativo (engagement propio vs. popularidad de mercado), y reporte diario operativo.

## Objetivo

Proveer a Cliente B2B y Data Analyst/BI Lead un conjunto de paneles analíticos sobre el catálogo musical: dashboard ejecutivo de KPIs, perfiles de audio por género, comparación de artistas, tendencias temporales, índice de desempeño relativo (engagement propio vs. popularidad de mercado), y reporte diario operativo.

## Contexto

Esta capability es el corazón del producto B2B: convierte el catálogo musical y los datos de comportamiento de usuarios (capability `catalogo`) en inteligencia accionable para sellos, productoras y agencias, sustentando OE4 (Inteligencia de Negocio Centralizada) y el modelo data flywheel.

## Actores

- **Cliente B2B**: consume los dashboards bajo su suscripción.
- **Data Analyst / BI Lead**: configura y supervisa los modelos analíticos.

## Tabla de trazabilidad

| Nivel empresarial | Departamento | Paquete | Caso de uso | Historia de usuario |
|---|---|---|---|---|
| Operativo | Cliente B2B / Data Analyst-BI Lead | Inteligencia de negocio y comparativa | CU-O07 Consultar dashboard ejecutivo de KPIs del catálogo | Como Cliente B2B, quiero ver un dashboard con los KPIs principales del catálogo, para evaluar tendencias del mercado de un vistazo |
| Operativo | Cliente B2B / Data Analyst-BI Lead | Inteligencia de negocio y comparativa | CU-O08 Analizar perfiles de audio por género | Como Cliente B2B, quiero ver el perfil de audio promedio de un género, para entender qué lo caracteriza musicalmente |
| Operativo | Cliente B2B / Data Analyst-BI Lead | Inteligencia de negocio y comparativa | CU-O09 Comparar artistas (A vs. B y benchmark de género) | Como Cliente B2B, quiero comparar un artista contra otro o contra el promedio del género, para posicionar mejor mis decisiones comerciales |
| Operativo | Cliente B2B / Data Analyst-BI Lead | Inteligencia de negocio y comparativa | CU-O10 Consultar tendencias temporales por semana | Como Cliente B2B, quiero ver la evolución semanal de métricas del catálogo, para detectar tendencias emergentes |
| Operativo | Cliente B2B | Inteligencia de negocio y comparativa | CU-O11 Consultar índice de desempeño relativo (mercado vs. Tracklytics) | Como Cliente B2B, quiero ver el engagement interno de mis artistas comparado con su popularidad de mercado, para identificar oportunidades de promoción diferencial |
| Operativo | Data Analyst / BI Lead | Inteligencia de negocio y comparativa | CU-O16 Generar reporte diario operativo | Como Data Analyst/BI Lead, quiero generar un reporte diario con suscripciones, adquisiciones e ingestas del día, para dar seguimiento operativo continuo |
| Operativo | Data Analyst / BI Lead | Analítica | CU-O54 Consultar adquisición de usuarios por canal | Como Data Analyst/BI Lead, quiero ver cuántos usuarios nuevos se adquieren por canal de marketing y semana, para evaluar qué canal está funcionando mejor |
| Operativo | Lead Data Engineer / CTO | Analítica | CU-O55 Consultar disponibilidad de infraestructura por componente | Como Lead Data Engineer/CTO, quiero ver el porcentaje de disponibilidad de cada componente del sistema por semana, para detectar degradaciones antes de que afecten a los usuarios |
| Operativo | Lead Data Engineer / CTO | Analítica | CU-O72 Consultar tasa de churn mensual | Como Lead Data Engineer/CTO, quiero ver la tasa de churn mensual de suscripciones, para medir la retención y actuar sobre las causas de cancelación |
| Operativo | Lead Data Engineer / CTO | Analítica | CU-O73 Consultar funnel de conversión free → premium | Como Lead Data Engineer/CTO, quiero ver cuántos usuarios free avanzan hasta suscribirse, para medir la efectividad del modelo freemium |
| Operativo | Lead Data Engineer / CTO | Analítica | CU-O74 Consultar P&L consolidado | Como Lead Data Engineer/CTO, quiero ver el margen neto consolidado del negocio, para evaluar la salud financiera del período |
| Operativo | Lead Data Engineer / CTO | Analítica | CU-O77 Consultar MRR/ARR | Como Lead Data Engineer/CTO, quiero ver el ingreso mensual recurrente actual y su proyección anual, para medir la salud del negocio de suscripción |

## Requirements

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

### Requirement: Cálculo de engagement_score
El sistema SHALL calcular y mostrar el `engagement_score` normalizado (0-100) por track/artista, a partir de favoritos, reproducciones y adiciones a playlist.

#### Scenario: Calcular engagement_score de un track con interacciones
- **WHEN** un track tiene interacciones de usuario registradas (favoritos, reproducciones o adiciones a playlist)
- **THEN** el sistema calcula su `engagement_score` normalizado en el rango 0-100

### Requirement: Índice de desempeño relativo (Mercado vs. Tracklytics)
El sistema SHALL calcular el índice de desempeño relativo (`engagement_score / popularity`) y mostrarlo en una vista comparativa "Mercado vs. Tracklytics". El índice de desempeño relativo SHALL calcularse únicamente para tracks que tienen al menos una interacción de usuario registrada (favorito, reproducción o adición a playlist), y SHALL recalcularse de forma consistente cada vez que cambian los datos de engagement subyacentes, sin requerir intervención manual.

#### Scenario: Mostrar índice de desempeño relativo de un track con engagement
- **WHEN** un Cliente B2B consulta el índice de desempeño relativo de un track que tiene al menos una interacción de usuario registrada
- **THEN** el sistema muestra el índice (`engagement_score / popularity`) en la vista "Mercado vs. Tracklytics"

#### Scenario: Consulta de índice de desempeño relativo sin datos de engagement
- **WHEN** un track no tiene ninguna interacción de usuario registrada y el Cliente B2B intenta consultar su índice de desempeño relativo
- **THEN** el sistema indica que no hay datos de engagement suficientes para calcular el índice, en lugar de mostrar un valor incorrecto o vacío sin explicación

### Requirement: Reporte diario operativo
El sistema SHALL permitir generar un reporte diario que agregue ingestas y engagement del día, con indicación explícita de los pendientes tácticos aún no implementados (suscripciones, adquisiciones). El reporte SHALL poder descargarse como PDF desde el propio navegador.

#### Scenario: Generar reporte diario operativo
- **WHEN** un Data Analyst/BI Lead solicita el reporte diario para una fecha dada
- **THEN** el sistema muestra ingestas ETL (corridas, registros leídos/insertados/rechazados) y engagement por tipo de evento del día, más un aviso de pendiente táctico para suscripciones y adquisiciones

#### Scenario: Exportar reporte a PDF
- **WHEN** el reporte ya está generado y el usuario hace clic en "Descargar PDF"
- **THEN** el navegador abre el diálogo de impresión con una vista limpia (sin sidebar ni controles), lista para guardar como PDF

### Requirement: Acceso a paneles analíticos condicionado a suscripción activa
El acceso a los paneles analíticos B2B SHALL requerir una suscripción activa (ver capability `suscripciones`); un Cliente B2B sin plan activo no puede consultar estos dashboards.

#### Scenario: Acceso sin suscripción activa
- **WHEN** un Cliente B2B sin una suscripción activa intenta acceder a cualquier panel analítico
- **THEN** el sistema le niega el acceso y lo redirige a la pantalla de suscripción

### Requirement: Legibilidad de los gráficos analíticos
Todos los gráficos SHALL mantener proporciones legibles, sin miniaturas ilegibles ni gráficos alargados que distorsionen la lectura de los datos.

#### Scenario: Gráfico mantiene proporciones legibles
- **WHEN** se renderiza cualquier gráfico de los paneles analíticos (radar, comparativo, serie temporal, scatter)
- **THEN** el gráfico mantiene proporciones legibles, sin miniaturas ilegibles ni distorsión de los datos

### Requirement: Adquisición de usuarios por canal
El sistema SHALL registrar cada alta de usuario nuevo con su canal de adquisición y región, y SHALL exponer un conteo de usuarios nuevos agrupado por canal y semana a Data Analyst/BI Lead y Lead Data Engineer/CTO.

#### Scenario: Consulta de adquisición con datos disponibles
- **WHEN** un Data Analyst/BI Lead o Lead Data Engineer/CTO con suscripción B2B activa consulta la vista de adquisición
- **THEN** el sistema devuelve el conteo de usuarios nuevos agrupado por canal de marketing y semana, cubriendo al menos las últimas semanas con datos cargados

#### Scenario: Acceso sin suscripción B2B activa
- **WHEN** un usuario sin suscripción B2B activa intenta acceder a la vista de adquisición
- **THEN** el sistema deniega el acceso con el mismo mecanismo ya usado en el resto de vistas tácticas de `analitica`

### Requirement: Disponibilidad de infraestructura por componente
El sistema SHALL registrar eventos de disponibilidad por componente de infraestructura (ej. API, ClickHouse, PocketBase, Airflow) y SHALL exponer el porcentaje de disponibilidad por componente y semana a Lead Data Engineer/CTO. Este requisito es independiente de la restricción geográfica de reproducción de contenido licenciado (`distribucion`, "Restricción de reproducción por país") — ambos conceptos no deben conflactarse en ningún artefacto ni componente de interfaz.

#### Scenario: Consulta de disponibilidad con datos disponibles
- **WHEN** un Lead Data Engineer/CTO con suscripción B2B activa consulta la vista de disponibilidad de infraestructura
- **THEN** el sistema devuelve el porcentaje de disponibilidad por componente y semana, cubriendo al menos las últimas semanas con datos cargados

#### Scenario: Acceso sin suscripción B2B activa
- **WHEN** un usuario sin suscripción B2B activa intenta acceder a la vista de disponibilidad de infraestructura
- **THEN** el sistema deniega el acceso con el mismo mecanismo ya usado en el resto de vistas tácticas de `analitica`

### Requirement: Tasa de churn mensual
El sistema SHALL permitir a un usuario con rol `admin` consultar la tasa de churn mensual de
suscripciones para un rango de fechas, calculada como cancelaciones del mes sobre suscripciones
activas al inicio del mes, agrupable opcionalmente por motivo de cancelación.

#### Scenario: Consultar la tasa de churn de un rango de meses
- **WHEN** un usuario con rol `admin` solicita la tasa de churn mensual para un rango de fechas
- **THEN** el sistema retorna, por mes, el número de cancelaciones, las suscripciones activas al inicio del mes y la tasa de churn resultante

#### Scenario: Consultar la tasa de churn agrupada por motivo
- **WHEN** un usuario con rol `admin` solicita la tasa de churn mensual indicando que desea el desglose por motivo de cancelación
- **THEN** el sistema retorna, por mes y por motivo, el número de cancelaciones correspondiente

#### Scenario: Mes sin suscripciones activas al inicio
- **WHEN** un mes del rango solicitado no tiene ninguna suscripción activa registrada al inicio de ese mes
- **THEN** el sistema retorna la tasa de churn de ese mes como no disponible, en vez de un valor calculado por división entre cero

### Requirement: Funnel de conversión free → premium
El sistema SHALL permitir a un usuario con rol `admin` consultar, para un rango de fechas, el
funnel de conversión de usuarios free: cuántos usuarios free estuvieron activos, cuántos de ellos
vieron al menos un anuncio (de tipo audio o display), y cuántos se suscribieron a un plan de pago
(premium o estudiante) dentro de ese mismo rango.

#### Scenario: Consultar el funnel de conversión de un rango de fechas
- **WHEN** un usuario con rol `admin` solicita el funnel de conversión para un rango de fechas
- **THEN** el sistema retorna el número de usuarios free activos, el número de esos usuarios que vieron al menos un anuncio, y el número de esos usuarios que se suscribieron a un plan de pago dentro del rango

#### Scenario: Rango sin ninguna conversión
- **WHEN** un usuario con rol `admin` solicita el funnel de conversión de un rango de fechas en el que ningún usuario free se suscribió a un plan de pago
- **THEN** el sistema retorna el funnel con el conteo de conversión en cero, sin error

### Requirement: P&L consolidado
El sistema SHALL permitir a un usuario con rol `admin` consultar, para un rango de fechas, el
margen neto consolidado del negocio: ingreso por suscripciones más ingreso publicitario, menos
regalías pagadas a rightsholders en ese mismo rango.

#### Scenario: Consultar el P&L consolidado de un rango de fechas
- **WHEN** un usuario con rol `admin` solicita el P&L consolidado para un rango de fechas
- **THEN** el sistema retorna el ingreso por suscripciones, el ingreso publicitario, las regalías pagadas y el margen neto resultante para ese rango

#### Scenario: Rango sin actividad de ingreso ni de regalías
- **WHEN** un usuario con rol `admin` solicita el P&L consolidado de un rango de fechas sin transacciones de suscripción, ingreso publicitario ni liquidaciones de regalías
- **THEN** el sistema retorna todos los componentes en cero y un margen neto de cero, sin error

### Requirement: MRR y ARR
El sistema SHALL permitir a un usuario con rol `admin` consultar el ingreso mensual recurrente
actual (MRR, suma del monto de todas las suscripciones de pago activas) y su proyección anual
(ARR, MRR × 12), junto con una tendencia histórica de ingreso cobrado por mes. La tendencia
histórica SHALL indicar explícitamente que aproxima el ingreso recurrente por mes cobrado, no una
reconstrucción de MRR punto-en-el-tiempo.

#### Scenario: Consultar MRR y ARR actuales
- **WHEN** un usuario con rol `admin` solicita el MRR/ARR actual
- **THEN** el sistema retorna el MRR (suma de montos de suscripciones de pago activas), el ARR (MRR × 12), y la tendencia histórica de ingreso cobrado por mes

#### Scenario: Sin ninguna suscripción de pago activa
- **WHEN** un usuario con rol `admin` solicita el MRR/ARR y no hay ninguna suscripción de pago activa
- **THEN** el sistema retorna MRR y ARR en cero, sin error

## Entradas

- Género seleccionado (perfil de audio).
- Dos artistas a comparar, o un artista + su género (benchmark).
- Rango de semanas a consultar (tendencias temporales).
- Track o artista identificado (índice de desempeño relativo).
- Fecha (reporte diario operativo).
- Rango de fechas y, opcionalmente, desglose por motivo (tasa de churn mensual, funnel de conversión, P&L consolidado).

## Salidas

- Dashboard de KPIs con valores agregados.
- Gráfico de radar de perfil de audio por género.
- Gráfico comparativo de artistas.
- Serie temporal de métricas por semana.
- Vista "Mercado vs. Tracklytics" (scatter con línea de referencia 1:1).
- Reporte diario con ingestas ETL + engagement del día, aviso de pendiente táctico para suscripciones/adquisiciones, y botón de exportación a PDF.
- Tabla de usuarios nuevos por canal de marketing y semana.
- Serie de disponibilidad por componente de infraestructura y semana.
- Tasa de churn mensual, con desglose opcional por motivo.
- Funnel de conversión free → vio anuncio → se suscribió.
- P&L consolidado (ingreso por suscripciones, ingreso publicitario, regalías pagadas, margen neto).
- MRR y ARR actuales, con tendencia histórica de ingreso cobrado por mes.

## Dependencias

- **ClickHouse**: FACT_TRACKS, DIM_ARTISTS, DIM_GENRES, DIM_DATE (modelo técnico, solo lectura).
- **FACT_ENGAGEMENT_USUARIO** (modelo de negocio) para `engagement_score` e índice de desempeño relativo.
- **FACT_ADQUISICION**, **DIM_CANAL_MARKETING**, **DIM_REGION** (modelo de negocio) para adquisición de usuarios por canal.
- **FACT_DISPONIBILIDAD**, **DIM_COMPONENTE_INFRAESTRUCTURA** (modelo de negocio) para disponibilidad de infraestructura.
- **FACT_CANCELACION_SUSCRIPCION** (capability `suscripciones`), **FACT_IMPRESION_ANUNCIO**/**FACT_INGRESO_PUBLICITARIO** (capability `publicidad`), **FACT_TRANSACCION_PAGO** (capability `facturacion`), **FACT_LIQUIDACION_REGALIA** (capability `regalias`) — para churn, funnel de conversión y P&L consolidado.
- **Capability `catalogo`**: fuente de las interacciones de usuario (favoritos, reproducciones, playlists) que alimentan el engagement.
- **Capability `suscripciones`**: gating de acceso por plan activo; también fuente de altas de suscripción (PocketBase) para churn y funnel.

## Fuera de alcance

- Modelos predictivos de Machine Learning (predicción de tendencias, churn B2B); estos pertenecen al nivel táctico/estratégico (CU-T07, CU-E05), no a esta capability operativa.
- Exportación de reportes a Excel.
- Exportación a PDF de paneles distintos al reporte diario.
- Comparación de más de dos artistas simultáneamente.
