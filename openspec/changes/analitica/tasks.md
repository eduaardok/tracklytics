## 1. FastAPI: gating de acceso por suscripción

- [ ] 1.1 Implementar dependencia de autorización en FastAPI que reutiliza la verificación de plan activo expuesta por la capability `suscripciones` (RN-ANA-003)
- [ ] 1.2 Aplicar esta dependencia a todos los endpoints de paneles analíticos para Cliente B2B
- [ ] 1.3 Verificar que un Cliente B2B sin suscripción activa recibe error de acceso denegado en cualquier endpoint analítico (Escenario 3, CA-ANA-003)

## 2. FastAPI: dashboard ejecutivo de KPIs

- [ ] 2.1 Implementar endpoint `GET /app/v1/analitica/dashboard` que agrega total de tracks, total de artistas, total de géneros, popularidad/energy/danceability promedio desde FACT_TRACKS (RF-ANA-001)
- [ ] 2.2 Asegurar cliente ClickHouse en `threading.local` por request para los endpoints de `analitica`
- [ ] 2.3 Medir y validar que el dashboard responde en menos de 3 segundos con el volumen actual de FACT_TRACKS (RNF-ANA-001)

## 3. FastAPI: perfil de audio y comparación de artistas

- [ ] 3.1 Implementar endpoint de perfil de audio por género (`GET /app/v1/analitica/generos/{genero}/perfil`) con los 7 atributos principales (RF-ANA-002, Escenario 1, CA-ANA-001)
- [ ] 3.2 Implementar endpoint de comparación de dos artistas (`GET /app/v1/analitica/artistas/comparar`) (RF-ANA-003)
- [ ] 3.3 Implementar endpoint de benchmark de artista contra el promedio de su género, sin excluir outliers (`GET /app/v1/analitica/artistas/{id}/benchmark`) (RF-ANA-004, RN-ANA-002)

## 4. FastAPI: tendencias temporales

- [ ] 4.1 Implementar endpoint de serie temporal por `load_week` (`GET /app/v1/analitica/tendencias`) con popularidad y energy promedio por semana (RF-ANA-005)
- [ ] 4.2 Validar manejo de rango de semanas inválido o vacío sin error no controlado (CA-ANA-004)

## 5. FastAPI: engagement e índice de desempeño relativo

- [ ] 5.1 Implementar endpoint de `engagement_score` por track/artista (`GET /app/v1/analitica/engagement`) leyendo FACT_ENGAGEMENT_USUARIO (RF-ANA-006, CA-ANA-002). Fórmula: `raw_score = (reproducciones × 1) + (favoritos × 3) + (playlist_adds × 5)`; `engagement_score = MIN(100, ROUND(raw_score / max_raw_score_del_catalogo × 100))`, donde `max_raw_score_del_catalogo` es el raw_score más alto entre todos los tracks con al menos una interacción (normalización min-max), recalculado en cada ejecución del pipeline ETL que alimenta FACT_ENGAGEMENT_USUARIO
- [ ] 5.2 Implementar endpoint del índice de desempeño relativo "Mercado vs. Tracklytics" (`GET /app/v1/analitica/desempeno-relativo`) (RF-ANA-007)
- [ ] 5.3 Aplicar la regla de cálculo solo para tracks con al menos una interacción registrada, devolviendo un mensaje explícito de datos insuficientes en caso contrario (RN-ANA-001, Escenario 2)
- [ ] 5.4 Confirmar que el índice se recalcula automáticamente con cada actualización de FACT_ENGAGEMENT_USUARIO en el pipeline ETL existente, sin proceso manual adicional (RNF-ANA-003)

## 6. FastAPI: reporte diario operativo

- [ ] 6.1 Implementar endpoint de reporte diario (`GET /app/v1/analitica/reporte-diario`) que agrega suscripciones, adquisiciones e ingestas del día corriente desde sus respectivos hechos de negocio en ClickHouse (RF-ANA-008)

## 7. Frontend: paquete `analitica/`

- [ ] 7.1 Construir vista de dashboard ejecutivo con los KPIs agregados
- [ ] 7.2 Construir vista de perfil de audio por género con gráfico de radar (Plotly.js)
- [ ] 7.3 Construir vista de comparación de artistas (lado a lado) y de benchmark artista vs. género
- [ ] 7.4 Construir vista de tendencias temporales con gráfico de serie temporal por semana
- [ ] 7.5 Construir vista "Mercado vs. Tracklytics" (scatter con línea de referencia 1:1), incluyendo el mensaje de datos insuficientes cuando aplique
- [ ] 7.6 Construir vista de reporte diario operativo para Data Analyst/BI Lead
- [ ] 7.7 Asegurar que todos los gráficos mantienen proporciones legibles, sin miniaturas ilegibles ni distorsión de los datos (RNF-ANA-002)
- [ ] 7.8 Redirigir a la pantalla de suscripción cuando el backend responde acceso denegado por falta de plan activo (Escenario 3)

## 8. Verificación end-to-end

- [ ] 8.1 Verificar CA-ANA-001: un género con tracks registrados muestra su perfil de audio en menos de 3 segundos
- [ ] 8.2 Verificar CA-ANA-002: un track con interacciones de usuario calcula correctamente su engagement_score en el rango 0-100
- [ ] 8.3 Verificar CA-ANA-003: un Cliente B2B sin suscripción activa queda bloqueado de los paneles analíticos
- [ ] 8.4 Verificar CA-ANA-004: un rango de semanas válido muestra la serie temporal correspondiente sin errores
