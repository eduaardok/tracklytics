## 1. FastAPI: gating de acceso por suscripción

- [x] 1.1 Implementar dependencia de autorización en FastAPI que reutiliza la verificación de plan activo expuesta por la capability `suscripciones` (RN-ANA-003) — `api/paquetes/analitica/deps.py::require_b2b_panel_access` (reutiliza `paquetes.suscripciones.pb_client.list_activas`; staff `role=admin` queda exento, Cliente B2B `role=analyst` requiere suscripción activa)
- [x] 1.2 Aplicar esta dependencia a todos los endpoints de paneles analíticos para Cliente B2B — aplicada a nivel de router tanto en los endpoints legacy (`router`) como en los nuevos `/app/v1/analitica/*` (`v1_router`)
- [x] 1.3 Verificar que un Cliente B2B sin suscripción activa recibe error de acceso denegado en cualquier endpoint analítico (Escenario 3, CA-ANA-003) — verificado con curl (403) en dashboard, legacy `/dashboard/executive` y `/genres/trends`

## 2. FastAPI: dashboard ejecutivo de KPIs

- [x] 2.1 Implementar endpoint `GET /app/v1/analitica/dashboard` que agrega total de tracks, total de artistas, total de géneros, popularidad/energy/danceability promedio desde FACT_TRACKS (RF-ANA-001)
- [x] 2.2 Asegurar cliente ClickHouse en `threading.local` por request para los endpoints de `analitica` — ya cubierto por `core/database.py::get_client()`, compartido por todo el paquete
- [x] 2.3 Medir y validar que el dashboard responde en menos de 3 segundos con el volumen actual de FACT_TRACKS (RNF-ANA-001) — verificado con curl sobre 713,550 tracks reales, respuesta inmediata (agregados escalares en ClickHouse)

## 3. FastAPI: perfil de audio y comparación de artistas

- [x] 3.1 Implementar endpoint de perfil de audio por género (`GET /app/v1/analitica/generos/{genero}/perfil`) con los 7 atributos principales (RF-ANA-002, Escenario 1, CA-ANA-001)
- [x] 3.2 Implementar endpoint de comparación de dos artistas (`GET /app/v1/analitica/artistas/comparar`) (RF-ANA-003)
- [x] 3.3 Implementar endpoint de benchmark de artista contra el promedio de su género, sin excluir outliers (`GET /app/v1/analitica/artistas/{id}/benchmark`) (RF-ANA-004, RN-ANA-002) — benchmark calculado contra el género predominante del artista (el de mayor cantidad de tracks)

## 4. FastAPI: tendencias temporales

- [x] 4.1 Implementar endpoint de serie temporal por `load_week` (`GET /app/v1/analitica/tendencias`) con popularidad y energy promedio por semana (RF-ANA-005)
- [x] 4.2 Validar manejo de rango de semanas inválido o vacío sin error no controlado (CA-ANA-004) — `semana_desde > semana_hasta` devuelve 422 controlado; rango vacío devuelve `data: []`

## 5. FastAPI: engagement e índice de desempeño relativo

- [x] 5.1 Implementar endpoint de `engagement_score` por track/artista (`GET /app/v1/analitica/engagement`) leyendo FACT_ENGAGEMENT_USUARIO (RF-ANA-006, CA-ANA-002). **Desviación de diseño documentada**: FACT_ENGAGEMENT_USUARIO no tiene un evento de tipo "adición a playlist" (`event_type` solo admite `favorito_add`, `favorito_remove`, `reproduccion`), por lo que el término `playlist_adds × 5` de la fórmula es siempre 0 hoy. `raw_score = reproducciones×1 + favoritos_add×3`. El cálculo se hace on-the-fly vía agregación ClickHouse (no precomputado en un pipeline ETL nuevo) para no introducir infraestructura adicional, ver design.md de la implementación.
- [x] 5.2 Implementar endpoint del índice de desempeño relativo "Mercado vs. Tracklytics" (`GET /app/v1/analitica/desempeno-relativo`) (RF-ANA-007)
- [x] 5.3 Aplicar la regla de cálculo solo para tracks con al menos una interacción registrada, devolviendo un mensaje explícito de datos insuficientes en caso contrario (RN-ANA-001, Escenario 2) — verificado con curl (`suficiente: false`)
- [x] 5.4 Confirmar que el índice se recalcula automáticamente con cada actualización de FACT_ENGAGEMENT_USUARIO (RNF-ANA-003) — al calcularse on-the-fly contra FACT_ENGAGEMENT_USUARIO en cada request, siempre refleja el estado más reciente de la tabla sin proceso manual adicional

