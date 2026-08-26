# Tracklytics — Pendientes

> Última revisión: **Semana 16 (S16-P11)** — cierre de hallazgos residuales
> (feed sin tracks muertos, loaders shimmer restantes, sweep ErrorState,
> staff ≠ cliente free). Auditoría previa (Explore) encontró que buena parte de lo listado como
> pendiente ya estaba resuelto en código sin que este documento se hubiera actualizado
> (search-all, radio/mix con similitud real de audio, export GDPR, A9/A10/A11, loaders
> transversales, gaps de datos) — quedan tachados abajo con la evidencia. Detalles en
> `docs/BITACORA_S16.md`.

## Paridad con apps de música (S17, sesión de 4 mejoras)

Auditoría comparando contra funciones esperables de una app tipo Spotify. Cada punto se
re-verificó contra el código real antes de implementar (no se asumió el diagnóstico previo).

- [x] ~~**Notificación de lanzamiento de artista seguido**~~ — **ya existía, premisa del prompt
      era falsa**: `api/paquetes/creadores/router.py:294-300` (dentro del endpoint de
      resolución de subida de track) ya llama
      `notificaciones.crear_para_seguidores_de_artista(artist_id, "nuevo_track_artista_seguido",
      "track", str(fact_id), mensaje)` desde **S10 ronda 2** — muy anterior a esta sesión.
      El filtro de opt-out (`PREFERENCIAS_DESACTIVADAS_DE_USUARIOS`) ya se aplica dentro de esa
      función, no hace falta aplicarlo aparte. **Verificado E2E de nuevo esta sesión** (no solo
      lectura de código): cuenta `artista@demo.tracklytics.com` subió 2 tracks reales vía
      `POST /creadores/tracks` (el primero crea el `artist_id` en `DIM_ARTISTS` si no existía
      — no tenía track previo en el catálogo real); `usuario@demo.tracklytics.com` siguió ese
      `artist_id` (`POST /social/seguimiento/{id}`); superadmin aprobó el segundo track
      (`POST /creadores/admin/tracks/{subida_id}/resolver`); la campana del seguidor mostró
      "Nuevo track de Artista Demo S10: E2E Notificacion Real" en tiempo real (Playwright,
      captura verificada). **Decisión de alcance sobre el ETL masivo** (flujo de ingesta
      regular/sintética, `etl/gold/synthetic.py`): deliberadamente **no** se engancha a este
      trigger — cada corrida del DAG inserta 50k-100k filas vía `insert_df` (pandas, no fila
      por fila), en su mayoría artist_id del dataset original sin cuentas de artista reales;
      llamar la notificación por fila sería impráctico (miles de queries síncronas) y
      generaría ruido masivo sin valor real para una demo o para usuarios reales. Si en el
      futuro se necesita cubrir ese caso, debe ser un paso post-ingesta separado que agrupe
      por `artist_id` con seguidores reales, nunca dentro del loop de inserción.
- [x] ~~**Perfil público con top tracks/artistas**~~ ✅ implementado y verificado E2E —
      `GET /social/usuarios/{id}/perfil` ahora devuelve `top_tracks` (5) y `top_artistas` (3)
      de los últimos 30 días, sin recalcular RN-ANA-001 (conteo simple de reproducciones
      propias sobre `FACT_ENGAGEMENT_USUARIO`, mismo dato de origen que esa fórmula y que
      `HISTORIAL_RECIENTE`, cálculo distinto a propósito). Mismo patrón de 2 pasos que ya usa
      este endpoint para las playlists (rankear barato, enriquecer solo los ganadores vía
      `TRACKS_BY_FACT_IDS`) — da el shape `LibraryTrack` completo para reusar
      `LibraryTrackRow` en el frontend sin inventar un tipo nuevo. Privacidad: reusa el flag
      `perfil_publico` ya existente (no se creó uno aparte) — si el perfil es privado el
      endpoint entero devuelve 404 antes de calcular nada. Verificado con `curl` (cuenta
      `usuario@demo.tracklytics.com` con historial real: top tracks coincide con
      `GET /biblioteca/historial` de la misma cuenta — Sam Smith arriba con 2 reproducciones;
      perfil privado → 404 para otro visitante; el dueño sigue viendo su propio top) y en el
      navegador (Playwright, `LibraryTrackRow`/lista de artistas reales renderizados).
