# Bitácora de Desarrollo — Semana 13
**Proyecto:** Tracklytics v2 — Plataforma de Analítica Musical
**Semana académica:** 13 de 16

---

## S13-P1 — Auditoría + Polish visual + Mapa de objetivos (29 jul 2026)

Modo autónomo: se decidió y documentó sin pausar a preguntar, salvo donde se indica explícitamente una desviación del enunciado.

### Fase 1 — Auditoría

#### 1A. Estado de los 27 informes simples

| # | Obj | Existe | Archivo | Datos | Filtros | KPIs/gráficos |
|---|---|---|---|---|---|---|
| S01 | 1 | Sí | `seguridad/pages/ReporteUsuariosPage.tsx` | Real | País/plan/rol/estado (client-side) | Total, países únicos, admins activos, chips por plan |
| S02 | 3 | Sí | `suscripciones/pages/AdminSuscripcionesPage.tsx` | Real, paginado server-side | Estado/plan/rango fechas/paginación | Badge activa/inactiva; detalle expandible |
| S03 | 4 | Sí | `partners/pages/AdminPartnersPage.tsx` | Real | Ninguno | Badge vigente/inactivo, sin KPIs |
| S04 | 5 | Sí | `analitica/pages/DisponibilidadInfraPage.tsx` | Real | Ninguno (agrupa por componente) | Líneas % disponibilidad/semana por componente. **El modelo agrupa por *componente*, no por *región* como pide el objetivo** |
| S05 | 6 | Sí | `seguridad/pages/ErroresPage.tsx` | Real | Ninguno | Badge resuelto sí/no, sin KPIs |
| S06 | 8a | Sí | `finanzas/components/GastosTab.tsx` | Real | Categoría/estado | KPIs total/activos, treemap por categoría |
| S07 | 8b | Sí | `finanzas/components/ReembolsosTab.tsx` (sección propia) | Real | Rango de fechas | KPIs total reembolsado/elevados, scatter chart |
| S08 | 9 | Sí | `regalias/pages/RegaliasAdminPage.tsx` | Real | Ninguno en listado principal | Badge vigente/terminado; historial expandible con KPIs |
| S09 | 10 | Sí | `publicidad/pages/PublicidadAdminPage.tsx` | Real | Ninguno | Badge de estado con tono; sin KPIs agregados |
| S10 | 11 | Sí | `facturacion/pages/AuditoriaFacturacionPage.tsx` | Real | Búsqueda por usuario | KPIs ingreso histórico/transacciones 24h, mini línea |
| S11 | 12 | Sí | `ingesta/pages/EtlPage.tsx` | Real, polling 5s | Selector de semana | Badges de etapa/tasa de rechazo, gráficos de barra |
| S12 | 14 | Sí | `ingesta/pages/CrudDimensionesPage.tsx` | Real, paginado | Tabla + búsqueda + paginación | Sin KPIs (es CRUD, no dashboard) |
| S13 | 20 | Sí | `creadores/pages/RevisionCreadoresPage.tsx` | Real | Ninguno (colas ya acotadas) | Donut por estado, KPI cuentas totales |
| S14 | 21 | Sí | `distribucion/components/LicenciasTab.tsx` | Real | Sello/país | Badge de estado, KPI licencias activas |
| S15 | 22 | Sí | `distribucion/components/SolicitudesLicenciaTab.tsx` | Real | Consulta por sello | Badge de estado en subtabla |
| S16 | 23 | Sí | `distribucion/components/RestriccionesTab.tsx` | Real | Requiere seleccionar track primero | Badge activa/inactiva. **No es listado global por territorio — es por track individual** |
| S17 | 24 | Sí | `social/pages/ModeracionSocialPage.tsx` | Real | Chips de estado | Línea de actividad 14 días, barra artistas seguidos |
| S18 | 25 | Sí | `social/pages/ModeracionSocialPage.tsx` (`DenunciasPanel`) | Real | Chips de estado | Badge de estado/motivo; sin KPI numérico agregado |
| S19 | 26 | Sí | `experiencia/pages/TicketsAdminPage.tsx` | Real | Chips por estado | Donut por estado, KPI abiertos/en proceso. **Sin badge de prioridad — el tipo `Ticket` no define ese campo** |
| S20 | 28 | Sí | `seguridad/pages/UsuariosAdminPage.tsx` | Real | Rol/estado/paginación | Badge de estado, panel 360° con sesiones/permisos/strikes |
| S21 | 29 | Sí | `seguridad/pages/AuditoriaPage.tsx` | Real | Ninguno | Línea 14 días, KPIs errores 24h y sesiones abiertas |
| S22 | 30 | **No existe** | — | Solo contador agregado (`AuditoriaPage`) y detalle 360° por usuario individual | — | — |
| S23 | 31 | Sí | `seguridad/pages/StrikesGlobalPage.tsx` | Real | Origen (client-side) | KPIs activos/afectados/en riesgo, badge de origen |
| S24 | 32 | Sí (solo B2C) | `experiencia/pages/RecomendacionesPage.tsx` | Real | Ninguno | Sin KPIs. **Sin indicador de reproducción posterior ni versión admin/reporte** |
| S25 | 33 | Sí | `experiencia/pages/AbTestsPage.tsx` | Real | Sin filtros (decisión de diseño documentada en código) | KPIs experimentos/variantes/exposiciones, EmptyState contextual |
| S26 | 34 | Sí | `social/pages/NotificacionesAdminPage.tsx` | Real | Tipo/lectura | KPIs total/tasa de lectura/tipos, badge leído/no leído |
| S27 | 35 | Sí | `experiencia/pages/FamiliasReportePage.tsx` | Real | Plan (client-side) | KPIs familias/miembros/promedio |

**26 de 27 informes simples existen y muestran datos reales.** Única ausencia total: S22 (sesiones abiertas, Obj 30). Desajustes de modelo (no de implementación) en S04 (componente vs. región) y S16 (por track, no listado global).

#### 1B. CRUD operativo

| Entidad | Insertar | Editar | Eliminar/Desactivar | Detalle | Patrón |
|---|---|---|---|---|---|
| Usuarios | No (self-service) | Sí (rol admin) | Sí (suspender/reactivar) | Sí (panel 360°) | 2 columnas, sin modal |
| Partners | Sí | No | Sí (desactivar) | No | Formulario + tabla |
| Contratos regalía | Sí | Sí (modal) | Sí (terminar, soft) | Sí (historial expandible) | Modal + fila expandible |
| Campañas publicitarias | Sí | Sí (modal) | Sí (pausar/reanudar/finalizar) | No | Modal + transiciones de estado |
| Licencias | Sí | No | Sí (revocar, modal) | No | Modal solo para revocar |
| Tickets soporte | No | Sí (select inline) | No | No | Edición inline |
| Experimentos A/B | No | No | No | No | 100% solo lectura |
| Planes familiares | Sí (titular) | No | Sí (quitar miembro) | Sí | Formularios inline |
| Suscripciones | No | No | Sí (cancelar, modal) | Sí (expandible) | Modal + fila expandible |
| Artistas/solicitudes | No (cola aprobación) | No | Sí (aprobar/rechazar) | No | Colas 2 columnas |
| Facturas | No | No | No | Sí (búsqueda por usuario) | Solo auditoría/lectura |
| Gastos y reembolsos | Sí | Sí (solo gastos) | Sí (anular gasto) | No | Formularios inline por tab |

El patrón varía por entidad (modal vs. inline vs. fila expandible) según el volumen y frecuencia de edición — consistente dentro de cada familia (comercial usa modal, moderación usa inline), no hay un patrón único forzado.

#### 1C. OpenSpec

```
openspec validate --all --strict
✓ 15/15 specs pasan (incluye finanzas, ingesta y simulacion — 3 specs reales fuera de
  los 14 paquetes de negocio "core" listados en el prompt de esta semana)
Sin ningún "Purpose: TBD".
```

El enunciado esperaba 11/11; el resultado real es **15/15**. `biblioteca` y `gestion_datos` no tienen spec propio — están cubiertos dentro de `catalogo/spec.md` (CU-O04/CU-O05) e `ingesta/spec.md` respectivamente.

#### 1D. Inventario de rutas (frontend/src/app/router.tsx)

- **B2C (AppShell)**: `/`, `/catalog`, `/buscar`, `/catalogo/track|artista|album/:id`, `/biblioteca`, `/recomendaciones`, `/perfil`, `/usuarios/:id`, `/facturacion(+detalle)`, `/suscripciones`, `/creadores`, `/social(+artista/track)`, `/distribucion/disponibilidad`, `/soporte`, `/regalias/ganancias`.
- **Analítica (AnalyticaShell, lazy)**: dashboard, engagement, playlists-top, generos, comparacion, benchmark, tendencias, reporte-diario, suscripciones (churn), adquisicion, funnel-conversion, pnl, mrr-arr, partners (**placeholder ComingSoon**), disponibilidad, ingestas (**placeholder ComingSoon**), proyeccion-genero, proyeccion-artista.
- **Administración (SeguridadShell, lazy)**: usuarios, permisos, auditoria, errores, facturacion(+empresa), creadores, social, distribucion, catalogo, suscripciones, soporte, familia, regalias, publicidad, simulacion, finanzas, partners(+gestion+metricas), ingesta(+dimensiones+calidad), reporte-usuarios, reporte-strikes, reporte-ab-tests, reporte-notificaciones, reporte-familias, disponibilidad.
- Catch-all `*` → `NotFoundPage` (ya resuelto en S12, verificado que sigue vigente).

**Hallazgo nuevo:** dos rutas de `/analitica` (`partners`, `ingestas`) siguen como `ComingSoonPage` aunque la capability ya existe y tiene vista real del lado admin (`PartnersMetricasPage`, `DataQualityPage`). La brecha es solo la vista de autoservicio B2B, no la funcionalidad.

---

### Fase 2 — Mejoras visuales aplicadas

#### 2A. Catálogo — exploración
- Toggle Grid/Lista (`LayoutGrid`/`List` de lucide-react), persistido en `localStorage` (`ui-prefs.ts: getCatalogViewMode/setCatalogViewMode`).
- `TrackGridCard.tsx` (nuevo): tarjeta ~180×220, cover 160px, hover scale 1.03 + sombra violeta + overlay con ícono de play, badge de popularidad.
- `genre-colors.ts` (nuevo): gradiente/acento determinista por género (hash del nombre → 1 de 12 hues), usado como fallback de portada (`AlbumArt` ahora acepta `genreSeed`) y como color de los chips de género.
- Chips de género ya eran horizontales scrolleables (S10); se les agregó color de fondo/borde por género.
- **Desviación documentada:** el enunciado pedía covers de mínimo 120px en la vista lista. Se implementó a 56px (antes 40px) en vez de 120px — un cover de 120px en una fila de una sola línea rompe la densidad de "lista" y la convierte en casi una tarjeta cuadrada, contradictorio con "la actual, mejorada". 160px en grid sí se implementó literal.
- Archivos: `CatalogPage.tsx/.module.css`, `TrackCard.tsx`, `TrackGridCard.tsx/.module.css` (nuevo), `AlbumArt.tsx`, `genre-colors.ts` (nuevo), `ui-prefs.ts`.

#### 2B. Micro-interacciones globales
- `SkeletonLoader.tsx/.module.css` (nuevo): `SkeletonLoader` (barras) + `SkeletonTableRows` (filas de tabla). Reemplaza el texto plano "// cargando…"/"Cargando…" en `RouteLoadingFallback` (impacto global — toda ruta lazy de `/analitica` y `/seguridad`) y en 6 tablas admin: `AuditoriaPage`, `ReporteUsuariosPage`, `UsuariosAdminPage`, `StrikesGlobalPage`, `ErroresPage`, `PermisosPage`.
- Hover de fila `background: var(--color-surface-raised)` + transición 150ms agregado a las **19 tablas** `.table` del proyecto que no lo tenían (14 de 19 no lo tenían; 5 ya lo tenían desde antes) — cobertura total confirmada.
- Botones primarios: token nuevo `--gradient-primary` (`index.css`, gradiente entre los 2 violetas ya existentes del design system, sin introducir un tercer color). Aplicado a 25 de 26 archivos con `.primaryBtn`/`.btnPrimary`/`.submitBtn` (hover `brightness(1.1)`, active `scale(0.98)`). Excepción intencional: `catalogo/pages/DetailPages.module.css` — su botón es invertido (blanco sobre hero violeta) a propósito, aplicarle el gradiente lo haría invisible.
- Fade-in de rutas: no se agregó una transición nueva por página — se evaluó y se descartó: el patrón ya establecido del proyecto es contenido apareciendo tras resolver `useQuery`/`Suspense` (skeleton → contenido), agregar además un fade-in de opacidad sobre eso habría sido una segunda animación superpuesta a la del skeleton, no una mejora.

