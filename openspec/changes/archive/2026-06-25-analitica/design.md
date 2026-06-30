## Context

`analitica` es una capability de solo lectura sobre dos modelos de datos ya existentes en ClickHouse: el modelo técnico de catálogo (FACT_TRACKS, DIM_ARTISTS, DIM_GENRES, DIM_DATE) y el modelo de negocio (FACT_ENGAGEMENT_USUARIO, FACT_SUSCRIPCION, FACT_ADQUISICION, FACT_INGESTA_DATOS, entre otros). No introduce escritura de catálogo ni gestiona autenticación o suscripciones por sí misma: reutiliza dos capabilities ya implementadas:

- **`catalogo`**: es la fuente original de las interacciones de usuario (favoritos, reproducciones, playlists) persistidas en PocketBase. Esta capability no redefine esa lógica; consume el resultado ya agregado en ClickHouse (`FACT_ENGAGEMENT_USUARIO`), alimentado por el pipeline ETL ya establecido (PocketBase → Parquet → ClickHouse).
- **`suscripciones`**: es la fuente de verdad sobre si un Cliente B2B tiene un plan activo. Esta capability no reimplementa la validación de suscripción; invoca la verificación de plan activo que ya expone `suscripciones` (consulta del plan activo en PocketBase) como dependencia de autorización antes de servir cualquier panel.

## Goals / Non-Goals

**Goals:**
- Exponer un dashboard ejecutivo de KPIs agregados del catálogo.
- Exponer perfiles de audio por género, comparación de artistas (par a par y contra benchmark de género) y tendencias temporales por semana de carga.
- Calcular `engagement_score` (0-100) y el índice de desempeño relativo a partir de `FACT_ENGAGEMENT_USUARIO`.
- Exponer un reporte diario operativo agregando suscripciones, adquisiciones e ingestas del día corriente.
- Condicionar el acceso a los paneles B2B a una suscripción activa, delegando la verificación a la capability `suscripciones`.

**Non-Goals:**
- Reimplementar la captura de interacciones de usuario (eso es responsabilidad de `catalogo`).
- Reimplementar la gestión o validación de planes de suscripción (eso es responsabilidad de `suscripciones`).
- Modelos predictivos de Machine Learning, exportación a PDF/Excel, o comparación de más de dos artistas simultáneamente.

## Decisions

### Todas las consultas analíticas leen ClickHouse, nunca PocketBase directamente

Los paneles de `analitica` (KPIs, perfil de audio, comparación de artistas, tendencias, índice de desempeño, reporte diario) se construyen exclusivamente sobre tablas de ClickHouse (FACT_TRACKS y dimensiones del modelo técnico; FACT_ENGAGEMENT_USUARIO, FACT_SUSCRIPCION, FACT_ADQUISICION, FACT_INGESTA_DATOS del modelo de negocio), consistente con RT-05 (ClickHouse como única fuente analítica). La única excepción es la verificación de acceso por suscripción activa, que consulta el estado operativo en tiempo real expuesto por la capability `suscripciones` (PocketBase), no el hecho histórico `FACT_SUSCRIPCION`. Alternativa descartada: calcular KPIs o engagement directamente sobre PocketBase en tiempo de consulta — se rechaza porque PocketBase no está dimensionado para agregaciones sobre ~700k+ registros con el rendimiento exigido por RNF-ANA-001.

### engagement_score como agregación ya resuelta en FACT_ENGAGEMENT_USUARIO

El cálculo de `engagement_score` se realiza como parte de la agregación que alimenta `FACT_ENGAGEMENT_USUARIO` en ClickHouse, no en tiempo de request en FastAPI. La fórmula es: `raw_score = (reproducciones × 1) + (favoritos × 3) + (playlist_adds × 5)`, seguida de normalización min-max: `engagement_score = MIN(100, ROUND(raw_score / max_raw_score_del_catalogo × 100))`, donde `max_raw_score_del_catalogo` es el raw_score más alto entre todos los tracks con al menos una interacción registrada. Esta normalización se recalcula en cada ejecución del pipeline ETL que alimenta `FACT_ENGAGEMENT_USUARIO`. Esta capability lee el valor ya calculado para construir la vista "Mercado vs. Tracklytics". Alternativa descartada: calcular `engagement_score` on-the-fly en cada request uniendo las colecciones de PocketBase de `catalogo` — se rechaza porque viola el límite de 3 segundos de RNF-ANA-001 a escala y duplicaría lógica de agregación que ya vive en el pipeline ETL.

### Índice de desempeño relativo: solo con interacción mínima, recalculo automático

El índice (`engagement_score / popularity`) solo se calcula para tracks con al menos una interacción registrada (RN-ANA-001); para el resto, el endpoint devuelve explícitamente "datos de engagement insuficientes" en lugar de un valor 0 o nulo ambiguo (Escenario 2). El recalculo (RNF-ANA-003) ocurre automáticamente como parte de la actualización periódica de `FACT_ENGAGEMENT_USUARIO` en el pipeline ETL existente, sin intervención manual ni un proceso adicional propio de esta capability.

### Benchmark de género: promedio simple, sin exclusión de outliers

El benchmark de género (RF-ANA-004) se calcula como el promedio aritmético de todos los tracks de ese género en FACT_TRACKS, sin lógica de exclusión de outliers (RN-ANA-002), manteniendo la consulta simple y predecible en ClickHouse.

### Gating de acceso delegado a `suscripciones`