- [x] ~~**Filtros de búsqueda (género/año/duración)**~~ ✅ implementado y verificado E2E —
      `GET /search` acepta `genero`, `anio_desde`/`anio_hasta` (contra `DIM_ALBUMS.release_year`,
      no existe columna de año en `FACT_TRACKS`) y `duracion_min`/`duracion_max` (ms), aplicados
      solo al grupo "canciones" (género/año no tienen el mismo significado para artistas/
      álbumes/playlists en una sola llamada). `search_tracks_grupo_sql()` solo suma los JOINs a
      `DIM_GENRES`/`DIM_ALBUMS` cuando el filtro correspondiente está activo, preservando el
      camino sin filtros tal como estaba optimizado (nota PERF ya existente en el archivo).
      Frontend: mismos chips de género + panel de inputs numéricos que ya usa `CatalogPage`
      (mismo `genresList()`/`genreAccent()`, sin reinventar el selector), reflejados en la URL
      vía `useSearchParams` (bookmarkeable/compartible). Verificado con `curl` (género=pop,
      duración máxima, año desde, y combinados — todos 200 con resultados coherentes) y en el
      navegador (Playwright: chip de género activo filtra la sección Canciones a ese género,
      duración máxima recorta resultados, recargar la URL con el filtro en la query string
      restaura el valor del input).
- [x] ~~**Compartir en el reproductor principal**~~ ✅ implementado y verificado E2E — botón
      nuevo en `PlayerBarActions.tsx` (`catalogo/components/`, no en `PlayerBar.tsx` de
      `shared/` — mismo patrón de aislamiento ya usado para favoritos/agregar a playlist),
      import directo de `socialApi`/tipos desde `@packages/social/api/social.api` (nunca vía
      el barrel `@packages/social`, que arrastraría `TrackSocialPage`/`ModeracionSocialPage`
      —Recharts/moderación— al bundle principal; mismo criterio ya documentado en
      `AppShell.tsx` para `NotificationBell`/`UserMenu`/`AdBanner`). Reusa la misma llamada
      backend que `TrackSocialPage` (`socialApi.compartir`, `FACT_COMPARTICION`) pero copia al
      portapapeles la ruta real del frontend en vez del dominio simulado del backend
      (`https://tracklytics.app/...`, que no resuelve en ningún entorno real) — el objetivo
      explícito era que el enlace funcionara al abrirlo. Verificado en el navegador
      (Playwright con permisos de portapapeles): reproducir un track real, click en el botón,
      portapapeles con `http://localhost:8082/catalogo/track/47616` (HTTP 200 real), toast
      "Enlace copiado", e insert en `FACT_COMPARTICION` confirmado por query directa. Bundle
      principal: +1.26kB gzip, sin arrastrar ninguna página de `social/`.

## Dónde queda la sesión (cierre 23 ago 2026)

Todo lo cerrado está commiteado y desplegado (`docker cp` al contenedor frontend);
últimos commits: `21971eb`..`1a8945d`. **Para retomar**: levantar Docker Desktop
(`docker compose up -d` si los contenedores no arrancan solos) y continuar con el
lote siguiente en este orden:

1. **P13 — Ads con imagen + CTR por formato** (autorizado por stakeholder dentro del
   bloque dinero congelado; ver detalle en "Brechas operativas P1" abajo).
2. **P12 residual — lectura de datos de dinero ya autorizada**:
   - Churn por motivo: el backend **ya existe** (`GET /analitica/churn?por_motivo=true`,
     `analitica/router.py:522-576`); solo falta que `ChurnPage.tsx` lo consuma y muestre el
     desglose por motivo (hoy solo pinta la tasa agregada).
   - Exports CSV (`text/csv` con BOM) de regalías y finanzas, reutilizando
     `GANANCIAS_ARTISTA` y `/finanzas/reporte` (CU-O90); botón Exportar en `MisGananciasPage`
     (confirmado: no existe ningún export CSV en todo el repo hoy).