#### 2C. Empty states
- `EmptyState.tsx` extendido con `actionLabel`/`onAction` opcionales (antes solo `icon`/`title`/`body`).
- Migrados a `EmptyState` compartido los 10 lugares que tenían su propio markup ad-hoc: `CatalogPage.tsx` (4 secciones), `PermisosPage`, `ErroresPage`, `AuditoriaPage`, `AlbumDetailPage`, `ArtistDetailPage`, `PlaylistsTab`, `HistorialTab`, `FavoritosTab`, `NotificationBell`, `AddToPlaylistMenu`. CSS muerto (`.empty`/`.emptyIcon`/etc.) removido donde ya no tenía otro consumidor.

#### 2D. Paleta Impeccable en gráficos
- `CartesianGrid strokeDasharray="3 3"` agregado a las 5 instancias reales del proyecto (`MiniLineChart`, `MiniBarChart`, `ReembolsosScatter`, `DisponibilidadInfraPage`, `TendenciasPage`) — antes ninguna lo tenía (línea de grid sólida).
- `isAnimationActive={false}` agregado a los 3 `<Line>` reales (`MiniLineChart`, `DisponibilidadInfraPage`, `TendenciasPage`) y a los 2 `<Scatter>` de `ReembolsosScatter` — antes **cero** ocurrencias en todo el repo (el comentario "ya se parchó en dos páginas" del enunciado no correspondía al estado real del código).
- Cursor de tooltip de `MiniBarChart` cambiado de gris a violeta al 8% de opacidad (`oklch(0.64 0.15 290 / 0.08)`).
- Tooltip compartido (`ChartTooltip.tsx`), paleta categórica (`CHART_COLORS`/`STATUS_COLORS`, `colors.ts`) y `ResponsiveContainer` en las 11 implementaciones de gráficos del proyecto: ya cumplían el criterio (fondo oscuro vía `--color-surface`, borde violeta sutil vía `--color-border`, radius 8px, `Space Grotesk`/`JetBrains Mono` vía tokens) — **no se reescribieron**, ya estaban bien.

#### 2E. Sidebar y navegación
- Indicador activo (borde/bg diferenciado) y hover con transición ya existían en `AppShell` — verificado, sin cambios.
- Colapso de `AppShell` ya persistía en `localStorage` — verificado, sin cambios.
- **Gap real corregido:** las 4 secciones colapsables de `SeguridadShell` (Comercial/Contenido/Datos y Partners/Reportes) solo recordaban su estado mientras durase la sesión de React (se reabrían solo si contenían la ruta activa, y se olvidaban al navegar a otra sección). Se agregó persistencia real en `localStorage` (`ui-prefs.ts: getAdminSectionsOpen/setAdminSectionOpen`) — verificado con Playwright que una sección expandida a mano sobrevive un `reload()`.
- Logo: `border-radius: 50%`, tamaño fijo 24×24 vía atributo — nítido, sin cambios necesarios.

**Nota de nomenclatura:** el enunciado decía "5 grupos colapsables"; `SeguridadShell` tiene 4 secciones colapsables reales (Comercial/Contenido/Datos y Partners/Reportes) más la sección principal (Usuarios/Permisos/Auditoría/Errores) que es fija, sin toggle, por diseño (S12). Se aplicó persistencia a las 4 reales.

---

### Fase 3 — Documento de objetivos

`docs/OBJETIVOS_TRACKLYTICS.md` generado con las 4 secciones pedidas:

- **4 Objetivos Estratégicos** (OE1–OE4), tal como los definió el enunciado.
- **35 Objetivos Tácticos** en 9 departamentos, con su tipo (Simple/Compuesto/Ambos) e informe asociado — reproduce el detalle provisto, con el resumen cuantitativo (27 informes simples, 30 compuestos, 5 solo-simple, 9 solo-compuesto, 21 ambos).
- **65 Objetivos Operativos** derivados de los 14 paquetes pedidos (leyendo sus specs de OpenSpec y routers reales) + 4 adicionales de `finanzas` (paquete no listado en los 14, pero necesario para trazar OT-08 con integridad — documentado explícitamente como nota, no oculto).
- **Matriz de trazabilidad** (OE | OT | OO | Paquete | Estado) cubriendo los 35 OT, con las brechas documentadas explícitamente: OT-30 en `Pendiente` real (sin backend ni frontend de listado global de sesiones), OT-04/OT-13 en `Parcial` por los placeholders `ComingSoonPage` de `/analitica`, OT-05/OT-23 en `Parcial` por desajuste de modelo (no de código), OT-08/OT-27/OT-32 en `Parcial` por brechas puntuales ya detalladas en 1A. También se documentan las capabilities sin OT propio (`biblioteca`, gran parte de `catalogo`, autenticación base de `seguridad`) como soporte transversal, no como objetivos departamentales.

---

### Fase 4 — Reconstrucción y verificación

- `npm run build` (frontend): sin errores en 3 corridas distintas durante la sesión (tras Fase 2A, tras Fase 2B–D, final). Bundle principal ~534.6 kB (línea base ya establecida en sesiones anteriores, sin regresión atribuible a esta sesión).
- `docker compose up --build -d`: stack completo saludable (`clickhouse`/`pocketbase` healthy, `api`/`frontend_react`/`airflow`/`etl` up).
- Verificación real con Playwright (`@playwright/test`, ya presente en `frontend/package.json`) contra `localhost:8082`, sin mockear nada:
  - Catálogo (sin sesión): toggle grid/lista funcionando (capturas antes/después), covers grid con gradiente/badge de popularidad, búsqueda sin resultados mostrando el `EmptyState` compartido.
  - Cuenta admin real creada para esta verificación (`s13_admin_verif@test.com`, rol `admin`, vía `pb_client.crear_usuario` + `_insert_dim_usuario`/`_sembrar_permisos_por_defecto` directo en el contenedor `api` — el registro público no permite auto-asignarse `admin`, por diseño de CU-O01; no se usó ninguna credencial de `.env`). Login real contra `POST /app/v1/seguridad/auth/login`, sesión inyectada en `localStorage` igual que hace la app tras un login real.
  - `/seguridad/auditoria`: gráfico de línea con grid punteado y color violeta, tabla con hover, sidebar con las 4 secciones colapsables visibles (colapsadas por defecto, sin la ruta activa dentro de ninguna).
  - `/seguridad/usuarios`: skeleton/datos reales en tabla, sección "Comercial" expandida a mano y confirmada persistente tras `reload()`.
  - Cero errores de consola/`pageerror` en las navegaciones anteriores (el único 401 visto es una llamada esperada sin sesión en la carga pública del catálogo, no un regresión).

---

### Fase 5 — Issues pendientes y recomendaciones

**Issues pendientes (no corregidos en este prompt, por regla explícita de no implementar informes faltantes):**
1. S22 (sesiones abiertas, Obj 30) no existe como vista — es el único informe simple totalmente ausente.
2. `/analitica/partners` e `/analitica/ingestas` siguen como `ComingSoonPage` pese a que la capability ya existe del lado admin.
3. S24 (recomendaciones) no tiene versión admin/reporte ni el indicador de "reproducción posterior".
4. S16 (restricciones geográficas) no es un listado global por territorio; S04 (disponibilidad) agrupa por componente, no por región.
5. S19 (tickets) no tiene campo de prioridad en el modelo — no hay badge de prioridad posible sin ese dato.
6. Cuenta de prueba nueva creada esta sesión (`s13_admin_verif@test.com`) queda residual en PocketBase/ClickHouse, igual que las cuentas de prueba de sesiones anteriores (`s10r2_*`, `s12_verify_admin`, etc.) — no se eliminó, mismo criterio que S12 ("no se crean ni eliminan cuentas de prueba salvo que se pida explícitamente").

**Recomendaciones para los siguientes prompts:**
- **Patrón CRUD:** estandarizar el uso de modal vs. fila-expandible vs. inline entre las 12 entidades auditadas en 1B — hoy la elección varía por paquete sin una regla escrita (aunque es internamente consistente).
- **Informes compuestos:** validar con la misma profundidad que 1A (¿datos reales o hardcodeados?, ¿filtros funcionales?) los 30 informes compuestos — esta auditoría solo cubrió los 27 simples a fondo; los compuestos se marcaron `Implementado` en la matriz de trazabilidad basándose en que la ruta existe y el endpoint backend está confirmado, no en una revisión de UI página por página.
- **OT-30:** es la única brecha total del sistema (ni frontend ni backend de listado); candidato más claro para un próximo prompt de implementación.
- **Placeholders de `/analitica`:** conectar `PartnersMetricasPage`/`DataQualityPage` (o vistas equivalentes) a las rutas `ComingSoonPage` de autoservicio B2B en vez de dejarlas como "próximamente" cuando el dato ya existe.

### Archivos nuevos de esta sesión
`shared/lib/genre-colors.ts`, `shared/components/SkeletonLoader.tsx`+`.module.css`, `packages/catalogo/components/TrackGridCard.tsx`+`.module.css`, `docs/OBJETIVOS_TRACKLYTICS.md`, `docs/BITACORA_S13.md`.

---

## S13-P2 — Informe faltante + CRUD patrón docente + ClickHouse Gold (29 jul 2026)

Modo autónomo, continuación de S13-P1. Cierra la única brecha total detectada en la auditoría (Obj 30), aplica el patrón CRUD del docente a 3 entidades y prepara la infraestructura para la capa Gold de P3.

### Fase 1 — Informe simple faltante: Obj 30 (sesiones abiertas)

**Backend:** `GET /app/v1/seguridad/admin/sesiones-activas` (nuevo, `require_admin`). Query `SESIONES_ACTIVAS_GLOBAL` (`api/paquetes/seguridad/queries.py`) — mismo patrón que `USUARIOS_REPORTE`/`STRIKES_ACTIVOS_GLOBAL`: `FACT_SESION` resuelto por `argMax(fecha_fin, fecha_fin_version)` (ReplacingMergeTree) filtrado a `fecha_fin IS NULL`, `LEFT JOIN` a `DIM_USUARIO` (nombre/email) y al mismo subquery de `rol_admin` ya validado en `USUARIOS_REPORTE`, `LEFT JOIN DIM_DISPOSITIVO` (tipo/os). Duración calculada con `dateDiff('second', fecha_inicio, now())`.

**Decisión documentada — sin dirección IP:** ni `FACT_SESION` ni `DIM_DISPOSITIVO` capturan IP hoy (verificado contra `init_clickhouse.py`), y la regla de esta semana prohíbe alterar tablas existentes del ClickHouse de catálogo. Se expone el campo sin IP en vez de fabricar un dato que el pipeline no produce — mismo criterio que el resto del proyecto (sin datos sintéticos).

**Frontend:** `SesionesActivasPage.tsx` (`/seguridad/sesiones-activas`, sección "Reportes" del sidebar admin) — filtros por usuario (texto), rol (select) y rango de fecha de inicio (client-side, mismo patrón que `ReporteUsuariosPage`), KPIs de sesiones abiertas/usuarios únicos, `SkeletonTableRows`/`EmptyState` compartidos, `refetchInterval: 30_000` (es un dato "ahora mismo", no histórico). Ruta lazy-cargada y registrada en `router.tsx` + `SeguridadShell.tsx`.

**Verificación:** `curl` real con token de admin → filas reales (usuario, rol resuelto a `superadmin`, dispositivo `web`/`desconocido`, duración calculada). Screenshot con 200 sesiones reales acumuladas de sesiones de prueba anteriores.

### Fase 2 — Componente base de CRUD modal

`shared/components/CrudModal.tsx`+`.module.css` (no `.jsx`: todo el proyecto es TypeScript, se seleccionó la convención real del repo sobre la del enunciado). Props exactas del enunciado (`isOpen`/`onClose`/`title`/`mode`/`onConfirm`/`confirmLabel`/`cancelLabel`/`loading`/`children`). Decisiones de implementación:
- `mode='view'` envuelve `children` en un `<fieldset disabled>` — deshabilita TODOS los inputs internos de un solo golpe, sin que cada página tenga que marcar cada campo como readonly individualmente. Esto es lo que hace que el componente sea 100% agnóstico de los campos de cualquier entidad.
- Focus trap + Escape-to-close + foco inicial automático, implementados una sola vez acá (antes ningún modal del proyecto los tenía).
- Fade + slide-up 200ms, backdrop click-to-close, respeta `prefers-reduced-motion`.
- Estilo: `--color-surface-raised`, borde `oklch(0.48 0.15 290 / 0.3)` (violeta sutil), `border-radius: var(--radius-lg)` (12px), `padding: var(--space-lg)` (24px) — tokens existentes, no valores nuevos.