## 6. FastAPI: reporte diario operativo

- [x] 6.1 Implementar endpoint de reporte diario (`GET /app/v1/analitica/reporte-diario`) (RF-ANA-008). **Desviación de diseño documentada**: FACT_SUSCRIPCION y FACT_ADQUISICION no existen en el esquema ClickHouse actual (no las crea ningún pipeline desplegado) y la restricción de arquitectura de esta implementación prohíbe acoplar una fuente de datos nueva. El reporte agrega ingestas reales desde `ETL_LOGS` y actividad real desde `FACT_ENGAGEMENT_USUARIO`; los campos `suscripciones` y `adquisiciones` se devuelven explícitamente como `null` con una `nota` aclaratoria, en vez de inventar datos. Endpoint exclusivo de staff (`role=admin`, Data Analyst/BI Lead) vía `require_staff`.

## 7. Frontend: paquete `analitica/`

- [x] 7.1 Construir vista de dashboard ejecutivo con los KPIs agregados — ya existía (`app/analytics/dashboard.html`), se le agregó envío de token y manejo de 403
- [x] 7.2 Construir vista de perfil de audio por género con gráfico de radar (Plotly.js) — ya existía (`app/analytics/genres.html`)
- [x] 7.3 Construir vista de comparación de artistas (lado a lado) y de benchmark artista vs. género — comparación ya existía (`app/analytics/compare-artists.html`); benchmark vs. género es nuevo (`app/analytics/benchmark.html`)
- [x] 7.4 Construir vista de tendencias temporales con gráfico de serie temporal por semana — ya existía (`app/analytics/trends.html`)
- [x] 7.5 Construir vista "Mercado vs. Tracklytics" (scatter con línea de referencia 1:1), incluyendo el mensaje de datos insuficientes cuando aplique — nuevo (`app/analytics/mercado-vs-tracklytics.html`)
- [x] 7.6 Construir vista de reporte diario operativo para Data Analyst/BI Lead — nuevo (`app/analytics/reporte-diario.html`), restringido a `role=admin` en cliente y servidor
- [x] 7.7 Asegurar que todos los gráficos mantienen proporciones legibles, sin miniaturas ilegibles ni distorsión de los datos (RNF-ANA-002) — reutiliza `.chart-container` con `min-height` consistente con el resto del paquete `analytics/`
- [x] 7.8 Redirigir a la pantalla de suscripción cuando el backend responde acceso denegado por falta de plan activo (Escenario 3) — todas las páginas de `analytics/` redirigen a `/autenticacion/planes.html` ante un 403

## 8. Verificación end-to-end

- [x] 8.1 Verificar CA-ANA-001: un género con tracks registrados muestra su perfil de audio en menos de 3 segundos — verificado con curl (genre_id=1, respuesta inmediata)
- [x] 8.2 Verificar CA-ANA-002: un track con interacciones de usuario calcula correctamente su engagement_score en el rango 0-100 — verificado con curl (fact_id=350150 → engagement_score 67.0)
- [x] 8.3 Verificar CA-ANA-003: un Cliente B2B sin suscripción activa queda bloqueado de los paneles analíticos — verificado con curl (403 en todos los endpoints de `analitica`, legacy y v1)
- [x] 8.4 Verificar CA-ANA-004: un rango de semanas válido muestra la serie temporal correspondiente sin errores — verificado con curl (`semana_desde=1&semana_hasta=3`)
