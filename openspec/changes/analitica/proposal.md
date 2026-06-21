## Why

Esta capability es el corazón del producto B2B: convierte el catálogo musical y los datos de comportamiento de usuarios (capability `catalogo`) en inteligencia accionable para sellos, productoras y agencias, sustentando OE4 (Inteligencia de Negocio Centralizada) y el modelo data flywheel.

## What Changes

- Dashboard ejecutivo con KPIs agregados del catálogo (total tracks, total artistas, total géneros, popularidad/energy/danceability promedio) en una sola pantalla.
- Perfil de audio por género como gráfico de radar con los 7 atributos principales.
- Comparación lado a lado de dos artistas y comparación de un artista contra el promedio (benchmark) de su género.
- Serie temporal de evolución de popularidad y energy promedio por semana de carga (`load_week`).
- Cálculo de `engagement_score` normalizado (0-100) por track/artista a partir de favoritos, reproducciones y adiciones a playlist.
- Índice de desempeño relativo (`engagement_score / popularity`) en vista comparativa "Mercado vs. Tracklytics".
- Reporte diario operativo que agrega suscripciones, adquisiciones e ingestas del día corriente.
- Control de acceso a los paneles analíticos B2B condicionado a una suscripción activa.

## Capabilities

### New Capabilities
- `analitica`: dashboards y paneles analíticos sobre el catálogo musical y el engagement de usuarios para Cliente B2B y Data Analyst/BI Lead (KPIs ejecutivos, perfil de audio por género, comparación de artistas, tendencias temporales, índice de desempeño relativo, reporte diario operativo).

### Modified Capabilities
(ninguna; no se modifican requisitos de las capabilities `catalogo` o `suscripciones` — esta capability solo las consume)

## Impact

- **ClickHouse**: lectura de FACT_TRACKS, DIM_ARTISTS, DIM_GENRES, DIM_DATE (modelo técnico) y de FACT_ENGAGEMENT_USUARIO (modelo de negocio) para `engagement_score` e índice de desempeño relativo.
- **Capability `catalogo`**: fuente de las interacciones de usuario (favoritos, reproducciones, playlists) que alimentan el engagement; no se redefine su lógica aquí.
- **Capability `suscripciones`**: gating de acceso a los paneles analíticos B2B según plan activo; no se redefine su lógica aquí.
- **FastAPI**: nuevos endpoints de dashboards, comparativas, tendencias, índice de desempeño y reporte diario.
- **Frontend**: paquete funcional `analitica/` con dashboards interactivos (Plotly.js).