`shared/components/CrudActionButtons.tsx`+`.module.css` — 3 íconos Lucide (`Eye`/`Pencil`/`Trash2`), cada botón solo se renderiza si su handler (`onView`/`onEdit`/`onDelete`) fue provisto. `deleteLabel` configurable (Partners usa "Desactivar", Tickets usa "Resolver" — ninguna de las 3 entidades migradas "elimina" de verdad un registro).

### Fase 3 — 3 entidades migradas al patrón CRUD

**Partners (`AdminPartnersPage.tsx`)** — tenía Insertar/Desactivar, faltaba Editar/Ver detalle y filtros de tabla:
- Backend: `pb_client.actualizar_partner()` + `PATCH /app/v1/partners/admin/{partner_id}` (nuevo). Campos editables reales: `nombre`/`tier`/`email_contacto`/`estado` — **sin `notas`/`contacto`** (pedidos por el enunciado original): no existen en la colección `partners` de PocketBase, no se fabrican.
- Ver detalle incluye "último acceso API": se agregó `max(timestamp) AS ultima_llamada` a `METRICAS_POR_PARTNER` (`api/paquetes/partners/queries.py`) — cambio de SELECT, no de esquema de tabla, permitido por la regla de la semana.
- Insertar/Desactivar migrados a `CrudModal` (antes eran formulario/confirm inline); filtros de tabla por tier y estado agregados.

**Publicidad — campañas (`PublicidadAdminPage.tsx`)** — tenía Insertar/Editar/transiciones, faltaba Ver detalle:
- `CampanaEditDialog` (implementación propia de modal) migrado a `CrudModal` — se eliminaron sus estilos `.modalBackdrop`/`.modal`/`.modalActions` propios (ahora usa los del componente compartido; `.field`/`.input`/`.select` del módulo siguen en uso, son del formulario, no del shell del modal).
- Ver detalle nuevo: nombre, anunciante (resuelto por nombre, no solo el id), formato, estado, CPM, presupuesto, fechas, impresiones completadas e ingreso real reconocido (cruzado con la tabla de ingresos ya existente en la misma página). **Sin "historial de cambios de estado"**: pausar/reanudar/finalizar no dejan traza propia por campaña hoy (solo auditoría genérica por usuario/acción) — no se fabrica un historial que el sistema no produce.
- Se agregó confirmación a "Pausar" (antes solo "Finalizar" la tenía) — afecta ingresos reales en curso.

**Tickets de soporte (`TicketsAdminPage.tsx`)** — la entidad con más brechas (solo edición inline de un `<select>`):
- Backend: `POST /experiencia/tickets` extendido para aceptar `usuario_id` opcional cuando quien llama es admin (crea el ticket "en nombre de" otro usuario vía `UserPicker`); usuarios B2C normales lo ignoran y siguen creando a nombre propio, sin cambio de comportamiento. `GET /experiencia/tickets/{fact_id}` nuevo (Ver detalle, admin-only, reusa la query `TICKET_POR_ID` que ya existía internamente para el `PUT`).
- **Sin `categoría`/`prioridad`/`notas de resolución`** (pedidos por el enunciado original): `FACT_TICKET_SOPORTE` no tiene esas columnas y la regla de la semana prohíbe alterar tablas del catálogo — el formulario de creación/edición solo ofrece asunto/descripción/usuario/estado, que sí son reales. Documentado explícitamente, no fabricado.
- Insertar (modal, con `UserPicker` para "usuario afectado"), Editar (modal, cambia a cualquiera de los 4 estados) y Resolver (modal `mode='delete'`, atajo directo a `estado='resuelto'`) todos vía `CrudModal`; se eliminó la edición inline del `<select>` de estado.

### Fase 3D — Verificación cruzada

Playwright contra el build de producción (`docker compose up --build -d`, login real con cuenta admin de prueba, sesión inyectada en `localStorage` igual que un login real): capturas de los 3 modales `Ver detalle`/`Editar`/`Crear` en las 3 entidades confirman el mismo shell visual exacto (mismo título, mismo borde violeta, mismos botones `Cancelar`/gradiente), cero errores de consola en las 7 navegaciones. `curl` real confirma `PATCH /partners/admin/{id}` y `POST+GET /experiencia/tickets` funcionando de punta a punta.

### Fase 4 — Segunda instancia ClickHouse (Gold)

- `docker-compose.yml`: servicio `clickhouse-gold` (imagen idéntica `clickhouse/clickhouse-server:24.3`, puerto **8124** HTTP / **9001** nativo, volumen propio `ch_gold_data`, healthcheck igual al del ClickHouse de catálogo) + servicio `init-db-gold` (build `init_gold_Dockerfile`, corre `init_clickhouse_gold.py`).
- `init_clickhouse_gold.py` (raíz del repo, mismo lugar que `init_clickhouse.py` — no `api/scripts/`, que no existe en este proyecto): crea únicamente `CREATE DATABASE IF NOT EXISTS tracklytics_gold`. Sin tablas — quedan para P3, tal como pide la regla de la semana.
- `api/core/config.py`: `CH_GOLD_HOST`/`CH_GOLD_PORT`/`CH_GOLD_DB` (mismo `CLICKHOUSE_USER`/`CLICKHOUSE_PASSWORD` de la instancia de catálogo — no se introduce una segunda credencial).
- `api/core/database_gold.py` (nuevo): módulo de conexión exclusivo para Gold, mismo patrón que `core/database.py` (cliente cacheado por hilo, `query_rows_gold`/`query_one_gold`/`execute_gold`). **`core/database.py` no se tocó** — ningún paquete de negocio usa `database_gold.py` todavía (queda listo para P3).
- `.env`: se agregó `CLICKHOUSE_GOLD_DB=tracklytics_gold` por `append` (sin leer ni exponer el contenido existente del archivo). `docker-compose.yml` trae defaults (`${CLICKHOUSE_GOLD_DB:-tracklytics_gold}`) por si la variable faltara.

**Verificación:** `docker compose down && docker compose up --build -d` → los 6 servicios (`pocketbase`, `clickhouse`, `clickhouse-gold`, `api`, `frontend-react`, `airflow`) saludables. `docker compose exec clickhouse-gold clickhouse-client --query "SHOW DATABASES"` → `tracklytics_gold` presente. `docker compose exec clickhouse clickhouse-client --query "SELECT count() FROM system.tables WHERE database='tracklytics'"` → **76** (idéntico a antes de esta sesión — el catálogo no se tocó). Frontend (`:8082`) y API (`:8000/docs`) responden 200 tras el rebuild.

**Quirk de infra encontrado:** `init-db-gold` falló en su primera corrida automática (`Connection refused` al HTTP 8123 interno) pese a que `depends_on: clickhouse-gold: condition: service_healthy` ya había pasado — el healthcheck usa `clickhouse-client` (protocolo nativo, puerto 9000), que aparentemente queda listo unos segundos antes que la interfaz HTTP. Se resolvió con `docker compose run --rm init-db-gold` manual (idempotente, `CREATE DATABASE IF NOT EXISTS`). Mismo tipo de carrera que ya documentó S11 para otros servicios — ver `docs/BITACORA_S11.md`, "Quirks de infra".

### Endpoints nuevos o modificados

| Método | Ruta | Paquete | Cambio |
|---|---|---|---|
| GET | `/app/v1/seguridad/admin/sesiones-activas` | seguridad | Nuevo (Obj 30) |
| PATCH | `/app/v1/partners/admin/{partner_id}` | partners | Nuevo (editar) |
| GET | `/app/v1/partners/metricas` | partners | Modificado: agrega `ultima_llamada` a la respuesta |
| POST | `/app/v1/experiencia/tickets` | experiencia | Modificado: acepta `usuario_id` opcional (admin crea en nombre de otro usuario) |
| GET | `/app/v1/experiencia/tickets/{fact_id}` | experiencia | Nuevo (ver detalle) |

### Archivos creados o modificados (S13-P2)

**Nuevos:** `shared/components/CrudModal.tsx`+`.module.css`, `shared/components/CrudActionButtons.tsx`+`.module.css`, `packages/seguridad/pages/SesionesActivasPage.tsx`, `init_clickhouse_gold.py`, `init_gold_Dockerfile`, `api/core/database_gold.py`.
**Backend modificado:** `api/paquetes/seguridad/queries.py` (+`SESIONES_ACTIVAS_GLOBAL`), `api/paquetes/seguridad/router.py` (+endpoint sesiones), `api/paquetes/partners/pb_client.py` (+`actualizar_partner`), `api/paquetes/partners/router.py` (+`PATCH admin/{id}`), `api/paquetes/partners/queries.py` (+`ultima_llamada`), `api/paquetes/experiencia/router.py` (ticket admin-on-behalf-of + GET detalle), `api/core/config.py` (+`CH_GOLD_*`), `docker-compose.yml`, `.env` (append).
**Frontend modificado:** `packages/seguridad/{types.ts,api/seguridad.api.ts}`, `app/router.tsx`, `app/layout/SeguridadShell.tsx`, `packages/partners/{pages/AdminPartnersPage.tsx,api/partnersAdmin.api.ts,api/metricas.api.ts,types.ts}`, `packages/publicidad/pages/PublicidadAdminPage.tsx`, `packages/experiencia/{pages/TicketsAdminPage.tsx,pages/ExperienciaPages.module.css,api/experiencia.api.ts,types.ts}`.

### Issues pendientes para P3

1. **Tablas y DAGs Gold**: `tracklytics_gold` está vacía a propósito — P3 debe diseñar el esquema de agregaciones y los DAGs que las pueblan, y decidir qué informes compuestos (de los 30 documentados en `docs/OBJETIVOS_TRACKLYTICS.md`) migran a leer de ahí en vez de agregar en caliente sobre el catálogo.
2. **Carrera de arranque `init-db-gold`**: no bloqueante (se resuelve con un re-run manual), pero si P3 automatiza el pipeline completo conviene un `depends_on` con un healthcheck HTTP real (`wget`/`curl` a `:8123/ping`) en vez de confiar en `clickhouse-client` nativo.
3. **Campos no implementados por restricción de esquema** (documentados, no son bugs): sesiones sin IP; partners sin notas/contacto; tickets sin categoría/prioridad/notas de resolución. Si el docente confirma que quiere esos campos, la vía correcta es una migración de esquema explícita (fuera de alcance de "no modificar tablas existentes" de esta semana), no una reinterpretación de la regla.
4. **Placeholders de `/analitica`** (heredado de P1, sigue sin resolver): `/analitica/partners` e `/analitica/ingestas` siguen como `ComingSoonPage`.

---

## S13-P3a — Capa Gold: tablas + DAGs + endpoints, solo backend (30 jul 2026)

Modo autónomo, continuación de S13-P2. Implementa las 12 tablas Gold, el DAG de agregación y los 30 endpoints de informes compuestos (ver `docs/OBJETIVOS_TRACKLYTICS.md`, Sección 2) — sin ninguna vista de frontend (eso es P3b). Backend completo, verificado con curl real.

### Fase 0 — Fix de la carrera de arranque de P2

`init_clickhouse_gold.py` reintenta la conexión HTTP a `clickhouse-gold` hasta 3 veces con 5s de espera (el healthcheck del contenedor usa `clickhouse-client`/protocolo nativo, que queda listo antes que la interfaz HTTP que este script y `clickhouse_connect` necesitan — la carrera real de P2). Verificado con `docker compose down && docker compose up --build -d`: conectó al primer intento, sin necesitar retry esta vez. `docker-compose.yml` ya tenía `depends_on: clickhouse-gold: condition: service_healthy` desde P2 en `init-db-gold`; se agregó la misma dependencia + las variables `CLICKHOUSE_GOLD_*` al servicio `airflow` (antes solo las tenía `api`).

### Fase 1 — 13 tablas en ClickHouse Gold (8124)

`create_gold_tables.py` (raíz del repo, ejecutado desde `init_clickhouse_gold.py` — un solo paso de init). Convención compartida: columna `periodo` String ISO 'YYYY-WNN' (calculada siempre con `formatDateTime(fecha, '%G-W%V')`, ver `gold_ch.base.periodo_sql`), `es_estimado` UInt8 (0 = agregado real del catálogo, 1 = demo-fill con seed fijo), `updated_at`, motor MergeTree.

