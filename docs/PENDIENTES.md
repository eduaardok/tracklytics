# Tracklytics — Pendientes

> Última revisión: Semana 11 (S11)

## Deuda técnica conocida

- [ ] SQL por interpolación en `dim_create`/`dim_update` (sigue sin resolver)
- [ ] Consistencia visual: ~9 archivos sin `ErrorState`/`EmptyState` unificado
- [ ] Nav mobile en `AnalyticaShell`/`SeguridadShell` (sin drawer bajo 768px)
- [ ] Airflow idle CPU/RAM alto
- [ ] 2 `ComingSoonPage` en analítica (Partners, Ingestas)

## Brechas operativas identificadas (P1)

- [ ] Ciclos de vida incompletos: pausar campañas, revocar licencias, terminar contratos, takedown de tracks, CRUD de partners/API keys, listado admin de suscripciones, editar/pausar/finalizar anunciantes y campañas, artista editar/retirar track aprobado, sello editar su propia info
- [ ] Denuncias/reportes de contenido por usuarios
- [ ] Bloqueo usuario-a-usuario
- [ ] Historial de sanciones/strikes por usuario
- [ ] `FACT_CANCELACION_SUSCRIPCION` (evento de churn dedicado)
- [ ] Diferenciación de formato de ads (audio vs. display)
- [ ] Exportación agregada para `regalias`/`finanzas`

## Brechas de producto (P2)

- [ ] Búsqueda unificada "search-all"
- [ ] Radio / Mix diario / shuffle inteligente
- [ ] Recomendaciones por similitud real (hoy: exclusión + heurística)
- [ ] Trial + plan estudiante
- [ ] Preferencias de notificación (opt-out por tipo)
- [ ] Verificación de email en registro (simulada)
- [ ] Export de datos personales (GDPR)