3. **P12 PDF** y **2 `ComingSoonPage`**: resueltos (25 ago 2026) — ver "Fuera de lote (S17)"
   más abajo para el detalle (quedaron implementados, no diferidos).
4. Brechas operativas P1 residuales que sí quedan (self-edit de sello — CRUD de
   partners/API keys resultó ya existir) → Lote 4.

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
- ✅ **El staff ya no se trata como Cliente B2C free (S16-P11 adenda, feedback stakeholder)**:
  superadmin/admin_* ya no ven paywall "Sección exclusiva Premium", anuncios, ni
  "Cliente B2C / Plan free" en su perfil — la causa era decidir "admin" por el `role`
  crudo de PocketBase en `usePlanActivo`, `require_active_subscription` y
  `_usuario_exento_de_ads`; todos resuelven ahora por BRIDGE (`esAdmin` /
  `roles_admin_vigentes`).

## Deuda técnica conocida

- [x] ~~SQL por interpolación en `dim_create`/`dim_update`~~ ✅ ya resuelto (auditoría de
      validación, `docs/auditoria_validacion/gestion_datos.md`) — `dim_create` usa `insert_row()`
      (protocolo nativo, sin SQL de texto) y `dim_update` usa `ALTER TABLE ... UPDATE`
      parametrizado con whitelist de columnas contra `system.columns`
      (`api/paquetes/gestion_datos/router.py:292-379`); este doc no se había actualizado.
- [ ] Nav mobile en `AnalyticaShell`/`SeguridadShell` (sin drawer bajo 768px; AppShell ya lo tiene)
- [ ] Airflow idle CPU/RAM alto
- [x] ~~Performance del core: FACT_TRACKS ordenada por genre_id~~ ✅ resuelta S16-P6/P7
      (projections p_by_fact_id/p_by_track_id + queries con IN podable)
- [ ] Queries de experiencia fuera de la ruta caliente que mantienen el patrón JOIN/scan:
      RADIO_POR_TRACK (radio de un track) y las legacy RECOMENDACIONES_POR_PERFIL_AUDIO /
      RECOMENDACIONES_POR_GENERO (hoy sin uso en el router — candidatas a borrar) —
      aplicar el mismo tratamiento SENALES+IN si se tocan
- [x] ~~2 `ComingSoonPage` en analítica (Partners, Ingestas)~~ ✅ resuelto (S17, 25 ago 2026)
      — ver detalle en "Fuera de lote (S17)" (ya no está fuera de lote, quedó implementado)
- [x] ~~Consistencia visual: ~24 páginas con query usan manejo de error local (`panelError`,
      texto plano) en vez del `ErrorState`/`EmptyState` compartidos~~ ✅ **Completamente
      resuelto (S16-P11 + S17)**: analítica (15) e ingesta (3) migradas en S16-P11; las 2
      instancias restantes (`ProyeccionGeneroPage`, `ProyeccionArtistaPage`) son mensajes de
      negocio ("datos insuficientes para proyectar"), no errores de query — ya usan `ErrorState`
      para los errores reales de query. No queda ningún `panelError` que deba migrar.

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

## Housekeeping detectado en la auditoría S17 (no funcional)

- [x] ~~`frontend/src/shared/design-system/index.ts` y `tokens.ts` son placeholders~~ ✅
      carpeta entera borrada (S17): zero referencias en código, el sistema de diseño real vive
      en CSS modules + `ThemeContext` ("Impeccable"). Verificado: `tsc --noEmit` y `npm run build`
      limpios tras el borrado.
- [x] ~~5 changes de OpenSpec de S14~~ ✅ archivados con `openspec archive` (S17):
      `2026-08-05-s14-p2-granularidad-gold`, `s14-p3-datos-reales-cuentas-rol`,
      `s14-p4-correcciones-generacion-bajo-demanda`, `2026-08-09-s14-p5-gating-admin-y-granularidad-ui`,
      `2026-08-10-s14-final-polish-bsc-roles` — todos movidos a `openspec/changes/archive/` con
      specs sincronizados. Commit atómico por cada uno.