Cada endpoint de `analitica` para Cliente B2B agrega, como dependencia de autorización en FastAPI, la verificación de plan activo ya expuesta por `suscripciones` (equivalente a su endpoint de consulta de plan activo). Si no hay suscripción activa, el endpoint responde con el error de acceso denegado y el frontend redirige a la pantalla de suscripción (Escenario 3, CA-ANA-003). No se introduce una tabla ni lógica de suscripción paralela dentro de `analitica`.

### Reporte diario operativo: agregación sobre hechos de negocio del día corriente

El reporte diario (RF-ANA-008) agrega, para la fecha solicitada, filas de FACT_SUSCRIPCION (altas/cancelaciones del día), FACT_ADQUISICION e FACT_INGESTA_DATOS correspondientes al día corriente, todas ya pobladas en ClickHouse por sus respectivos pipelines. Esta capability solo lee y consolida; no genera ni modifica esos hechos.

### Decisiones tomadas durante la implementación (apply)

Estas decisiones resuelven ambigüedades del spec original frente a la restricción de arquitectura de la implementación: no hay una segunda instancia de ClickHouse, todas las queries van contra la base `tracklytics` ya existente.

- **`engagement_score` se calcula on-the-fly en ClickHouse, no en un pipeline ETL nuevo.** El texto original de este documento asumía una normalización "ya resuelta" en FACT_ENGAGEMENT_USUARIO vía un pipeline. Esa tabla no tiene una columna de score y esta capability es de solo lectura (no introduce tablas ni pipelines nuevos, ver Migration Plan). Se calcula mediante una agregación ClickHouse en cada request (`api/paquetes/analitica/queries.py::ENGAGEMENT_BY_FACT/ENGAGEMENT_BY_ARTIST`), lo que sigue siendo rápido (agregación sobre una fact table ya en ClickHouse, no joins a PocketBase) y cumple RNF-ANA-001/RNF-ANA-003 sin nueva infraestructura.
- **El término `playlist_adds × 5` de la fórmula es siempre 0 hoy.** `FACT_ENGAGEMENT_USUARIO.event_type` solo admite `favorito_add`, `favorito_remove`, `reproduccion` — no existe un evento de "adición a playlist" en el modelo de datos real. `raw_score = reproducciones×1 + favoritos_add×3`. El término queda en la fórmula para cuando exista esa fuente de datos.
- **Reporte diario operativo (RF-ANA-008) no incluye suscripciones ni adquisiciones.** FACT_SUSCRIPCION y FACT_ADQUISICION, mencionadas en este documento, no existen en el esquema ClickHouse real (`init_clickhouse.py`) ni las llena ningún pipeline desplegado. El endpoint agrega ingestas reales (`ETL_LOGS`) y actividad real de engagement (`FACT_ENGAGEMENT_USUARIO`) del día, y devuelve `suscripciones`/`adquisiciones` como `null` con una nota explícita en vez de inventar una fuente de datos inexistente.
- **Gating B2B requiere explícitamente `role=analyst` + suscripción activa, no solo "tiene una suscripción activa".** Un Cliente B2C con un plan "free" confirmado también tendría una fila `activa` en la colección `suscripciones` de PocketBase; sin el chequeo de rol, accedería a paneles B2B. `require_b2b_panel_access` exige `role=analyst` antes de verificar la suscripción; `role=admin` (Data Analyst/BI Lead) queda exento de suscripción.
- **Reporte diario es exclusivo de `role=admin`, no de cualquier suscriptor B2B.** CU-O16 lo asigna a Data Analyst/BI Lead, no a Cliente B2B; se gatea con una dependencia separada (`require_staff`) además del gating B2B general.
- **El gating se aplicó también a los endpoints `analitica` preexistentes** (sin prefijo `/app/v1/analitica`, ya usados por `app/analytics/dashboard.html`, `genres.html`, `trends.html`, `artists.html`, `compare-artists.html`), no solo a los nuevos. CA-ANA-003 exige bloquear "cualquier panel analítico"; limitar el gating a los endpoints nuevos habría dejado los paneles ya existentes sin protección. Esto requirió además agregar el header `Authorization` a esas páginas, que antes llamaban a la API sin token.

## Risks / Trade-offs

- [Riesgo] Latencia entre una interacción de usuario en `catalogo` (PocketBase) y su reflejo en `FACT_ENGAGEMENT_USUARIO` (ClickHouse) por la cadencia del pipeline ETL → Mitigación: el índice de desempeño relativo y el dashboard documentan que reflejan el estado del catálogo a la última carga, no en tiempo real; esto es consistente con el resto de paneles analíticos del proyecto.
- [Riesgo] Consultas de comparación/benchmark sobre géneros con pocos tracks pueden producir promedios poco representativos → Mitigación: no aplica exclusión de outliers por decisión explícita (RN-ANA-002); se documenta como comportamiento esperado, no como bug.
- [Riesgo] Acoplamiento a la disponibilidad de los endpoints de `suscripciones` para el gating de acceso → Mitigación: el gating se implementa como una dependencia de FastAPI claramente aislada, de forma que un cambio en `suscripciones` solo requiere actualizar esa dependencia, no la lógica de cada panel.

## Migration Plan

No aplica migración de datos: esta capability solo agrega endpoints de lectura en FastAPI y vistas nuevas en el paquete `analitica/` del frontend. No introduce tablas nuevas en ClickHouse ni en PocketBase (consume tablas y endpoints ya definidos por el modelo de datos y por las capabilities `catalogo` y `suscripciones`). Despliegue vía `docker compose up` sin pasos manuales adicionales.

## Open Questions

Ninguna pendiente: las dependencias con `catalogo` y `suscripciones` quedan resueltas por referencia explícita a sus capacidades ya implementadas, sin redefinir su lógica.