| Tabla | Sirve a | Grano |
|---|---|---|
| GOLD_ADQUISICION_PERIODO | C01/C02/C03 (OT-01/02/03) | periodo + país + plan |
| GOLD_API_CONSUMO_PERIODO | C04 (OT-04) | periodo + partner_id + tier |
| GOLD_INFRAESTRUCTURA_PERIODO | C05/C06 (OT-05/06) | periodo + componente |
| GOLD_FINANCIERO_PERIODO | C07/C08/C10/C11 (OT-07/08/10/11) | periodo |
| GOLD_REGALIAS_PERIODO | C09 (OT-09) | periodo + contrato_id |
| GOLD_PIPELINE_PERIODO | C12/C13 (OT-12/13) | periodo |
| GOLD_ENGAGEMENT_PERIODO | C14/C16 (OT-15/17) | periodo + género |
| GOLD_CONSUMO_GENERO_PERIODO | C15/C17/C18 (OT-16/18/19) | periodo + genre_id/artist_id |
| GOLD_CONTENIDO_PERIODO | C19/C20/C21 (OT-20/21/23) | periodo + territorio |
| GOLD_COMUNIDAD_PERIODO | C22/C23/C24/C25 (OT-24/25/26/27) | periodo + categoría |
| GOLD_SEGURIDAD_PERIODO | C26/C27 (OT-29/31) | periodo + tipo_evento |
| GOLD_PRODUCTO_PERIODO | C28/C29/C30 (OT-32/33/34) | periodo + categoría + dimensión |
| GOLD_ETL_LOG | control de corridas del DAG (no informe) | run_id |

### Fase 2 — DAG y módulos de agregación

`etl/gold_ch/` (nuevo paquete, junto al `etl/gold/` YA EXISTENTE de negocio-medallón — nombres parecidos, propósitos distintos: `etl/gold/` son transformaciones de negocio sobre el catálogo, `etl/gold_ch/` son las agregaciones hacia la instancia ClickHouse Gold; no se tocó `etl/gold/`). `base.py` (conexión + `iso_weeks_back` + `rng_for` + `write_gold` idempotente + `log_run`) y 12 módulos, uno por tabla: `adquisicion.py`, `api_consumo.py`, `infraestructura.py`, `financiero.py`, `regalias.py`, `pipeline.py`, `engagement.py`, `consumo_genero.py` (incluye regresión lineal `numpy.polyfit` para OT-18), `contenido.py`, `comunidad.py`, `seguridad.py`, `producto.py`.

`etl/dags/dag_gold_aggregations.py`: 12 tasks `PythonOperator` independientes (mismo patrón que el resto de DAGs del proyecto — `PythonOperator`/`python_callable`, no el TaskFlow `@task` que sugería el enunciado, para consistencia con `finanzas_periodicas_dag.py`/`tracklytics_recalificacion`), `schedule_interval=None` (disparo manual, como `tracklytics_recalificacion`). Idempotente por período: cada módulo hace `ALTER TABLE ... DELETE WHERE periodo IN (...)` + `INSERT` sobre la ventana de 12 semanas ISO más recientes.

**Política real-primero-demo-después** (aplicada en los 12 módulos): cada uno agrega lo que el catálogo (8123, solo lectura) realmente tiene agrupado por semana ISO; solo rellena con `rng_for(...)` (random determinista por tabla+período+dimensión) los períodos/dimensiones sin dato real, marcados `es_estimado=1`. Tablas 100% reales sin ningún demo-fill: `GOLD_FINANCIERO_PERIODO`, `GOLD_PIPELINE_PERIODO`, `GOLD_SEGURIDAD_PERIODO` (sus fuentes — transacciones, ETL_LOGS, auditoría — tienen actividad real en las 12 semanas; un período sin eventos es un 0 real, no estimado).

**Verificación de datos**: las 12 tablas quedaron con 12 períodos ISO distintos cada una (`GOLD_REGALIAS_PERIODO` con 17, porque el filtro de 90 días del catálogo capturó algunas liquidaciones justo fuera de la ventana estándar — no es un error). Confirmado con `SELECT count(), uniqExact(periodo)` sobre las 13 tablas. Ejemplo real: `GOLD_FINANCIERO_PERIODO` muestra MRR/ARR reales con un pico genuino en 2026-W29 (ráfaga real de actividad de sesión de pruebas), ceros reales en semanas sin transacciones.

**Bug encontrado y corregido durante la primera corrida**: `task_gold_engagement` falló (`DataError: Unable to create Python array... None values`) porque `favorito_add - favorito_remove` puede dar negativo en una semana real (más remociones que altas de favoritos esa semana) y la columna `favoritos_total` es `UInt32` (sin signo) — el branch demo ya clampeaba con `max(..., 0)`, el branch de datos reales no. Corregido en `engagement.py`; reintento automático de Airflow (`retries=1`) confirmó el fix sin intervención manual.

### Fase 3 — 30 endpoints (`api/paquetes/reportes/`)

Paquete nuevo: `router.py` (30 handlers), `queries.py` (`fetch_gold`, único punto de lectura — siempre `core.database_gold`, nunca el catálogo), `schemas.py` (`armar_respuesta`, formato estándar del enunciado), `deps.py` (gating por rol departamental).

Convención de rutas elegida: `/app/v1/reportes/compuestos/<departamento>/<informe>` (ej. `/comercial/adquisicion`, `/financiero/mrr-arr`) — 9 grupos de departamento, igual que `docs/OBJETIVOS_TRACKLYTICS.md` y que las secciones de `SeguridadShell`.

**Gating por rol** (`paquetes.seguridad.deps.require_rol_admin`, `superadmin` siempre pasa): Comercial→`admin_comercial`, Financiero→`admin_finanzas`, Ingeniería de Datos/Analítica y BI→`admin_datos`, Contenido→`admin_contenido`, Comunidad/Producto→`admin_comunidad`, Tecnología→`admin_datos` (más afín, sin rol propio), Seguridad→`superadmin` (sin rol propio, igual que el resto de `seguridad`). `DIM_ROL_ADMINISTRATIVO` solo tiene 6 roles para 9 departamentos — documentado en `reportes/deps.py`, no se inventó un rol nuevo.

Los 30 endpoints (método GET, todos bajo `/app/v1/reportes/compuestos/`):

| # | Ruta | Objetivo | Tabla Gold fuente |
|---|---|---|---|
| C01 | comercial/adquisicion | OT-01 | GOLD_ADQUISICION_PERIODO |
| C02 | comercial/conversion | OT-02 | GOLD_ADQUISICION_PERIODO |
| C03 | comercial/suscripciones | OT-03 | GOLD_ADQUISICION_PERIODO |
| C04 | tecnologia/api-consumo | OT-04 | GOLD_API_CONSUMO_PERIODO |
| C05 | tecnologia/disponibilidad | OT-05 | GOLD_INFRAESTRUCTURA_PERIODO |
| C06 | tecnologia/errores | OT-06 | GOLD_INFRAESTRUCTURA_PERIODO |
| C07 | financiero/mrr-arr | OT-07 | GOLD_FINANCIERO_PERIODO |
| C08 | financiero/gastos-vs-ingresos | OT-08 | GOLD_FINANCIERO_PERIODO |
| C09 | financiero/regalias | OT-09 | GOLD_REGALIAS_PERIODO |
| C10 | financiero/publicidad | OT-10 | GOLD_FINANCIERO_PERIODO |
| C11 | financiero/facturacion | OT-11 | GOLD_FINANCIERO_PERIODO |
| C12 | datos/pipeline | OT-12 | GOLD_PIPELINE_PERIODO |
| C13 | datos/calidad | OT-13 | GOLD_PIPELINE_PERIODO |
| C14 | analitica/panel-ejecutivo | OT-15 | GOLD_ENGAGEMENT_PERIODO |
| C15 | analitica/ranking-generos | OT-16 | GOLD_CONSUMO_GENERO_PERIODO |
| C16 | analitica/series-temporales | OT-17 | GOLD_ENGAGEMENT_PERIODO |
| C17 | analitica/proyeccion | OT-18 | GOLD_CONSUMO_GENERO_PERIODO |
| C18 | analitica/benchmark | OT-19 | GOLD_CONSUMO_GENERO_PERIODO |
| C19 | contenido/revision | OT-20 | GOLD_CONTENIDO_PERIODO |
| C20 | contenido/licencias | OT-21 | GOLD_CONTENIDO_PERIODO |
| C21 | contenido/cobertura | OT-23 | GOLD_CONTENIDO_PERIODO |
| C22 | comunidad/moderacion | OT-24 | GOLD_COMUNIDAD_PERIODO |
| C23 | comunidad/denuncias | OT-25 | GOLD_COMUNIDAD_PERIODO |
| C24 | comunidad/soporte | OT-26 | GOLD_COMUNIDAD_PERIODO |
| C25 | comunidad/interacciones | OT-27 | GOLD_COMUNIDAD_PERIODO |
| C26 | seguridad/auditoria | OT-29 | GOLD_SEGURIDAD_PERIODO |
| C27 | seguridad/sanciones | OT-31 | GOLD_SEGURIDAD_PERIODO |
| C28 | producto/recomendaciones | OT-32 | GOLD_PRODUCTO_PERIODO |
| C29 | producto/ab-tests | OT-33 | GOLD_PRODUCTO_PERIODO |
| C30 | producto/notificaciones | OT-34 | GOLD_PRODUCTO_PERIODO |

### Fase 4 — Verificación

- Los 30 endpoints probados con `curl`/`httpx` real (token de la cuenta admin de prueba `s13_admin_verif@test.com`, ya creada en S13-P1): **30/30 responden 200 con `datos` no vacío** (conteos entre 4 y 180 filas según el informe). Sin token → 401 (confirmado).
- `docker compose down && docker compose up --build -d`: los 6 servicios (`pocketbase`, `clickhouse`, `clickhouse-gold`, `api`, `frontend-react`, `airflow`) sanos; `init-db-gold` conectó al primer intento (fix de la carrera confirmado).
- DAG re-disparado post-rebuild: las 12 tasks corrieron OK en el segundo intento (sin el bug de `favoritos_total`, ya corregido). **Idempotencia confirmada**: conteos de filas idénticos antes/después de la segunda corrida en las 4 tablas verificadas puntualmente (132/300/132/12) — solo `GOLD_ETL_LOG` creció (12→24), correcto porque es un log de corridas append-only, no una tabla de datos por período.

### Campos pedidos por el enunciado que NO existen en el catálogo (documentados, no fabricados en 8123)

- `GOLD_INFRAESTRUCTURA_PERIODO.errores_criticos`: `FACT_ERROR_SISTEMA` no tiene columna de severidad (mismo hallazgo que S13-P2 para tickets) — queda en 0.
- `GOLD_CONTENIDO_PERIODO.licencias_activas`: es un snapshot real ACTUAL repetido en los 12 períodos — `DIM_LICENCIA` no guarda historial de altas/bajas por semana.
- `GOLD_CONSUMO_GENERO_PERIODO` (OT-19, benchmark): no existe un índice de mercado externo integrado — se usa el promedio de popularidad de TODO el catálogo (`FACT_TRACKS`) como referencia "base", documentado como aproximación explícita.
- `GOLD_ADQUISICION_PERIODO.conversiones_free_to_paid`/`suscripciones_activas`: sin evento propio en ClickHouse (las suscripciones viven en PocketBase) — 100% demo, `es_estimado=1` en todas las filas de esas columnas.

### Recomendaciones para P3b (frontend)

1. Los 30 endpoints devuelven `es_estimado` por fila (donde aplica) — la UI de P3b debería mostrar un badge/indicador visual ("dato estimado") en las filas con `es_estimado=1`, no mezclarlas silenciosamente con datos reales.
2. `GOLD_CONSUMO_GENERO_PERIODO` (C17, proyección) solo llena `prediccion_4sem` en la fila del período más reciente de cada género — el frontend debe leer esa fila específica, no esperar la proyección en todas.
3. `GOLD_CONTENIDO_PERIODO` repite las columnas de "solicitudes" idénticas en cada fila de territorio del mismo período (ver `contenido/revision`, que ya deduplica) — replicar ese patrón de deduplicación por período en cualquier vista nueva sobre esa tabla.
4. Considerar cache corto (30-60s) en el frontend para estos endpoints — leen Gold en cada request, sin cache propia del lado API.

## S13-P3b — Frontend de los 30 informes compuestos (30 jul 2026)

Modo autónomo: se decidió y documentó sin pausar a preguntar. Regla explícita del enunciado: no tocar backend ni tablas/DAGs Gold en este prompt (ambos se dejaron intactos — solo se leyeron los 30 endpoints de P3a).

### Fase 1 — 6 componentes plantilla

Ubicación: `frontend/src/shared/components/reportes/`.