- [x] ~~`tasks.md` de S14-Final: 2 tareas sin marcar~~ ✅ resueltas (S17):
      "Clon limpio + `npm run build`" verificado limpio; "Playwright: login real por rol..."
      quedó registrada como "verificación E2E pendiente, requiere stack levantado".
- [ ] Ningún change de S16 se registró en OpenSpec (todo el tracking de S16 vivió solo en
      `BITACORA_S16.md`/este doc) — evaluar si vale la pena retomar el flujo OpenSpec en S17
      para mantener specs/`tasks.md` sincronizados con lo shippeado.

## Ranking de mejora propuesto (post-S16 / plan S17)

1. ~~Lote rápido: loaders + gaps de datos~~ ✅ (S16-P5)
2. ~~Rediseño Biblioteca~~ ✅ (S16-P6)
3. ~~R2 analítica propia del artista~~ ✅ (S16-P9)
4. ~~A9/A10/A11 (restos de auditoría visual de Analítica)~~ ✅ ya estaban resueltos, confirmado en S16-P10
5. ~~Brechas de producto P2 + hallazgos S16 abiertos~~ ✅ (S16-P10)
6. ~~Hallazgos residuales: feed disponible=1, loaders restantes, ErrorState, staff ≠ cliente free~~ ✅ (S16-P11)

Plan S17 (definido 25 ago 2026, auditoría estática de pendientes reales vs. doc desactualizado):

7. **Lote 1 — Cierre P12 residual** ✅ implementado y **verificado E2E contra el stack real
   (S17, sesión del 25 ago 2026 con Docker levantado)**:
   - `ChurnPage.tsx`: checkbox "Desglosar por motivo" confirmado con Playwright — llama
     `?por_motivo=true`, agrega columnas `competencia`/`no_uso`/`otro`/`precio` con datos
     reales que coinciden con el `curl` directo (ej. `GET /analitica/churn?desde=2026-03-01&
     hasta=2026-08-25&por_motivo=true`). Nota aparte: `activas_al_inicio`/`tasa_churn` dan
     0/`—` en todos los meses del rango probado — no es un bug de esta sesión, es que las
     suscripciones reales en PocketBase fueron sembradas en agosto 2026 mientras
     `FACT_CANCELACION_SUSCRIPCION` está backfillado desde marzo; `contar_altas_antes_de`
     no encuentra altas previas a esos meses. Preexistente, fuera del alcance de este lote
     (el propio docstring del endpoint ya advierte la limitación, aunque en la dirección
     opuesta).
   - `GET /regalias/artista/mis-ganancias/exportar` y `/sello/mis-ganancias/exportar`:
     verificado con `curl` (cuenta `artista@demo.tracklytics.com`, BOM `EF BB BF` confirmado
     con `xxd`, `Content-Type: text/csv`, contenido idéntico al que muestra
     `MisGananciasPage`) y con el botón real "Exportar CSV" en el navegador (Playwright,
     descarga byte-a-byte idéntica al `curl`). Permisos: `usuario@demo.tracklytics.com`
     (B2C) recibe 403 en los tres endpoints de export (artista/sello/finanzas).
   - `GET /finanzas/reporte/exportar`: verificado con `curl` (BOM, dos secciones —resumen +
     gasto por categoría—, valores no vacíos).
   - Helper `api/core/csv_export.py` (`filas_a_csv_response`): funciona correctamente con
     datos; nota de borde no crítica — si `filas` viene vacío no escribe ni siquiera la fila
     de encabezados (CSV queda solo con el BOM), no se dio el caso en los datasets probados.
8. **Lote 2 — P13: Ads con imagen + CTR por formato** (mandato explícito del stakeholder).
9. **Lote 3 — Polish estructural**: nav mobile drawer en `AnalyticaShell`/`SeguridadShell`,
   sweep `ErrorState`/`EmptyState` en las páginas restantes, borrar queries de experiencia
   muertas + fix `RADIO_POR_TRACK`, housekeeping de OpenSpec/`design-system` huérfano.
