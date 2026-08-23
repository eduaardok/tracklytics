# Tracklytics — Pendientes

> Última revisión: **Semana 16 (S16-P4/P5)** — actualizado tras las auditorías de lógica y
> visual/completitud S16 y el lote de fixes F1/F2/F7/F8/F9 + A6/A8. Las decisiones y detalles
> por prompt están en `docs/BITACORA_S16.md`.

## Estado de la sesión S16

- ✅ Fixes F1/F2/F7/F8/F9 entregados y verificados (ver bitácora S16-P4).
- ✅ Glosario técnico español con patrón `InfoHint`.
- ✅ A6 (esqueletos Monetización) y A8 (esqueletos+animaciones Analítica) cerrados.
- 🧊 **Bloque dinero F3–F6/F10–F13: CONGELADO por decisión del stakeholder** (22 ago 2026).
  No tocar hasta que se desbloquee explícitamente.
- ⏳ P12 (columnas cortadas en PDF de rankings anchos): abierto desde S16-P3, prioridad baja.

## Deuda técnica conocida

- [ ] SQL por interpolación en `dim_create`/`dim_update` (sigue sin resolver, heredado)
- [ ] Nav mobile en `AnalyticaShell`/`SeguridadShell` (sin drawer bajo 768px; AppShell ya lo tiene)
- [ ] Airflow idle CPU/RAM alto
- [ ] 2 `ComingSoonPage` en analítica (Partners, Ingestas)
- [ ] Consistencia visual: ~24 páginas con query usan manejo de error local (`panelError`,
      texto plano) en vez del `ErrorState`/`EmptyState` compartidos — bajo impacto, la
      experiencia ya no es rota; unificar cuando se toque cada página

## Hallazgos S16 abiertos (de las auditorías)

- [ ] **A9**: funnel de conversión estático → interactivo/por cohortes
- [ ] **A10**: Simulación con valores fijos → escenarios editables
- [ ] **A11**: Finanzas duplica paleta propia en vez de los tokens del design system
- [ ] **A5**: rediseño de Perfil (ranking visual #2)
- [ ] **R2**: analítica propia del artista (panel de streams/regalías propio, feature nueva)
- [ ] Loaders restantes fuera del alcance A6/A8: ingesta ×3, finanzas ×5 tabs/charts,
      partners métricas, celdas admin inline *(en curso este lote)*
- [ ] Gaps de datos que rompen realismo *(en curso este lote)*: feed con `fact_id` muertos,
      portadas de artista 404/503, cuenta `analyst@demo` sin plan ni email verificado

## Ranking de mejora propuesto (post-S16)

1. Lote rápido: consistencia de loaders transversal + gaps de datos ← **actual**
2. Rediseño Biblioteca (pantalla B2C más visitada, hoy plancha)
3. R2 analítica propia del artista
4. A9/A10/A11 (restos de auditoría visual de Analítica)
5. Aparte: P12 PDF y bloque dinero (cuando se descongele)

## Brechas operativas identificadas (P1)

- [ ] Ciclos de vida incompletos: pausar campañas, revocar licencias, terminar contratos,
      takedown de tracks, CRUD de partners/API keys, listado admin de suscripciones,
      editar/pausar/finalizar anunciantes y campañas, artista editar/retirar track aprobado,
      sello editar su propia info
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
- [ ] Preferencias de notificación (opt-out por tipo)
- [x] ~~Trial + plan estudiante~~ — trial premium (`DIAS_TRIAL_PREMIUM`) y plan `estudiante`
      existen desde S14/S15 (verificado en `PlanesPage`)
- [ ] Verificación de email en registro (simulada; hoy bloquea comentarios/planes vía
      `require_email_verificado`)
- [ ] Export de datos personales (GDPR)