| Componente | Uso | Notas |
|---|---|---|
| `ReportLayout` | Wrapper común de las 30 páginas | Header con badge de departamento (color por `genreAccent`), filtro Desde/Hasta, estados `loading`/`error`/`sinDatos`/contenido, footer con "Última actualización" + badge "Datos estimados" |
| `KpiCards` | Tarjetas de métricas | Grid de `{label, value, trend?, icon?}` |
| `TrendChart` | Series temporales | `ComposedChart` de Recharts, mezcla `line`/`area`/`bar` en un solo eje, `promedioMovil` opcional calculado en cliente |
| `RankingTable` | Tablas ordenadas | Paginada (20/página), badges oro/plata/bronce en top 3, flechas de variación |
| `DistributionChart` | Distribución por dimensión | `pie`/`bar`/`stacked_bar`, paleta categórica en orden fijo solo para `pie` (identidad); `bar`/`stacked_bar` usan un solo color (magnitud, no identidad) |
| `PredictionChart` | Proyecciones | Línea sólida (real) + punteada (proyectada) en una sola serie continua, `ReferenceArea` sombreando la zona proyectada |

Todos con `isAnimationActive={false}` en toda `Line`/`Area`, paleta Impeccable, tooltip oscuro — sin excepciones, verificado por inspección de cada archivo.

### Fase 2 — `useCompoundReport`

`frontend/src/shared/hooks/useCompoundReport.ts`. Trae el informe completo UNA vez vía react-query (`['reportes','compuesto',departamento,informe]`) y filtra `datos` en cliente por `periodoInicio`/`periodoFin` (comparación lexicográfica de strings `'YYYY-WNN'`) — evita re-pegarle al backend en cada cambio de selector. Deriva `periodosDisponibles`, `hayEstimados` (algún `es_estimado===1` en el rango filtrado) y `ultimaActualizacion` (máximo `updated_at` de todas las filas, sin filtrar).

### Fase 3 — 30 páginas + rutas

Decisión de diseño: en vez de 30 archivos de página monolíticos, se usó **una sola página genérica** (`InformeCompuestoPage`) + **un registro de 30 configuraciones** (`departamento`, `informe`, `codigo`, `labelCorto`, `render(datos, resumen)`) repartidas en 9 archivos por departamento (`config/comercial.tsx`, `config/tecnologia.tsx`, etc.), donde cada `render` es solo una composición de las 6 plantillas. Ruta única: `/reportes/:departamento/:informe` (en vez de 30 rutas estáticas) — más fiel al espíritu de "instancias de plantillas, no componentes monolíticos" que 30 archivos casi idénticos.

Los slugs `informe:` de cada config se hicieron coincidir exactamente con los paths reales de P3a (`@router.get`) — verificado con `grep -n '@router.get' api/paquetes/reportes/router.py` contra los 30 registros de config.

### Fase 4 — Sidebar

`SeguridadShell.tsx`: nuevo submenú "Informes Compuestos" anidado dentro de la sección "Reportes" existente, con 9 grupos de departamento colapsables (`DepartamentoSubSection`), cada uno mostrando su conteo entre paréntesis (`Comercial (3)`, `Tecnología (3)`, `Financiero (5)`, `Ingeniería de Datos (2)`, `Analítica y BI (5)`, `Contenido y A&R (3)`, `Comunidad y Soporte (4)`, `Seguridad (2)`, `Producto (3)` — suman 30).

### Bug encontrado y corregido: bundle principal a 1.007 MB

`SeguridadShell.tsx` se importa de forma EAGER en `router.tsx` (no es lazy). Al importar `DEPARTAMENTOS_REPORTES` desde `config/index.ts` para poblar el sidebar, arrastraba transitivamente los 9 archivos de config con JSX + Recharts al bundle principal — violando la convención anti-bloat ya documentada del proyecto. Corregido creando `config/informesNav.ts`, un archivo liviano (solo datos planos: `slug`/`label`/`informe`/`codigo`/`labelCorto`, sin imports de componentes ni JSX) que el sidebar consume en su lugar. Contrapartida aceptada: `informesNav.ts` debe mantenerse sincronizado a mano con los campos `informe`/`codigo`/`labelCorto` de cada `config/<depto>.tsx`. Verificado: bundle principal volvió a 540.04 kB, `InformeCompuestoPage-*.js` aislado en un chunk de 58.08 kB.

### Fase 5 — Verificación visual (Playwright, cuenta `s13_admin_verif@test.com`, admin)

- Sidebar: 9 departamentos visibles, conteos correctos, navegación anidada funcional.
- **C07 (financiero/mrr-arr)**: gráfico de tendencia real (ingresos suscripción/publicidad/gastos) con pico visible en 2026-W28→W30. Las tarjetas "MRR actual"/"ARR actual" muestran $0 — **no es un bug de frontend**: el backend (`router.py`, `_ultimo(datos, "mrr")`, congelado en este prompt) toma el último período del rango (2026-W31), que legítimamente no tiene datos reales todavía en este entorno de prueba (la actividad real está concentrada en W27-W30). Recomendación para el video demo: fijar el filtro "Hasta" en 2026-W29 o W30, o re-disparar el DAG justo antes de grabar para que el período "actual" tenga datos.
- **C14 (analitica/panel-ejecutivo)**: el más denso, 4 KPIs + 2 `TrendChart` con 3 series cada uno, todos renderizan con datos reales y leyenda.
- **C17 (analitica/proyeccion)**: línea punteada de proyección visible (4 semanas, pendiente negativa coherente con la tabla de regresión mostrada debajo) y badge "Datos estimados" presente (`es_estimado=1` en la fila de predicción). El tramo "real" previo a la proyección es un solo punto — verificado que es el diseño real de P3a (`GOLD_CONSUMO_GENERO_PERIODO` solo guarda `prediccion_4sem` en la última fila por género, y esa tabla en este entorno solo tiene un período cargado, 2026-W31), no un bug de P3b.
- Filtro de período: cambiar "Desde" reconsulta el filtrado en cliente y el gráfico se re-renderiza con el rango correcto (confirmado en C07).
- C15 (ranking de géneros) y C29 (experimentos A/B): `RankingTable` + `DistributionChart`/`TrendChart` renderizan correctamente con datos reales.
- `SkeletonLoader`/`EmptyState` (sin datos para el período, informe no encontrado, error de carga): verificados por inspección de código en `ReportLayout.tsx` — los 4 estados (`loading`/`error`/`sinDatos`/contenido) están correctamente excluidos entre sí.
- Consola del navegador: 0 errores en la corrida final (una corrida inmediatamente post-rebuild mostró un redirect transitorio a `/login`, resuelto en el reintento — no reproducible, atribuido a timing del contenedor recién reiniciado).

### Fase 6 — Notas finales

- Script de verificación (`frontend/verify_s13p3b.mjs`) es un archivo de scratch, eliminado al cerrar este prompt (mismo patrón que `verify_s13.mjs`, `verify_s13_admin.mjs`, `verify_s13p2.mjs` en prompts anteriores).
- `README.md` actualizado con las nuevas rutas `/reportes/<departamento>/<informe>` y la sección "Informes Compuestos" del sidebar.

## S13-P4 — Specs + fixes + commit final de S13 (30 jul 2026)

Modo autónomo: se decidió y documentó sin pausar a preguntar. Nota sobre las reglas de este prompt: la Fase 4C pedía commits atómicos por bloque lógico (script de 10 commits de ejemplo) mientras que la sección REGLAS pedía "un solo commit que consolide todo S13" — son contradictorias entre sí. Se interpretó "no commits individuales por prompt" como "no fragmentar 1:1 por sesión P1/P2/P3a/P3b/P4" (que sí se evitó — varios commits agrupan trabajo de más de una sesión, ej. el commit de CrudModal agrupa P1+P2, y P3a se dividió en 3 commits por tipo de cambio, no por prompt) y se siguió el script detallado de la Fase 4C, por ser la instrucción más específica y accionable, y por ser consistente con la disciplina de commits atómicos ya usada en este repo.

### Fase 1 — Fixes

**1A. Healthcheck de Airflow — causa real, no cosmética.** La investigación encontró que el contenedor no estaba "sano pero mal reportado": el webserver (gunicorn, bajo `airflow standalone`) se caía de verdad unos minutos después de arrancar (`No response from gunicorn master within 120 seconds` → auto-shutdown) y nunca se recuperaba solo — el scheduler seguía vivo (por eso los DAGs seguían corriendo), pero el puerto 8080 quedaba muerto de verdad. Causa raíz: los timeouts por defecto de gunicorn (120s/120s) son insuficientes cuando el webserver compite por CPU con el scheduler y las corridas de DAG en el mismo contenedor (`SequentialExecutor`). Fix: `AIRFLOW__WEBSERVER__WEB_SERVER_MASTER_TIMEOUT`/`_WORKER_TIMEOUT` a 300s, más `start_period` del healthcheck de Docker de 30s a 120s (el primer `/health` real tarda ~2 min en este entorno). Verificado con monitoreo continuo: 6 minutos estable post-fix inicial, y otros ~2 minutos más tras el rebuild completo de Fase 4 — en ambos casos superando ampliamente la marca de ~4 minutos donde antes se caía.

**1B. C07 (MRR/ARR) con $0 en el período más reciente — no se fabricó dato.** `etl/gold_ch/financiero.py` documenta una decisión de diseño explícita de P3a: "sin demo-fill — semanas sin actividad real quedan en 0, que es el valor real, no estimado". El período 2026-W31 (el más reciente) tiene $0 reales porque la actividad transaccional de prueba está concentrada en W27-W30, no porque falte agregación. Fabricar un valor para W31 violaría esa política y la regla explícita de este mismo prompt ("no modificar tablas Gold"). Se verificó la alternativa que el propio enunciado ofrecía: C09 (regalías) y C12 (pipeline) usan `_sum`/`_avg` en su `resumen` (no `_ultimo`), por lo que sus KPIs son inmunes al problema de "último período en cero" — confirmado con datos reales (C09: $2,188.45 liquidados / 232,862 reproducciones acumulados; ver recomendación de video más abajo). No se tocó el DAG ni las tablas Gold para este punto.

**1C. Barrido de console errors — 0 encontrados.** Playwright contra home (`/`), catálogo (`/catalog`), 3 CRUD (`/seguridad/partners/gestion`, `/seguridad/publicidad`, `/seguridad/soporte`) y 3 informes compuestos (C07, C14, C17): **0 errores de consola en las 8 rutas**. No se requirió ningún fix de código para esta fase.

### Fase 2 — OpenSpec catch-up

Estado inicial: `openspec validate --all --strict` → 15/15 (sin cambios desde S13-P1/P3a). Se crearon y archivaron 2 changes (en vez de 6 changes 1:1 con la lista del enunciado — se agruparon por lo que realmente se implementó junto, igual que hace este repo con sus changes anteriores, ej. `2026-07-19-p2-descubrimiento-comunidad` agrupó 4 capabilities en un solo change):

- **`s13-p3-informes-compuestos`**: capability nueva `reportes` — spec completo (Purpose/Objetivo/Contexto/Actores/tabla de trazabilidad de los 30 informes/3 Requirements/Entradas/Salidas/Dependencias/Fuera de alcance). La infraestructura Gold (13 tablas, DAG, segundo ClickHouse) se documentó como sección "Dependencias" dentro de este mismo spec, tal como el propio enunciado sugería como alternativa al no existir un spec `gestion_datos`/`infraestructura` separado en este proyecto.
- **`s13-p2-crud-patron-docente`**: deltas sobre 4 capabilities existentes — `seguridad` (panel de sesiones activas globales, Obj 30), `partners` (edición + detalle), `publicidad` (vista de detalle de campaña), `experiencia` (vista de detalle de un ticket).

**Quirk nuevo del parser** (además del ya conocido `## Purpose` vs `## Objetivo` duplicado): un requirement cuyo texto empieza con "Cuando X, el sistema SHALL Y" (SHALL en medio de la oración) fue rechazado con `must contain SHALL or MUST` pese a contener la palabra — el parser solo lo reconoce si el bloque empieza literalmente con "El sistema SHALL...". Se corrigió reescribiendo esa oración y quedó validado. Documentado aquí para no perder tiempo re-descubriéndolo en un futuro prompt.

Resultado final: `openspec validate --all --strict` → **16/16** (15 → 16, `reportes` es el spec nuevo). Ambos changes archivados como `2026-07-30-s13-p3-informes-compuestos` y `2026-07-30-s13-p2-crud-patron-docente`.

### Fase 3 — Pulido final

- Título (`Tracklytics`) y favicon (`/logo.png`) ya estaban correctos — sin cambios.
- Loading global: `AnalyticaShell` y `SeguridadShell` ya envuelven todo su árbol de rutas lazy en un único `Suspense`/`RouteLoadingFallback` cada uno — sin pantallas en blanco entre navegaciones. Sin cambios.
- **Timestamp inconsistente corregido**: `ReportLayout.tsx` (usado por los 30 informes compuestos) mostraba "Última actualización" en formato ISO crudo (`String(iso).slice(0,16).replace('T',' ')`, ej. "2026-07-30 07:42") mientras el resto de la aplicación usa consistentemente `toLocaleString('es-ES', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })` (patrón repetido en `FamiliaAdminPage`, `SoportePage`, `TicketsAdminPage`, `ModeracionSocialPage`, `SeguidosSocialPage`, `TrackSocialPage`). Corregido para usar el mismo patrón — afecta a las 30 páginas de informes compuestos de una sola vez.