10. **Lote 4 — Brechas operativas P1 residuales**: self-edit de sello (CRUD de partners/API
    keys resultó ya existir, ver corrección abajo).
11. Ver "Fuera de lote (S17)" abajo — deliberadamente no agendado todavía.

## Fuera de lote (S17) → resuelto (revisado y priorizado a pedido del stakeholder, 25 ago 2026)

Estos dos ítems se habían marcado inicialmente como diferidos (requerían una decisión de
diseño/alcance antes de tocar código) — el stakeholder pidió resolverlos primero, así que se
tomaron las decisiones de alcance (ver preguntas respondidas) y se implementaron los dos:

- [x] ~~**P12 PDF — columnas cortadas en rankings anchos**~~ ✅ resuelto — causa raíz real:
      `html2canvas` clona el DOM tal cual está pintado, así que respeta el `overflow-x: auto`
      de los wraps de tabla (`RankingTable.module.css`/`.tableScroll` en varias páginas) y solo
      captura el ancho VISIBLE, recortando columnas fuera de vista. Fix en
      `ExportPDFButton.tsx` (`ensancharOverflowHorizontal`/`anchoTotalNecesario`): antes de
      capturar, se detectan los contenedores con overflow-x real, se fuerza su `width` al
      ancho completo del contenido + `overflow-x: visible`, y se le pide a html2canvas un
      lienzo tan ancho como el punto más a la derecha de cualquier descendiente — no solo el
      ancho renderizado de `el`. Todo se revierte tras la captura. Beneficia a los 30 informes
      compuestos + 27 simples + paneles con tabla de una sola vez (un solo archivo tocado).
      **Verificado E2E (S17, sesión con Docker levantado)**: exportación real de
      `/seguridad/regalias`, `/seguridad/usuarios`, `/seguridad/publicidad` y 2 informes
      compuestos (`/reportes/comercial/suscripciones`, `/reportes/financiero/regalias`),
      PDFs inspeccionados página por página con PyMuPDF. **Bug real encontrado y corregido**:
      `windowWidth` se pasaba como el ancho que necesitaba el contenido (`anchoCaptura`, sin
      la sidebar) directo a html2canvas — que clona el DOCUMENTO COMPLETO a esa medida —, así
      que en viewports angostos (probado a 1100px) encogía la sidebar+contenido por debajo
      del ancho real y recortaba columnas que sí se veían en pantalla (los botones
      Historial/Exportar/Editar/Terminar de la tabla de regalías desaparecían del PDF pese a
      estar visibles en pantalla sin scroll). Fix: `windowWidth` ahora es `window.innerWidth`
      más solo el excedente real que necesitó el contenido, no el ancho del contenido a
      secas. Reverificado tras el fix: las 4 páginas wide-table + 2 informes compuestos
      exportan todas las columnas completas.
