# Tracklytics — Pendientes

> Última revisión: **Semana 16 (S16-P10)** — cierre de brechas P2 + hallazgos S16
> abiertos. Auditoría previa (Explore) encontró que buena parte de lo listado como
> pendiente ya estaba resuelto en código sin que este documento se hubiera actualizado
> (search-all, radio/mix con similitud real de audio, export GDPR, A9/A10/A11, loaders
> transversales, gaps de datos) — quedan tachados abajo con la evidencia. Lo que sí
> faltaba de verdad (preferencias de notificación, email real, comprobante de
> estudiante real, shuffle inteligente) se implementó en este lote. Detalles en
> `docs/BITACORA_S16.md`.

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
- ✅ **P2 + hallazgos S16 abiertos cerrados (S16-P10)**: A9/A10/A11 y la mayoría de P2 ya
  estaban resueltos en código (doc desactualizado); lo que faltaba de verdad —
  preferencias de notificación (opt-out), email de verificación real (SMTP/Mailpit),
  comprobante de estudiante real (subida+revisión admin) y shuffle inteligente— se
  implementó y verificó E2E. Ver bitácora S16-P10.
- ✅ **Ronda 2 de P2 con Playwright E2E (S16-P10 ronda 2)**: recomendaciones por
  co-ocurrencia ("Escuchadas por tu gente"), radio desde cards/filas/detalle, shuffle
  persistente con anti-racha, suggest as-you-type en el buscador global, "Ver más" por grupo
  en resultados, preferencias de notificación también en el perfil, dump GDPR ampliado y
  **hotfix crítico**: `PREFERENCIAS_DESACTIVADAS_DE_USUARIOS` tenía un ORDER BY con alias
  inexistente que devolvía 500 en toda creación de comentario/notificación. Ver bitácora
  S16-P10 ronda 2.
- ✅ **Hallazgos residuales cerrados (S16-P11)**: feed de seguidos ya filtra tracks no
  disponibles (`disponible=1` en ambas ramas); loaders residuales de EtlPage, Finanzas,
  admin (búsqueda/modal/historial/detalle) y PerfilPublico/Simulación con shimmer;
  `analyst@demo` verificada sana E2E; errores de query de las 15 páginas de analítica + 3 de
  ingesta migrados a `ErrorState` (mutaciones/formularios quedan como feedback de acción).
  Ver bitácora S16-P11.

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
      texto plano) en vez del `ErrorState`/`EmptyState` compartidos — **analítica (15) e
      ingesta (3) ya migradas en S16-P11**; el resto son errores de mutación/formulario
      (feedback de acción legítimo) o páginas de menor tráfico; unificar cuando se toque
      cada una

## Hallazgos S16 abiertos (de las auditorías)

- [x] ~~**A9**: funnel de conversión estático → interactivo/por cohortes~~ ✅ ya resuelto
      en código — `FunnelConversionPage.tsx` filtra por `desde`/`hasta` en vivo y renderiza
      barras proporcionales al valor real; este documento no se había actualizado.
- [x] ~~**A10**: Simulación con valores fijos → escenarios editables~~ ✅ ya resuelto —
      `SimulacionPage.tsx` tiene inputs editables (streams/suscripciones/impresiones) y un
      bloque de generación histórica con rango de fechas + checkboxes de dominio.
- [x] ~~**A11**: Finanzas duplica paleta propia en vez de los tokens del design system~~ ✅
      ya resuelto — `FinanzasPages.module.css` y los charts de `finanzas/components/charts/`
      usan exclusivamente `var(--color-*)`, sin hex/rgb hardcodeado.
- [x] ~~**A5**: rediseño de Perfil~~ ✅ (S16-P8: hero de identidad + paneles con iconos)
- [x] ~~**R2**: analítica propia del artista~~ ✅ (S16-P9: `mi-analitica` + tab en el hub)
- [x] ~~**Bug latente — espejo DIM_USUARIO**~~ ✅ (S16-P9 hotfix): `EMAIL_VERIFICADO_USUARIO`
      ahora agrupa por `usuario_id` — "sin espejo" = cero filas = fail-open (mismo criterio
      que `_rechazar_si_cuenta_inactiva`); un espejo real con `email_verificado=0` sigue
      bloqueando igual. Verificado E2E en ambas direcciones.
- [x] ~~Loaders restantes fuera del alcance A6/A8: ingesta ×3, finanzas ×5 tabs/charts,
      partners métricas, celdas admin inline~~ ✅ resuelto en S16-P5 (`2281fe4`) — confirmado
      en el árbol actual (`SkeletonTableRows`/`SkeletonChart` en los 21 archivos tocados).
- [x] ~~Gaps de datos que rompen realismo: feed con `fact_id` muertos, portadas de artista
      404/503, cuenta `analyst@demo` sin plan ni email verificado~~ ✅ resuelto en S16-P5 —
      `TrackSocialPage` distingue 404 con `EmptyState`, portadas concluidas sin fix real
      necesario (fallback ya existía), `analyst@demo` activada por `cb20550`.

## Ranking de mejora propuesto (post-S16)