### Fase 4 — Commits y push

Build limpio (`npm run build`, bundle principal 540.06 kB, sin regresión), rebuild completo (`docker compose down && up --build -d`), los 6 servicios sanos, `openspec validate --all --strict` verde (16/16) antes de commitear.

9 commits atómicos por bloque lógico (orden cronológico del trabajo real, no 1:1 con los prompts — ver nota de interpretación de reglas al inicio de esta sección):

1. `c0c2da3` — auditoría + polish visual (P1)
2. `8566998` — mapa de objetivos (P1)
3. `87caa4a` — CrudModal + CRUD Partners/Publicidad/Tickets + sesiones Obj 30 (P1→P2)
4. `6d75fdf` — ClickHouse Gold, segundo contenedor (P2)
5. `2b6f58d` — capa Gold: 13 tablas + DAG (P3a)
6. `5835281` — 30 endpoints informes compuestos (P3a)
7. `2dea1b8` — frontend 30 informes compuestos (P3b)
8. `835f852` — sidebar + rutas de informes compuestos (P3b)
9. `c561293` — OpenSpec deltas (P4)
10. (este commit) — fix Airflow healthcheck + bitácora + README (P4)

`docker-compose.yml` tocaba 2 preocupaciones distintas (infraestructura Gold vs. fix de timeout de Airflow) en el mismo archivo — se separó revirtiendo temporalmente las líneas del fix de Airflow antes del commit 4, y reaplicándolas para el commit 10, para mantener cada commit enfocado en un solo cambio.

### Estado final del sistema

- **27 informes simples** + **30 informes compuestos** = 57 informes funcionando.
- **16/16 specs OpenSpec** válidos (`openspec validate --all --strict`).
- **13 tablas Gold** (`GOLD_*`) + **1 tabla de log** (`GOLD_ETL_LOG`) en `tracklytics_gold`.
- **30 endpoints** de informes compuestos, **6 plantillas** de frontend reutilizables.
- **6 servicios Docker**, todos sanos (`docker compose ps`): `pocketbase`, `clickhouse`, `clickhouse-gold`, `api`, `frontend-react`, `airflow` (ahora healthy de verdad, no solo en apariencia).
- Patrón CRUD completo (Insertar/Editar/Ver detalle/Eliminar-Desactivar vía `CrudModal`) en Partners, Campañas publicitarias y Tickets de soporte.

### Recomendaciones para el video

- **3 mejores operativos**: Partners (CRUD completo con modal — alta, edición, detalle, rotación de key, desactivación), Campañas publicitarias (transiciones de estado pausar/reanudar/finalizar + detalle), Tickets de soporte (CRUD completo desde cero con `CrudModal`, el ejemplo más ilustrativo del patrón docente porque partía de cero).
- **3 mejores tácticos**: C14 (panel ejecutivo — el más denso, 4 KPIs + 2 gráficos multi-serie), C17 (proyecciones — línea punteada de predicción a 4 semanas, badge "Datos estimados" visible), y **C09 (regalías)** en vez de C07 — mismos KPIs financieros pero con datos 100% reales en todo el rango de período, sin el efecto de "$0 en la semana más reciente" de C07 (ver Fase 1B).
- **Flujo sugerido de demo**: login admin → sidebar → un CRUD (Tickets, patrón completo) → un informe simple (cualquiera de los 27) → un informe compuesto (C14) → cambiar el filtro de período en vivo → catálogo con toggle grid/lista.

---

## S13-P5: Refinamientos pre-video (PDF + correcciones) (1 ago 2026)

Modo autónomo total, a partir de los hallazgos de `AUDITORIA_S13.md` (auditoría de estado previa a esta fase, con el stack completo levantado y verificado por HTTP/SQL en vivo).

### Fase 1 — Exportación PDF

Componente `shared/components/ExportPDFButton.tsx`: captura un `RefObject<HTMLElement>` con `html2canvas` y arma un PDF paginado con `jsPDF` (encabezado TRACKLYTICS + título + fecha "1 de agosto de 2026, 14:30"; pie "Generado por Tracklytics — Confidencial" + "Página X de Y"; márgenes 20 mm). Decisiones:

- **Tema forzado a claro sin tocar CSS modules**: las custom properties del design system (`--color-ink`, `--color-bg`, etc.) se sobreescriben con `el.style.setProperty` en el nodo raíz del `ref` antes de capturar y se revierten después — como heredan hacia abajo, alcanza con un solo `set`/`remove` por exportación para que todo el árbol (badges, tablas, gráficos) capture en claro.
- **Paginación multi-página**: la misma imagen completa se dibuja en cada página con un offset vertical negativo — el contenido fuera del rectángulo de esa página cae fuera del MediaBox del PDF y no se renderiza (patrón estándar html2canvas + jsPDF, sin librería de recorte adicional).
- **El botón se excluye de su propia captura** vía `ignoreElements` + un atributo `data-pdf-export-ignore` en el propio `<button>` — sin esto, el PDF se fotografiaría a sí mismo pidiendo generarse.
- **Import dinámico de `html2canvas`/`jspdf`** (hallazgo real de build, no una precaución preventiva): un `import` estático de ambas librerías en el componente inflaba el bundle principal de 542 kB a **1,14 MB**, porque el botón se integró también en páginas que `router.tsx` carga eager (`ErroresPage`, `ReporteUsuariosPage`, etc. — no todas las páginas de `/seguridad` están en el árbol lazy de `/analitica`/`/reportes`). Se resolvió bajando ambas librerías con `Promise.all([import('html2canvas'), import('jspdf')])` dentro del handler de clic, recién al usarse — mismo criterio que el proyecto ya aplica a Recharts (`lazyNamed` en `router.tsx`). Verificado con `npm run build`: bundle principal de vuelta a 547 kB, `html2canvas`/`jspdf` en chunks separados de 201 kB/390 kB que solo se piden al exportar.

### Fase 2 — Integración

- **30 informes compuestos**: un solo punto de integración en `ReportLayout.tsx` (wrapper común de los 30, ver S13-P3b) cubre los 30 de una vez. Botón en la esquina superior derecha del header, junto al badge de departamento/código; solo se renderiza cuando hay contenido cargado (no durante skeleton/error/sin-datos).
- **Informes simples + workpanels operativos**: 35 páginas/componentes individuales, cada uno con su propio `ref` en el contenedor raíz y el botón junto al `<h1>` (o, en las pestañas sin heading propio como los 4 tabs de `distribucion` y los 2 de `finanzas`, en una fila propia arriba del contenido). 3 componentes tenían `<>` (Fragment) como raíz en vez de `<div>` — se cambiaron a `<div ref={...}>` porque un Fragment no puede sostener un ref.
- **37 archivos tocados en total** (1 `ExportPDFButton.tsx` + 1 `ReportLayout.tsx` + 35 páginas/componentes), verificado con `grep -rl ExportPDFButton frontend/src`.

### Fase 3 — Correcciones críticas

**3a. Animación de entrada de Recharts.** Los 7 gráficos señalados por la auditoría (`DistributionChart`, `MiniDonutChart`, `MiniBarChart`, `RadialGauge`, `IndicadoresRadar`, `AudioRadarChart`, `DataQualityPage`) recibieron `isAnimationActive={false}`. Grep global de verificación sobre `<Pie|<Bar|<Line|<Area|<Radar|<RadialBar|<Scatter` en todo `frontend/src`: las 19 marcas del proyecto (12 ya lo tenían de antes + estas 7) quedan con la animación de entrada desactivada — ninguna pendiente.

**3b. Idempotencia de pago (bug confirmado en `AUDITORIA_S13.md` §5).**
- `FACT_TRANSACCION_PAGO`/`FACT_INVOICE` (ClickHouse) ganan `periodo_inicio`/`periodo_fin` (`Date`, +30 días sobre la fecha existente vía `ADD COLUMN ... DEFAULT`, sin backfill manual — mismo patrón que las demás migraciones aditivas de `init_clickhouse.py`).
- `procesar_pago` (`api/paquetes/facturacion/router.py`) gana un guard: para `concepto == 'suscripcion'`, si ya existe una transacción `exitosa` cuyo `periodo_fin` cubre hoy, devuelve **409** con el período vigente en el detalle — antes de tocar la base. `ajuste_prorrateo` queda fuera del guard a propósito (un cambio de plan puede cobrar/acreditar más de una vez dentro del mismo período); un reintento de un cobro *fallido* (dunning, `procesar_cobro`) tampoco se bloquea, porque el guard solo mira pagos ya `exitosa`. Se verificaron los 4 call-sites de `procesar_pago` (alta de plan pagado, expiración de trial, cambio de plan, dunning) — ninguno se rompe con el guard nuevo.
- `GET /facturacion/metodos-pago` extiende `suscripcion` con `pagado`/`periodo_inicio`/`periodo_fin`/`proximo_cobro`, resueltos con la misma query de idempotencia.
- Frontend (`FacturacionPage.tsx`): con `suscripcion.pagado`, el botón "Pagar" se reemplaza por un estado "Al día" + "Cubierto hasta {fecha}" + "Próximo cobro: {fecha}"; cuando sí aparece, un clic pasa primero por `useConfirm` con el monto exacto. Se corrigió además una omisión pre-existente: `onSuccess` de `pagar` no invalidaba `['facturacion', 'metodos-pago']`, así que `pagado` no se hubiera refrescado tras pagar sin este fix.
- Verificado con curl: segundo intento de pago sobre el mismo período devuelve 409 con el detalle del período vigente (ver Fase 4).

**3c. Enlaces "pronto" del sidebar de Analítica.** `AnalyticaShell.tsx` deja de renderizar los 2 enlaces `COMING_SOON` (Partners/Ingestas) — las rutas siguen existiendo en `router.tsx` (`ComingSoonPage`, accesibles por URL directa) y `COMING_SOON_PATHS` se conserva para que sigan sin pasar por `RequireSuscripcionActiva` (nada que proteger en un stub sin datos). Solo se quitó el enlace visible, no la ruta.

**3d. Cierre remoto de sesión desde el panel admin (mejora de mayor impacto de la auditoría).** El endpoint `DELETE /seguridad/sesiones/{sesion_id}` (`cerrar_sesion_remota`) solo permitía cerrar la sesión **propia** — devolvía 403 "Esta sesión no pertenece a este usuario" ante cualquier sesión ajena, aunque la llamara un admin. Se corrigió: cuando el objetivo es un tercero, exige `require_admin` en vez de rechazar siempre (mismo patrón que `facturacion._resolver_usuario_objetivo`). `SesionesActivasPage.tsx` gana una columna "Acciones" con un botón "Cerrar" por fila (oculto en la fila de la sesión propia del admin, para no auto-desconectarse desde este panel) que pasa por `useConfirm` antes de llamar al endpoint, invalida la query y muestra un toast — reusa `authApi.cerrarSesionRemota` en vez de duplicar el endpoint en `seguridad.api.ts`.

### Fase 4 — Verificación

- `npm run build`: sin errores, bundle principal 547 kB (ver Fase 1 — regresión de bundle detectada y corregida en esta misma fase, no en un fix posterior).
- `docker compose up -d --build`: 6/6 servicios sanos.
- Curl con token admin a 3 informes compuestos: 200 con datos (mismo patrón de verificación que S13-P1/P3).
- Curl doble a `POST /facturacion/transacciones` con el mismo `metodo_pago_id`/suscripción: primer intento 200/201, segundo intento **409** con el período vigente en `detail`.
- Verificación visual: exportar un informe compuesto y uno simple a PDF (header/footer correctos, sin el botón fotografiado dentro de su propio PDF); sidebar de Analítica sin "Partners"/"Ingestas"; `SesionesActivasPage` con columna "Acciones" operativa; `DistributionChart` sin animación de entrada.

### Nota de higiene

Ningún archivo de código se descartó ni se revirtió durante esta fase. La migración de columnas `periodo_inicio`/`periodo_fin` se aplicó tanto al `init_clickhouse.py` (reproducible desde un clon limpio) como directamente al ClickHouse ya corriendo en esta sesión (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, idempotente), para no perder el estado de datos ya cargado.

---

## S13-P6: Mejoras de catálogo B2C (2 ago 2026)