- [x] ~~**2 `ComingSoonPage` en analítica**~~ ✅ resueltas — decisión de alcance tomada con el
      stakeholder (ver preguntas respondidas 25 ago 2026):
      - **`/analitica/partners`** (`PartnersAnaliticaPage.tsx`): reutiliza
        `GET /app/v1/partners/metricas` (mismo dato que ya mostraba
        `/seguridad/partners/metricas`, cero backend nuevo) para rendimiento/SLA por partner, y
        agrega "cobertura de catálogo por tier" como una matriz de capacidades derivada de
        `ENDPOINTS` (`partners/api/partners.api.ts` — la misma lista que ya usa la consola de
        prueba, no una tabla inventada): Básico/Pro acceden al catálogo paginado (100
        filas/página), Enterprise además desbloquea export masivo (5.000 filas/llamada). Se
        descartó instrumentar logging real de recursos consultados por ser una migración de
        esquema + 8 endpoints, no justificada para esta demo.
      - **`/analitica/ingestas`** (`IngestasAnaliticaPage.tsx`): reutiliza
        `GET /app/v1/ingesta/cargas` (mismo endpoint que ya usa `EtlPage` como tabla
        operativa, cero backend nuevo) y agrega el valor real que faltaba: 3 gráficos de
        tendencia (small multiples, mismo patrón que `TendenciasPage`) de volumen/duración/tasa
        de rechazo a través de las últimas 20 corridas — la "comparativa inter-run" que pedía
        la descripción original del placeholder.
      - `ComingSoonPage.tsx`/`.module.css` (ya sin ningún uso) y el bypass
        `COMING_SOON_PATHS` en `AnalyticaShell.tsx` se eliminaron; ambas rutas ahora navegan
        normal (`RequireSuscripcionActiva`, admin bypassa igual que el resto del árbol) y
        aparecen en la nav real (grupos Operativo/Herramientas).
      Verificado: `tsc --noEmit` y `npm run build` limpios (chunks separados, 5.3kB/5.2kB).
      **Verificado E2E en navegador (S17, sesión con Docker levantado)**: encontrado el
      contenedor `tracklytics_frontend_react` sirviendo un `dist` de antes de estos commits
      (nunca se hizo `docker cp` tras el build — mismo patrón de brecha operativa "Frontend
      sin volumen dev" ya documentado abajo); tras rebuild + redeploy, `/analitica/partners`
      muestra las 6 tarjetas de partners reales (`GET /app/v1/partners/metricas`) y la matriz
      de cobertura por tier, y `/analitica/ingestas` muestra los 3 gráficos de tendencia con
      20 corridas reales (`GET /app/v1/ingesta/cargas`) — cero errores de consola/red en
      ambas.

## Brechas operativas identificadas (P1)

- [ ] **Frontend sin volumen dev**: `tracklytics_frontend_react` sirve el dist copiado en
      la imagen — cada cambio de UI exige build + `docker cp` al contenedor (o rebuild).
      Evaluar montar `frontend/dist` como volumen o un preview con HMR. **Mitigado (S17,
      cierre pre-demo)**: esta brecha fue justo la causa raíz de que el container sirviera
      un build de varios commits atrás durante una verificación E2E — `docker compose up -d`
      no reconstruye una imagen ya existente aunque el código cambió. `scripts/
      rebuild-frontend.sh` hace el build con el commit actual como fingerprint (`VITE_GIT_COMMIT`
      → `<meta name="build-commit">` en el HTML servido) y se autoverifica contra
      `http://localhost:8082`, fallando con mensaje claro si no coincide. README actualizado
      para que sea el paso explícito tras cada `git pull` con cambios de frontend. No resuelve
      la brecha de fondo (seguir sin HMR/volumen), pero sí el riesgo de que la mañana de la
      demo el jurado vea una versión vieja sin que nadie lo note.
- [x] ~~Ciclos de vida: pausar/reanudar/finalizar campañas y anunciantes, revocar licencias,
      terminar contratos, takedown de tracks, listado admin de suscripciones, artista
      editar/retirar su propio track aprobado~~ ✅ ya existían (change `p1-ciclos-vida`, este
      doc no se había actualizado) — evidencia: `publicidad/router.py` (pausar/reanudar/
      finalizar campaña, editar/desactivar anunciante), `distribucion/router.py:399-424`
      (`revocar_licencia`), `regalias/router.py:260-324` (`editar_contrato`/`terminar_contrato`),
      `suscripciones/router.py:490` (`GET /admin/suscripciones`), `creadores/router.py:332,386`
      (editar/retirar track propio), `catalogo/router.py:272,277` (ocultar/restaurar track admin).
      **Corrección (S17)**: el CRUD de partners/API keys que se creía pendiente **ya existe**
      — `partners/router.py` tiene DOS routers en el mismo archivo: el público de consumo
      (`/partners/v1`, líneas 232+, lo único que se había revisado) y uno interno de staff
      (`v1_router`, prefix `/app/v1/partners`, líneas 52-200) con `POST /admin` (crear),
      `GET /admin` (listar), `PATCH /admin/{partner_id}` (editar), `POST .../rotar-key`,
      `POST .../desactivar`. ~~**Sigue pendiente de verdad**: que un sello edite su propia info~~
      ✅ **Resuelto (S17)**: `PATCH /app/v1/distribucion/sello/mi-perfil` con `require_cuenta_sello`
      (gate "es dueño de este sello" en vez de `require_admin`) + `GET /sello/mi-perfil` +
      UI en `MisGananciasPage.tsx` (card colapsable "Mi perfil de sello" en la pestaña de sello).
      **Verificado E2E (S17, sesión de cierre pre-demo)**: cuenta `artista@demo.tracklytics.com`
      (vinculada a "Sello Test Retencion 2", `sello_id=1`) — `GET /distribucion/sello/mi-perfil`
      devuelve `{"sello_id":1,"nombre":"Sello Test Retencion 2","pais":"EC"}` (200); `PATCH`
      con nombre/país nuevos devuelve 200 y el `GET` posterior confirma el cambio persistido;
      revertido al valor original tras la prueba. Aislamiento por diseño (confirmado leyendo
      el código, no hace falta un ataque real): ni el `GET` ni el `PATCH` aceptan un `sello_id`
      por parámetro — `sello_id` sale siempre de `require_cuenta_sello` (derivado del token),
      así que un sello no puede editar el registro de otro aunque lo intentara. Permisos:
      `usuario@demo.tracklytics.com` (B2C, sin cuenta de sello) recibe 403 en ambos endpoints
      ("Se requiere una cuenta de sello asociada a este usuario"); sin token, 401. En el
      navegador (Playwright): login real como `artista@demo`, pestaña "Como sello" →
      "Editar" → cambio de nombre/país → "Guardar" → recarga completa de página → el cambio
      sigue visible (nombre del tab y card actualizados), cero errores de consola.
- [x] ~~Denuncias/reportes de contenido por usuarios~~ ✅ ya existía —
      `social/router.py:358-405` (`POST /denuncias` con `tipo_objeto: "track"`, valida
      existencia real del track), `:408,453` (`GET/PUT /admin/denuncias`).
- [x] ~~Bloqueo usuario-a-usuario~~ ✅ ya existía — `social/router.py:260,277,297`
      (`POST/DELETE/GET /bloqueos`).
- [x] ~~Historial de sanciones/strikes por usuario~~ ✅ ya existía —
      `seguridad/router.py:1048` (`GET /admin/usuarios/{usuario_id}/strikes`).
- [x] ~~`FACT_CANCELACION_SUSCRIPCION` (evento de churn dedicado)~~ ✅ el evento existe y
      se escribe desde los 4 flujos de suscripciones; la **vista de lectura admin YA existe
      en backend** (`analitica/router.py:522-576`, `GET /analitica/churn?por_motivo=true` +
      `CANCELACIONES_POR_MES_Y_MOTIVO`) — lo que falta de verdad es que
      `ChurnPage.tsx` (frontend) consuma `por_motivo=true`; hoy solo muestra la tasa agregada.
      Ver "P12 residual" arriba (alcance reducido: solo falta el consumo en frontend).
- [ ] **P13 — Ads con imagen (idea stakeholder, 23 ago 2026) + CTR por formato** —
      siguiente lote planificado. Alcance: campo `imagen_url Nullable(String)` en
      `DIM_CAMPANA_PUBLICITARIA` (ALTER estilo `init_clickhouse.py:1109`), validación
      condicional (solo campañas `display`) en el CRUD Pydantic de
      `publicidad/router.py`, render del banner en el overlay `AdContext`/`AdBanner`,
      y desglose de CTR por formato (audio vs display) en `ingresos_por_campana_sql`
      y `PublicidadAdminPage`.
- [x] ~~**Exportación agregada para `regalias`/`finanzas` (P12 residual)**~~ ✅ resuelto y
      verificado E2E (S17, ver "Lote 1 — Cierre P12 residual" arriba).
- [x] ~~**Vista admin de churn por motivo (P12 residual)**~~ ✅ resuelto y verificado E2E
      (S17, ver "Lote 1 — Cierre P12 residual" arriba).

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