1. ~~Lote rápido: loaders + gaps de datos~~ ✅ (S16-P5)
2. ~~Rediseño Biblioteca~~ ✅ (S16-P6)
3. ~~R2 analítica propia del artista~~ ✅ (S16-P9)
4. ~~A9/A10/A11 (restos de auditoría visual de Analítica)~~ ✅ ya estaban resueltos, confirmado en S16-P10
5. ~~Brechas de producto P2 + hallazgos S16 abiertos~~ ✅ (S16-P10)
6. Aparte: P12 PDF y bloque dinero (cuando se descongele) ← **queda esto**
7. Siguiente candidato natural: brechas operativas P1 (ver abajo) — ciclos de vida
   incompletos, denuncias/bloqueos, `FACT_CANCELACION_SUSCRIPCION`, ads con imagen

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

- [x] ~~Búsqueda unificada "search-all"~~ ✅ ya existía — `GET /catalogo/search`
      (tracks+artistas+álbumes+playlists en una llamada, `asyncio.gather`).
- [x] ~~Radio / Mix diario~~ ✅ ya existían — `GET /experiencia/radio/track/{fact_id}` y
      `GET /experiencia/mix-diario`. **Shuffle inteligente**: no existía, agregado en S16-P10
      — `shuffleQueue()` en `PlayerContext.tsx` (Fisher-Yates + declumping de artista
      adyacente), botón "Mezclar" en `QueuePanel`. **Shuffle persistente** (S16-P10 ronda 2):
      modo aleatorio permanente (`shuffleMode`) que avanza a un índice aleatorio con anti-racha
      por artista; botón con `aria-pressed` en el PlayerBar. **Radio en todas las superficies**
      (S16-P10 ronda 2): botón en `TrackGridCard` (overlay), `LibraryTrackRow` y hero de
      `TrackDetailPage`, todos vía `useRadio`.
- [x] ~~Recomendaciones por similitud real (hoy: exclusión + heurística)~~ ✅ ya era real —
      `RECOMENDACIONES_POR_AFINIDAD`/`RADIO_POR_TRACK`/`MIX_AFINIDAD` usan distancia
      euclidiana sobre audio features (danceability/energy/valence/acousticness/tempo).
      **Co-ocurrencia** (S16-P10 ronda 2): sección "Escuchadas por tu gente"
      (`CO_REPRODUCIDOS_DE_SEMILLAS`, tracks que comparten oyentes con tus semillas) en
      `GET /experiencia/recomendaciones`.
- [x] ~~Preferencias de notificación (opt-out por tipo)~~ ✅ S16-P10 — tabla
      `DIM_PREFERENCIA_NOTIFICACION` (opt-out: ausencia de fila = activo),
      `GET/PUT /social/notificaciones/preferencias[/{tipo}]`, `notificaciones.crear*` filtra
      antes de insertar; toggle en `NotificationBell` (ícono de engranaje). **S16-P10 ronda 2**:
      componente compartido `PreferenciasNotificacion.tsx` también como sección del perfil, y
      hotfix del ORDER BY con alias inexistente en `PREFERENCIAS_DESACTIVADAS_DE_USUARIOS`
      (`social/queries.py`) que devolvía 500 en toda creación de comentario/notificación.
- [x] ~~Trial + plan estudiante~~ — trial premium (`DIAS_TRIAL_PREMIUM`) y plan `estudiante`
      existen desde S14/S15 (verificado en `PlanesPage`)
- [x] ~~Verificación de email en registro (simulada)~~ ✅ S16-P10 — `core/email.py` (SMTP
      real vía Mailpit, `docker-compose.yml`, sin credenciales de proveedor externo) desde
      `/auth/registro` y `/auth/reenviar-verificacion`; el token sigue viajando también en
      la respuesta (conveniencia de demo). Verificado E2E: registro real → mensaje real en
      Mailpit (`GET :8025/api/v1/messages`).
- [x] ~~**Comprobante de estudiante real**~~ ✅ S16-P10 — `POST
      /suscripciones/estudiante/comprobante` (multipart, valida dominio+tamaño+extensión,
      guarda a disco vía el bind mount `./api:/app`), tabla
      `SOLICITUD_VERIFICACION_ESTUDIANTE`, `GET .../mi-solicitud`,
      `GET/PATCH /suscripciones/admin/estudiante/solicitudes[...]` (aprobar/rechazar,
      `admin_comercial`). Sección nueva en `AdminSuscripcionesPage`. No cambia la
      elegibilidad del checkout (sigue autoservida por dominio de email) — es un canal
      auditable aparte. Verificado E2E con curl (subida → archivo real en disco → admin
      aprueba).
- [x] ~~Export de datos personales (GDPR)~~ ✅ ya existía — `api/paquetes/seguridad/
      exportacion.py` + `GET .../exportar-mis-datos` (volcado JSON: perfil, pagos,
      favoritos, playlists, historial, comentarios, seguimientos, tickets, denuncias,
      bloqueos). **S16-P10 ronda 2**: agrega `notificaciones` (últimas 200) y
      `preferencias_notificacion`.
- [x] ~~Búsqueda: sugerencias as-you-type y resultados ampliados~~ ✅ S16-P10 ronda 2 —
      dropdown de sugerencias en el buscador global (`GlobalSearch.tsx`, debounce 250ms sobre
      `/search`, combobox ARIA) y `?grupo=` en `/buscar` para ampliar un grupo a 20
      ("Ver más" por sección).