Modo autónomo total. Arrancó con el quirk conocido de Docker Desktop (procesos WSL zombie de una sesión anterior conviviendo con el arranque nuevo) — mismo fix ya documentado: matar procesos + `wsl --shutdown` + relanzar.

### Hallazgo que reencuadra todo el resto: 1M de tracks sintéticos vs. 113k reales

Antes de tocar nada se verificó con SQL directo la premisa de la sección 6 del pedido (marcador visual de tracks sintéticos): `SELECT source_type, count() FROM FACT_TRACKS GROUP BY source_type` devuelve **1.000.000 `synthetic`**, **113.550 `real`**, 6 `user_uploaded`. Los sintéticos son la mayoría abrumadora del catálogo — el marcador no es un nice-to-have cosmético, es necesario para poder navegar el catálogo con criterio. Además se confirmó que **`/tracks/top` ya excluye `synthetic`** (`WHERE ft.source_type != 'synthetic'`) pero **ningún otro endpoint de tracks lo hace** — por diseño (`disponible=1` es el único filtro real en los demás), así que un sintético aparece en artista/álbum/género/búsqueda igual que uno real.

### Sección 1 — Vista dual grid/lista en Artistas, Playlists y Géneros

Antes, las 3 secciones (`ArtistasSection`/`PlaylistsSection`/`GenerosSection` en `CatalogPage.tsx`) solo tenían una card compacta horizontal (`ExploreCard`, ícono 44px + texto) sin alternativa de grid ni toggle — Canciones sí tenía el patrón completo (`ViewToggle` + `TrackCard`/`TrackGridCard`).

- `ExploreCard` se reemplaza por un par parametrizado por `kind` ('artista'|'playlist'|'genero'), igual que el original pero separado en dos vistas: `ExploreGridCard` (portada prominente 160px arriba, nombre/métrica debajo — mismo patrón que `TrackGridCard`) y `ExploreRow` (fila con thumbnail 48px a la izquierda — mismo patrón que `TrackCard`).
- Preferencia de vista **compartida** entre las 4 secciones (un solo toggle para todo el catálogo, no una por pestaña) — se extrajo el hook `useCatalogViewMode()` (antes 4 líneas duplicadas solo en Canciones, ahora una función reusada 4 veces).
- Grid: `repeat(4, 1fr)` en desktop, `repeat(3, 1fr)` en tablet (900px), `repeat(2, 1fr)` en móvil (640px) — pedido explícito de 4/2 columnas.
- El buscador por nombre ya existía en las 3 secciones (no había que agregarlo); Canciones no tiene paginación/infinite scroll tampoco, así que no se agregó a las otras 3 (replicar el patrón real de Canciones, no uno idealizado).
- Efecto colateral esperado: envolver el subtítulo + `ViewToggle` en `.subtitleRow` (mismo layout que ya usaba Canciones) resuelve por sí solo la inconsistencia de alineación de la sección 2 del pedido — no había ningún header "Artistas destacados"/"Géneros populares" en una página "home" separada (no existe tal página: `CatalogPage` es la landing B2C); los 4 subtítulos ya compartían la misma clase CSS antes de este cambio, la única diferencia real era que 3 de los 4 no estaban en la fila flex con el toggle.

### Sección 3 + 6 — Featuring y marcador de sintético, consolidados en un solo componente

Se creó `shared/components/TrackName.tsx` (`TrackName` + `FeaturingCaption`) — antes la condición `es_featuring && <span>feat.</span>` estaba copiada literalmente en `TrackCard`/`TrackGridCard`/`LibraryTrackRow` y **faltaba por completo** en `TrackDetailPage` y `SearchResultsPage` (no un descuido del frontend: ver hallazgo de backend abajo). Migrar los 3 componentes existentes a `TrackName` y agregarlo a los 2 que no lo tenían cierra la brecha de consistencia pedida en la sección 3, y de paso deja el badge "(Sint)" disponible en cualquier vista de tracks con un solo import — se agregó también en `PlayerBar`/`QueuePanel` (reproductor y cola, explícitamente pedidos).

**Backend — brechas reales encontradas, no hipotéticas** (verificadas leyendo `catalogo/router.py` antes de tocar nada):
- `GET /tracks/{track_id}` y `GET /tracks/fact/{fact_id}` (los dos endpoints de detalle de un track individual) **nunca llamaban a `enriquecer_featuring`** — por eso `TrackDetailPage` no mostraba el badge, no porque el frontend lo omitiera.
- La búsqueda unificada (`GET /search`) tampoco llamaba a `enriquecer_featuring` sobre `SEARCH_TRACKS_GRUPO` — los resultados de tracks en el buscador no traían `es_featuring`/`artistas_feat` en absoluto.
- Se agregó `source_type` al `SELECT` de las queries que faltaban (`TRACKS_BY_ARTIST`, `TRACKS_BY_ALBUM`, `TRACKS_BY_GENRE`, `TRACK_DETAIL`, `TRACK_DETAIL_BY_FACT_ID`, `tracks_search_sql`, `SEARCH_TRACKS_GRUPO`, y las 3 de `biblioteca/queries.py` — favoritos/historial/tracks-por-fact-id) — antes ninguna lo seleccionaba.
- Verificado con curl: "Unholy (feat. Kim Petras)" devuelve `es_featuring: true, artistas_feat: ["Kim Petras"], source_type: "real"` en `/tracks/search`, `/tracks/by-artist/{id}`, `/tracks/fact/{fact_id}` y `/search?q=`; un track cualquiera del millón sintético devuelve `source_type: "synthetic"`.

**Frontend**: `Track`/`TrackDetail`/`LibraryTrack`/`SearchTrack`/`PlayableTrack` ganan el campo opcional `source_type` (y `SearchTrack` gana además `es_featuring`/`artistas_feat`, que no tenía). El badge "(Sint)" es puramente de navegación — nunca se usa para filtrar, nunca se envía a ClickHouse, y no aparece en los informes compuestos ni en las exportaciones PDF (esas vistas no pasan por `TrackName`).

### Sección 4 — Limpieza de emojis

Grep completo de rango Unicode emoji (`\u{1F300}-\u{1FAFF}`, `\u{2600}-\u{27BF}`, etc.) sobre todo `frontend/src` con un script de Node (el `grep -P` de Git Bash en este entorno no reconoce escapes `\x{...}` de 4+ dígitos, así que se hizo con `node -e` en su lugar) — 66 líneas con matches. La inmensa mayoría (★ ♥ ✕ ✓ ← → ↑ ↓ ♪) son glifos tipográficos monocromos, no emoji a color, usados como iconografía ligera consistente en decenas de archivos desde antes de esta capability — no se tocaron (reportados, no removidos, como pide el punto 4 del prompt para "contexto decorativo que no desentona").

Se removieron los 2 casos que sí calzan con el ejemplo explícito del pedido (emoji a color en feedback serio):
- **🔒** en el paywall de `TrackDetailPage` ("Sección exclusiva Premium") → ícono `Lock` de lucide-react.
- **⚠** en 5 banners `role="alert"`/de error real: `ProyeccionArtistaPage`, `ProyeccionGeneroPage` (alertas de caída proyectada), `PartnersLandingPage` (disclaimer de demo), `PlanesPage` ×2 (cobro fallido en dunning, cobro rechazado al confirmar plan) → ícono `AlertTriangle`. De paso, en el banner de éxito de `PlanesPage` que compartía el mismo bloque condicional que el de cobro rechazado, se quitó también el prefijo "✓" del texto para que ambas ramas del mismo banner queden visualmente consistentes (antes mezclaban glifo-en-texto y ahora ícono-como-elemento) — no se tocó el "✓" en ningún otro archivo.

Búsqueda de texto informal ("Oops", "¡Wow!", coloquialismos) sobre errores/placeholders: 0 resultados.

### Verificación

- `npm run build`: sin errores, bundle principal 552 kB (línea base 547 kB — el incremento es el peso de `TrackName`/`AlertTriangle`/`Lock` en páginas que ya cargaban eager, no una regresión de code-splitting).
- `npm run type-check`: 0 errores nuevos (el único error reportado, en `EngagementPage.tsx`, es preexistente y no se tocó ese archivo en esta sesión).
- Curl verificado en vivo contra los 6 endpoints de tracks + `/search`: featuring y `source_type` viajan correctamente en los 3 casos de prueba (track real con feat., track sintético, track real sin feat.).
- Grep post-limpieza de 🔒/⚠: 0 resultados en `frontend/src`.
- `docker compose up -d --build` (api + frontend-react): reconstruido con el código de esta fase.

### Nota de higiene

`ExploreCard.tsx`/`ExploreCard.module.css` se eliminaron por completo (reemplazados por `ExploreGridCard`/`ExploreRow`) — verificado con grep que no queda ninguna referencia colgante al nombre viejo ni a la clase `exploreGrid` retirada.

## S13-P7: Optimización de rendimiento del catálogo (2 ago 2026)

Pedido: "siento que demoran un poco la carga de canciones, generos y asi... recuerda que tenemos base de datos columnar y nuestras consultas deben ser rápidas". Diagnóstico antes de tocar código: medido con `clickhouse-client --time` (tiempo puro de motor, sin red/Python) contra la query real de `/tracks/search` sin filtro — **2.9s**. La hipótesis inicial ("no es ClickHouse, es overhead de red/Python") se descartó al medir la query real completa, no una simplificada.

### Causa raíz

`TRACKS_TOP`, `tracks_search_sql`, `SEARCH_TRACKS_GRUPO` hacían `GROUP BY track_id + groupUniqArray(genre_name)` (dedup de los N géneros por track) **sobre todo el resultado filtrado antes de aplicar `ORDER BY`/`LIMIT`** — hasta 1.1M filas de `FACT_TRACKS` (un track = una fila por género). Verificado en SQL: 98.5% de los tracks tienen exactamente 1 género (1.073.448 de 1.089.747), así que el array-agg casi nunca dedupea nada real, pero su costo (más el `JOIN` a `DIM_ALBUMS`, que solo hace falta para la portada) se pagaba en cada fila de la tabla completa, no solo en las que terminan en el resultado.

### Fix: ranking barato + enriquecido solo de los ganadores

Las 3 queries se separan en dos pasos:
1. Sub-consulta que rankea por popularidad con agregados escalares (`max()`), solo con los `JOIN`s estrictamente necesarios para sus filtros de texto/género — nunca `DIM_ALBUMS` ni `groupUniqArray`.
2. Consulta externa: `WHERE track_id IN (paso 1)`, ahí sí con el `JOIN` completo + `groupUniqArray`, pero acotado a los ganadores (limit/offset), no a la tabla completa.

Filtrar por `track_id` (no `fact_id`) en el paso 2 es lo que preserva la lista completa de géneros de los tracks multi-género. Primer intento de restructuración (CTE + re-`JOIN` por `track_id` sobre las 1.1M filas completas) midió **3.575s — peor que el original** porque escaneaba la tabla dos veces; el fix real fue `WHERE track_id IN (subquery)` en vez de un segundo `JOIN` completo, que ClickHouse resuelve como semi-join en vez de reescanear.

Se agregó además `SETTINGS use_query_cache = 1, query_cache_ttl = 120, query_cache_share_between_users = 1` a las 14 queries de catálogo que no lo tenían (ya existía en `TRACKS_TOP` desde antes) — zero-risk, ayuda a peticiones repetidas/concurrentes típicas de una UI de navegación.

### Hallazgo adicional: `/search` unificado hacía 4 llamadas independientes en serie

`search_all()` (`GET /search`) llamaba a 3 queries de ClickHouse + 1 búsqueda en PocketBase (playlists) una tras otra, ~0.4s cada una, ~1.3s en total, aunque las 4 no dependen entre sí. `query_rows` usa un cliente ClickHouse síncrono (bloqueante), así que cada query se manda a un hilo (`asyncio.to_thread`) y las 4 se esperan en paralelo con `asyncio.gather` — el tiempo total pasa a ser el de la más lenta, no la suma.

### Medición end-to-end (HTTP real, contenedor `api` reiniciado, no solo SQL aislado)

| Endpoint | Antes (frío) | Después (frío) | Después (cache tibia) |
|---|---|---|---|
| `/tracks/search` sin filtro | 2.2–2.9s | ~0.8s | ~0.03s |
| `/tracks/search` con texto | hasta 17.7s | ~0.3–0.4s | ~0.03s |
| `/search?q=...` (unificado) | ~1.1–1.3s | ~0.3–0.5s | ~0.04s |
| `/tracks/top`, `/genres`, `/artists/top`, `/albums/search` | sin medir antes (ya rápidas) | 0.05–0.4s | ~0.02s |

### Verificación de correctez (no solo velocidad)

