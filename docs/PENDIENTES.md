# Tracklytics — Pendientes

> Última revisión: **Semana 16 (S16-P9)** — R2 entregado: analítica propia del artista
> (endpoint `mi-analitica` + tab Analítica en el hub de creadores) y transiciones
> transversales capa 2 (reveal-on-scroll + count-up). Detalles en `docs/BITACORA_S16.md`.

## Estado de la sesión S16

- ✅ Fixes F1/F2/F7/F8/F9 entregados y verificados (ver bitácora S16-P4).
- ✅ Glosario técnico español con patrón `InfoHint`.
- ✅ A6 (esqueletos Monetización) y A8 (esqueletos+animaciones Analítica) cerrados.
- ✅ **Performance del core resuelta (S16-P6/P7)**: projections por fact_id/track_id +
  queries podables — favoritos 1.4–2.9s → ~0.2–0.4s, historial → ~0.4s.
- ✅ **Performance de experiencia resuelta (S16-P7)**: recomendaciones 10.5s → ~2–4.5s,
  mix-diario 52s → ~1.3–2s (señales en una pasada, IN podable, piso de popularidad,
  muestreo de géneros, paralelización).
- ✅ Hub Facturación ⇄ Mi plan con tabs + tarjeta de crédito visual en vivo (S16-P7).
- ✅ **S16-P8 (feedback stakeholder)**: hub invertido — Mi plan es la página principal y
  Facturación quedó acoplada como tab (`?tab=facturacion`); nav secundaria sin
  "Facturación"/"Mis ganancias" duplicadas; FormMetodoPago por bloques con validaciones
  en vivo; wizard de verificación estudiante (email .edu + comprobante); Para ti con
  arrastre tipo catálogo; Perfil con hero de identidad. Verificado con smoke completo.
- ✅ **R2 analítica propia del artista (S16-P9)**: `GET /app/v1/creadores/mi-analitica`
  (plays/likes/favoritos netos/oyentes únicos por track promovido + serie 30 días, gating
  cuenta aprobada) y tab "Analítica" en el hub de creadores con KPIs count-up, gráfico de
  área y tabla por track.
- 🧊 **Bloque dinero F3–F6/F10–F13: CONGELADO por decisión del stakeholder** (22 ago 2026).
  No tocar hasta que se desbloquee explícitamente. (El hub S16-P7/P8 solo reorganizó
  navegación/UI/validación cliente; la lógica financiera quedó intacta.)
- ⏳ P12 (columnas cortadas en PDF de rankings anchos): abierto desde S16-P3, prioridad baja.

## Deuda técnica conocida

- [ ] SQL por interpolación en `dim_create`/`dim_update` (sigue sin resolver, heredado)
- [ ] Nav mobile en `AnalyticaShell`/`SeguridadShell` (sin drawer bajo 768px; AppShell ya lo tiene)
- [ ] Airflow idle CPU/RAM alto
- [x] ~~Performance del core: FACT_TRACKS ordenada por genre_id~~ ✅ resuelta S16-P6/P7
      (projections p_by_fact_id/p_by_track_id + queries con IN podable)
- [ ] Queries de experiencia fuera de la ruta caliente que mantienen el patrón JOIN/scan:
      RADIO_POR_TRACK (radio de un track) y las legacy RECOMENDACIONES_POR_PERFIL_AUDIO /
      RECOMENDACIONES_POR_GENERO (hoy sin uso en el router — candidatas a borrar) —
      aplicar el mismo tratamiento SENALES+IN si se tocan
- [ ] 2 `ComingSoonPage` en analítica (Partners, Ingestas)
- [ ] Consistencia visual: ~24 páginas con query usan manejo de error local (`panelError`,
      texto plano) en vez del `ErrorState`/`EmptyState` compartidos — bajo impacto, la
      experiencia ya no es rota; unificar cuando se toque cada página

## Hallazgos S16 abiertos (de las auditorías)

- [ ] **A9**: funnel de conversión estático → interactivo/por cohortes
- [ ] **A10**: Simulación con valores fijos → escenarios editables
- [ ] **A11**: Finanzas duplica paleta propia en vez de los tokens del design system
- [x] ~~**A5**: rediseño de Perfil~~ ✅ (S16-P8: hero de identidad + paneles con iconos)
- [x] ~~**R2**: analítica propia del artista~~ ✅ (S16-P9: `mi-analitica` + tab en el hub)
- [ ] **Bug latente — espejo DIM_USUARIO**: usuarios creados directo en PocketBase (sin
      pasar por `/seguridad/auth/registro`) no tienen fila espejo; `EMAIL_VERIFICADO_USUARIO`
      (agregado sin GROUP BY) devuelve fila default con `email_verificado=0` y
      `require_email_verificado` los bloquea con 403 aunque nunca se verificara nada. El
      registro real de la app crea el espejo, así que solo afecta pruebas/usuarios crudos.
- [ ] Loaders restantes fuera del alcance A6/A8: ingesta ×3, finanzas ×5 tabs/charts,
      partners métricas, celdas admin inline *(en curso este lote)*
- [ ] Gaps de datos que rompen realismo *(en curso este lote)*: feed con `fact_id` muertos,
      portadas de artista 404/503, cuenta `analyst@demo` sin plan ni email verificado

## Ranking de mejora propuesto (post-S16)

1. ~~Lote rápido: loaders + gaps de datos~~ ✅ (S16-P5)
2. ~~Rediseño Biblioteca~~ ✅ (S16-P6)
3. ~~R2 analítica propia del artista~~ ✅ (S16-P9)
4. A9/A10/A11 (restos de auditoría visual de Analítica) ← **siguiente**
5. Aparte: P12 PDF y bloque dinero (cuando se descongele)

## Brechas operativas identificadas (P1)

- [ ] **Frontend sin volumen dev**: `tracklytics_frontend_react` sirve el dist copiado en
      la imagen — cada cambio de UI exige build + `docker cp` al contenedor (o rebuild).
      Evaluar montar `frontend/dist` como volumen o un preview con HMR.
- [ ] Ciclos de vida incompletos: pausar campañas, revocar licencias, terminar contratos,
      takedown de tracks, CRUD de partners/API keys, listado admin de suscripciones,
      editar/pausar/finalizar anunciantes y campañas, artista editar/retirar track aprobado,
      sello editar su propia info
- [ ] Denuncias/reportes de contenido por usuarios
- [ ] Bloqueo usuario-a-usuario
- [ ] Historial de sanciones/strikes por usuario
- [ ] `FACT_CANCELACION_SUSCRIPCION` (evento de churn dedicado)
- [ ] Diferenciación de formato de ads (audio vs. display)
- [ ] **Ads con imagen (idea stakeholder, 23 ago 2026)**: permitir que las campañas de
      publicidad carguen la URL de una imagen/banner; cuando aparezca un ad en el player,
      mostrar ese banner en vez del solo audio. Requiere: campo `imagen_url` en
      DIM_CAMPANA (o DIM_ANUNCIANTE), validación de URL en el CRUD admin, y render en el
      componente de anuncios del PlayerBar.
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
- [ ] **Comprobante de estudiante real**: el wizard S16-P8 es simulación cliente — falta
      endpoint que reciba/almacene el archivo y estado de verificación admin
- [ ] Export de datos personales (GDPR)