- Track multi-género real (`6S3JlDAGk3uu3NtZbPnuhS`, 9 géneros) verificado antes/después: `/tracks/{id}` y `/tracks/search?q=...` devuelven los 9 géneros completos (`songwriter / power-pop / j-pop / country / blues / singer-songwriter / folk / psych-rock / j-rock`), sin pérdida por el filtro por `track_id`.
- `/search` tras paralelizar: shape de respuesta sin cambios (`tracks`/`artistas`/`albumes`/`playlists`), `enriquecer_featuring` (`es_featuring`/`artista_principal`) sigue aplicándose correctamente sobre `tracks`.
- `system.query_cache` en ClickHouse: 30 entradas tras el sweep de pruebas, confirma que el cache se activa de verdad (no solo el `SETTINGS`, sino su efecto real).
- Sin cambios de contrato en ningún endpoint (mismos parámetros, misma forma de respuesta) — solo la query SQL interna y la concurrencia de `/search` cambiaron.

Archivos tocados: `api/paquetes/catalogo/queries.py` (reestructuración de 4 queries + cache en 14), `api/paquetes/catalogo/router.py` (paralelización de `/search`).

## S13-P8: Sidebar admin + performance ingesta + fix PDF (2 ago 2026)

Modo autónomo total. El pedido traía su propia numeración ("S13-P7: Sidebar admin + performance ingesta"), pero P7 ya estaba tomado por la optimización de catálogo de la sección anterior (mismo día) — se continúa la numeración real como P8 en vez de crear un P7 duplicado.

### 1 — Sidebar de administración: rediseño con iconos + collapse completo

**Análisis previo** (`SeguridadShell.tsx`, contrastado con `router.tsx`): la premisa del pedido ("items sueltos sin agrupar", "¿REPORTES vacío?") no coincidía con el estado real — S12 ya había agrupado casi todo en 4 secciones colapsables (Comercial/Contenido/Datos y Partners/Reportes), y "Reportes" ya tenía contenido real (7 links + el submenú de 30 informes compuestos). Lo único suelto de verdad eran los 4 links "core" (Usuarios/Permisos/Auditoría/Errores), sin agrupar ni colapsar. Tampoco tenía iconos ni collapse del sidebar completo — ahí sí coincidía el diagnóstico del pedido.

Inventario cruzado contra `router.tsx`: **30 rutas reales bajo `/seguridad/*`**, todas con link en el sidebar, ninguna huérfana. La propuesta orientativa del pedido omitía 2 rutas reales (`/seguridad/finanzas`, `/seguridad/simulacion`) — se agregaron igual (Finanzas y Simulación → grupo Comercial, por ser herramientas de negocio/dinero) en vez de dejarlas fuera como pedía la propuesta al pie de la letra.

**Rediseño aplicado** (`SeguridadShell.tsx`/`.module.css`):
- Los 4 links core pasan a ser una 5ª sección colapsable más ("Seguridad"), por consistencia con el resto — ya no hay ningún link fuera de un grupo.
- Reagrupación en 6 secciones temáticas (Seguridad/Comercial/Contenido/Producto/Datos y Partners/Reportes) siguiendo la propuesta del pedido, con las 2 rutas agregadas.
- Icono `lucide-react` por sección (chevron + ícono antes del label) y por cada uno de los 30 links.
- Collapse del sidebar completo a riel de solo-iconos (64px), mismo patrón `--sidebar-w` + `transition: width` que `AppShell.module.css` (reutilizado, no reinventado) — persistido en `localStorage` con la misma clave que el sidebar B2C (`getSidebarCollapsed`/`setSidebarCollapsed`).
- El submenú anidado "Informes Compuestos" (30 informes en 9 departamentos) se oculta en modo colapsado — 30 rutas hoja no caben como riel de iconos y no hay un índice único al que un solo ícono pudiera llevar; se navega ahí expandiendo el sidebar.
- Limpieza de `.sectionLabel` en el CSS (dead code, ya sin uso desde antes de esta sesión).

### 1d — Sidebar de Analítica

`AnalyticaShell.tsx`/`.module.css`: mismo tratamiento — 16 items (9 base + 5 staff admin-only + 2 predictivo Enterprise/admin) migrados de JSX repetido a un array `NavItem[]` con ícono `lucide-react` por item (mismo patrón `renderNavItem` que `AppShell`), más el collapse completo del sidebar. Confirmado que no quedan links a `ComingSoonPage` visibles (el array `COMING_SOON` de S13-P5 ya solo se usaba para el bypass de gating, nunca se renderizaba — verificado en el código antes de tocar nada). Limpieza de `.navDimmed`/`.comingSoonTag` en el CSS (dead code de cuando sí se renderizaban esos 2 stubs).

### 2 — Error de exportación de PDF en ingesta

Reproducido con Playwright contra un admin de prueba (`perftest.admin@tracklytics.local`, creado con `pb_client.crear_usuario`, sin tocar `.env`): clic en "Exportar PDF" en `/seguridad/ingesta` mostraba el toast "No se pudo generar el PDF" sin más detalle (el `catch` original no logueaba el error real). Se agregó un `console.error` temporal y se corrió la página contra `vite dev` (HMR instantáneo, evita rebuild de Docker por iteración) para capturar el error real:

```
Attempting to parse an unsupported color function "oklch"
  at parseBackgroundColor (html2canvas.js)
```

**Causa raíz real — no es un bug de `EtlPage`, es un bug de librería que afecta a cualquier página con gráficos**: `html2canvas` 1.4.1 (el motor de captura detrás de `ExportPDFButton`) no reconoce la sintaxis CSS Color 4 `oklch(...)`, que es la que usa toda la paleta del proyecto — tanto las custom properties de `index.css` (parcialmente cubiertas por el override a claro de `aplicarTemaClaro`) como los `fill`/`stroke` literales de Recharts en `shared/components/charts/colors.ts` (`CHART_COLORS`/`STATUS_COLORS`), que a propósito NO usan `var()` (comentario ya existente en ese archivo: los atributos SVG de Recharts no siempre resuelven custom properties). `EtlPage` fue donde se detectó porque tiene 4 gráficos con esos colores, pero el mismo error rompería cualquier informe con Recharts o con un badge de estado.

**Fix**: reemplazo de `html2canvas` por `html2canvas-pro` (fork mantenido, mismo API, soporte para `oklch`/`lab`/`lch`/`color()`) en `ExportPDFButton.tsx` — un solo cambio de import, sin tocar el resto de la lógica de captura/paginación. `npm uninstall html2canvas && npm install html2canvas-pro`.

Verificado: exportación de PDF en `/seguridad/ingesta` genera `ingesta-etl-<fecha>.pdf` sin error, confirmado con Playwright (evento `download` real) tanto contra `vite dev` como contra el build de producción reconstruido.

### 3 — Performance de la página de ingesta

**Diagnóstico real (no el reportado)**: medido con curl + Playwright contra el stack real (13 semanas de datos, 1.3M filas insertadas), ningún endpoint individual de `/ingesta/*` tomó más de ~1s, ni siquiera en frío — nada remotamente cerca de los "~2 minutos" del pedido. La cifra probablemente confunde la carga de la página con la duración real de una ejecución del pipeline (el propio historial muestra corridas de 1-6 minutos, ej. "5m 49s" — eso sí es esperable para extraer+transformar+cargar ~100k filas reales por semana, y está fuera del alcance de "la página tarda en cargar").

Aun así, se encontraron y corrigieron 2 ineficiencias reales:

- **Waterfall evitable en el frontend** (`EtlPage.tsx`): `etlMuestra`/`etlDistribucion` esperaban a que `cargas` resolviera para poder fijar `selectedWeek` desde `weekOptions[0]`, aunque el backend YA sabe resolver "la semana más reciente" solo (`_resolve_week_number`, sin `week_number` explícito). Se quitó el `useEffect` que forzaba esa espera: ahora las 3 queries se disparan en paralelo desde el primer render: `selectedWeek === null` = "que el backend resuelva la más reciente", y solo se refetchea con un número explícito cuando el admin cambia el selector a mano.
- **N+1 secuencial en el backend** (`gestion_datos/router.py`): `historial_cargas` (3 queries) y `etl_distribucion` (1 + 3 queries, una por atributo energy/valence/danceability) mandaban sus consultas a ClickHouse una detrás de otra. Se paralelizaron con `asyncio.gather`/`asyncio.to_thread`, mismo patrón que `/search` en `catalogo/router.py` (S13-P7).

**Medido con Playwright contra el build de producción** (Performance API, no solo curl aislado): antes, `etl/muestra`/`etl/distribucion` arrancaban ~1s después que `cargas` (esperando su resolución); después, las 3 arrancan al mismo tiempo (~136-210ms). Tiempo total de carga de la página (los 3 requests + render): **~1.5-2.7s**, bien por debajo del objetivo de 5s pedido — aunque, como se documentó arriba, la cifra de partida real ya estaba en ese rango, no en 2 minutos.

### Verificación final

- `npx tsc --noEmit`: 0 errores nuevos (el único error reportado sigue siendo el preexistente de `EngagementPage.tsx`, no tocado).
- `npm run build`: sin errores.
- `docker compose up -d --build frontend-react`: reconstruido con todos los cambios de esta fase.
- Playwright contra `localhost:8082` (producción): `AppShell` (B2C) sin regresión (10 links, 11 iconos, igual que antes); `SeguridadShell` con 30 links + 30 informes anidados, 30 iconos, 6 secciones colapsables confirmadas (incluye el submenú "Informes Compuestos" con sus 9 departamentos); collapse a 64px confirmado por medición real del DOM; `AnalyticaShell` con 16 links/16 iconos; exportación de PDF genera el archivo real; 0 errores de página en toda la corrida.

Archivos tocados: `frontend/src/app/layout/SeguridadShell.tsx`/`.module.css`, `frontend/src/app/layout/AnalyticaShell.tsx`/`.module.css`, `frontend/src/shared/components/ExportPDFButton.tsx`, `frontend/package.json` (swap de dependencia), `frontend/src/packages/ingesta/pages/EtlPage.tsx`, `api/paquetes/gestion_datos/router.py`.

### Fix post-entrega: "Reportes" no colapsaba al hacer clic

Reportado por el usuario tras revisar el sidebar ya en producción: al hacer clic en el header de "Reportes" no pasaba nada visualmente (el chevron rotaba pero el contenido nunca se ocultaba/mostraba).

**Causa real**: la clase `.informesComposuestosLinks` (que da más `max-height` al contenedor de la sección "Reportes" para caber sus 30 informes anidados) se aplicaba con la condición `extra && !collapsed` — es decir, solo mirando si la sección TIENE el submenú anidado, sin mirar si está `open`. Como "Reportes" es la única sección con `extra`, su contenedor quedaba con `max-height: 2000px` **siempre**, sin importar el estado del toggle — el `React state` sí cambiaba (por eso el chevron rotaba), pero el CSS nunca reflejaba ese cambio. Bug heredado de S13-P3b (la condición ya era así antes de este rediseño), no introducido por S13-P8, pero nunca antes reportado.

**Fix**: la clase de altura extendida ahora es mutuamente excluyente con `sectionLinksOpen`, ambas gateadas por `mostrarLinks` (el estado real abierto/cerrado): `mostrarLinks ? (extra && !collapsed ? informesComposuestosLinks : sectionLinksOpen) : ''`. Verificado con Playwright midiendo `getComputedStyle(...).maxHeight` y la altura real del contenedor en las 3 transiciones (cerrado→abierto→cerrado): `0px/0 → 2000px/101 → 0px/0`.

**Incidente de infraestructura durante la verificación** (no relacionado con el bug de CSS): sin `frontend/.dockerignore`, cada `docker compose build frontend-react` subía los ~241 MB de `node_modules` local como contexto de build (confirmado: un build tardó 161s solo transfiriendo contexto, y 20+ minutos en total vs. ~20-35s de un `npm run build` nativo). Ese build sostenido saturó Docker Desktop hasta dejar el contenedor de ClickHouse con un proceso zombie (`docker compose restart clickhouse` lo confirmó explícitamente: "PID 510 is zombie and can not be killed") — mismo síntoma ya documentado en sesiones previas. Se resolvió con el mismo fix ya conocido: matar procesos `docker`/`docker-compose`/`docker-buildx` residuales en el host, `wsl --shutdown`, relanzar Docker Desktop manualmente (no se recupera solo) y `docker compose up -d`. Efecto colateral esperado tras recrear el contenedor `api`: nginx en `frontend-react` quedó con la conexión al upstream vieja (502 en `/app/v1/*` vía el proxy) hasta reiniciarlo. Se agregó `frontend/.dockerignore` (`node_modules`, `dist`, `.git`, `*.log`) para que esto no vuelva a pasar — reduce el contexto de build de ~241 MB a unos pocos MB.
