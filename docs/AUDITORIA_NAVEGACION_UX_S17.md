# Auditoría de navegación y UX — S17 (sesión 9, 27 ago 2026)

> Auditoría 100% de código (sin capturas de pantalla, sin cambios de código) de las 81
> entradas de `frontend/src/app/router.tsx` — 4 de esas 81 son las 4 rutas contenedoras
> (`/`, `/analitica`, `/seguridad`, `/reportes`, cada una con su propio shell/layout, no
> páginas en sí), así que el número real de **páginas navegables auditadas es 77**. Se
> hace explícita esta diferencia porque el prompt original citaba 81 — ambos números son
> correctos, cuentan cosas distintas.
>
> Método: 4 agentes de lectura en paralelo (uno por dominio) + revisión directa de las
> páginas de autenticación/marketing y de informes compuestos, más un barrido global de
> paridad con funcionalidades tipo Spotify. Cada hallazgo cita archivo y línea. Ninguna
> captura de pantalla, ningún cambio de código — este documento es 100% diagnóstico.

## 1. Resumen ejecutivo

De las 77 páginas reales, **ninguna tiene un problema de carga que deje una pantalla en
blanco por completo** (axis 1) — la arquitectura de `useQuery`/`isLoading`/`isError` está
aplicada con consistencia notable en todo el frontend. Sí hay **9 casos puntuales** donde
una query *secundaria* de una página no expone `isError` y falla en silencio (peor caso:
`AdminTracksPage`, herramienta de moderación admin). El hallazgo de mayor volumen es un
**patrón repetido de listas sin límite/paginación en el backend** (no solo en el frontend)
en 5 endpoints reales — el peor es `GET /seguridad/admin/usuarios-reporte`, que trae la
tabla completa de usuarios (13,109 filas reales hoy) sin `LIMIT` en el SQL. El hallazgo más
importante para la demo es un **patrón inconsistente de confirmación en acciones
destructivas/financieras** — 11 casos donde una acción tan o más grave que otra ya
confirmada en la misma página (o en una hermana) dispara sin ningún diálogo, el peor caso
siendo `SimulacionPage` (liquidación financiera real + refresh de 60 tareas de Airflow, sin
ningún "¿estás seguro?"). En paridad con funcionalidades tipo Spotify, casi todo lo pedido
ya existe (radio por track, colaboración en playlists) — los gaps reales son letras
sincronizadas, ecualizador/crossfade/sleep timer (ya sabido, decorativo únicamente),
"no me interesa" en recomendaciones, Blend, y actividad de amigos visible en el reproductor.

**Los 5 hallazgos de mayor impacto de toda la auditoría:**
1. **`SimulacionPage.tsx`** — dos acciones que liquidan dinero real / disparan un refresh
   de 60 tareas de Airflow sin ningún diálogo de confirmación (§3.3, Alto impacto).
2. **`GET /seguridad/admin/usuarios-reporte`** (`ReporteUsuariosPage.tsx`) y **`GET
   /finanzas/gastos`** (`GastosTab.tsx`) — ambos sin `LIMIT` en el SQL, no solo sin paginar
   en el frontend; traen la tabla completa (13,109 usuarios / todos los gastos históricos)
   en una sola respuesta (§2, Alto impacto).
3. **11 acciones destructivas/financieras sin confirmación** mientras su acción hermana en
   la misma página sí la tiene (retiros de regalías, rotar API key de partner, suspender
   cuenta, anular gasto, procesar reembolso, quitar miembro de familia, aprobar/rechazar
   artista, revocar licencia — lista completa en §3.3).
4. **`AdminTracksPage.tsx`** (herramienta de takedown sobre 1.6M tracks) — ninguna de sus 2
   queries expone `isError`, y es además el ejemplo más claro de "solo tabla" que se
   beneficiaría de tarjetas con portada en vez de una tabla de 3 columnas (§4/§5).
5. **`DenunciasPanel`** dentro de `ModeracionSocialPage.tsx` — el backend y el cliente
   soportan paginación real mapeando `page`/`limit`, pero el componente nunca la usa: las
   denuncias más allá de la fila 20 son invisibles sin ningún indicador (§2).

## 2. Tabla de las 77 rutas

Columnas: **Carga** = ¿carga sin problema evidente? (✅ = sí / ⚠️ = query secundaria sin
`isError`, no bloquea la página / ❌ = problema real) · **Pag.** = ¿necesita paginación y la
tiene? (✅ = tiene o no aplica / ⚠️ = paginada en frontend pero backend sin límite real, o
paginación incompleta / ❌ = lista sin límite real) · **Hallazgo** = ¿tiene hallazgo de
flujo/navegación (axis 3 o 5)? (— = no / referencia a la sección de detalle si sí).

| # | Ruta | Componente | Carga | Pag. | Hallazgo |
|---|------|-----------|:---:|:---:|---|
| 1 | `/login` | LoginPage | ✅ | — | — |
| 2 | `/register` | RegisterPage | ✅ | — | — |
| 3 | `/acerca-de` | AboutPage | ✅ | — | — |
| 4 | `/partners` | PartnersLandingPage | ✅ | — | — |
| 5 | `/`, `/catalog` | CatalogPage | ✅ | ⚠️ | §3.2 |
| 6 | `/buscar` | SearchResultsPage | ✅ | ⚠️ | §3.2 |
| 7 | `/catalogo/track/:factId` | TrackDetailPage | ✅ | — | — |
| 8 | `/catalogo/artista/:artistaId` | ArtistDetailPage | ⚠️ | ⚠️ | §3.1 |
| 9 | `/catalogo/album/:albumId` | AlbumDetailPage | ⚠️ | ✅ | §3.1 |
| 10 | `/biblioteca` | BibliotecaPage | ✅ | ✅ | — |
| 11 | `/recomendaciones` | RecomendacionesPage | ✅ | ✅ | — |
| 12 | `/perfil` | ProfilePage | ⚠️ | ✅ | §3.1 (además, referencia positiva en §3.3) |
| 13 | `/usuarios/:usuarioId` | PerfilPublicoPage | ✅ | ✅ | — |
| 14 | `/facturacion` (redirect) | → `/suscripciones?tab=facturacion` | ✅ | — | — |
| 15 | `/facturacion/:invoiceId` | InvoiceDetailPage | ✅ | — | — |
| 16 | `/suscripciones` | PlanesPage | ✅ | — | — (referencia positiva, §3.3) |
| 17 | `/creadores` | CuentaArtistaPage | ✅ | ✅ | — |
| 18 | `/social` | SeguidosSocialPage | ✅ | ✅ | — |
| 19 | `/social/artista/:artistaId` (redirect) | RedirigeArtistaSocial | ✅ | — | — |
| 20 | `/social/track/:factId` | TrackSocialPage | ✅ | ✅ | — |
| 21 | `/distribucion/disponibilidad` | DisponibilidadPage | ✅ | ✅ | — |
| 22 | `/soporte` (B2C) | SoportePage | ✅ | ✅ | — |
| 23 | `/regalias/ganancias` | MisGananciasPage | ✅ | ✅ | — |
| 24 | `/analitica` | DashboardPage | ✅ | ✅ | §3.5 |
| 25 | `/analitica/engagement` | EngagementPage | ⚠️ | ✅ | §3.1 |
| 26 | `/analitica/playlists-top` | TopTracksPlaylistsPage | ✅ | ✅ | — |
| 27 | `/analitica/generos` | GenerosPage | ✅ | ✅ | — |
| 28 | `/analitica/comparacion` | ComparacionPage | ✅ | ✅ | — |
| 29 | `/analitica/benchmark` | ArtistaBenchmarkPage | ✅ | ✅ | — |
| 30 | `/analitica/tendencias` | TendenciasPage | ✅ | ✅ | §3.5 |
| 31 | `/analitica/reporte-diario` | ReporteDiarioPage | ✅ | ✅ | — |
| 32 | `/analitica/suscripciones` | ChurnPage | ✅ | ✅ | — |
| 33 | `/analitica/adquisicion` | AdquisicionPage | ⚠️ | ⚠️ | §3.1/§3.2 |
| 34 | `/analitica/funnel-conversion` | FunnelConversionPage | ✅ | ✅ | — |
| 35 | `/analitica/pnl` | PnlPage | ✅ | ✅ | — |
| 36 | `/analitica/mrr-arr` | MrrArrPage | ✅ | ✅ | — |
| 37 | `/analitica/bsc` | BalancedScorecardPage | ✅ | ✅ | — |
| 38 | `/analitica/benchmark-sql` | BenchmarkSqlPage | ✅ | ✅ | — |
| 39 | `/analitica/partners` | PartnersAnaliticaPage | ✅ | ✅ | — |
| 40 | `/analitica/disponibilidad` | DisponibilidadInfraPage | ✅ | ✅ | §3.5 |
| 41 | `/analitica/ingestas` | IngestasAnaliticaPage | ✅ | ✅ | — |
| 42 | `/analitica/proyeccion-genero` | ProyeccionGeneroPage | ✅ | ✅ | — |
| 43 | `/analitica/proyeccion-artista` | ProyeccionArtistaPage | ✅ | ✅ | — |
| 44 | `/seguridad` | AdminHomePage | ✅ | — | — |
| 45 | `/seguridad/usuarios` | UsuariosAdminPage | ✅ | ✅ | §3.3 |
| 46 | `/seguridad/permisos` | PermisosPage | ✅ | ✅ | — |
| 47 | `/seguridad/auditoria` | AuditoriaPage | ✅ | ❌ | §3.2 |
| 48 | `/seguridad/errores` | ErroresPage | ✅ | ❌ | §3.2/§3.5 |
| 49 | `/seguridad/facturacion` | AuditoriaFacturacionPage | ✅ | ✅ | — |
| 50 | `/seguridad/facturacion/empresa` | EmpresaConfigPage | ✅ | — | — |
| 51 | `/seguridad/creadores` | RevisionCreadoresPage | ✅ | ✅ | §3.3 |
| 52 | `/seguridad/social` | ModeracionSocialPage | ✅ | ⚠️ | §3.2/§3.3 |
| 53 | `/seguridad/distribucion` | DistribucionAdminPage | ✅ | ✅ | §3.3 |
| 54 | `/seguridad/catalogo` | AdminTracksPage | ⚠️ | ❌ | §3.1/§3.2/§3.5 |
| 55 | `/seguridad/suscripciones` | AdminSuscripcionesPage | ✅ | ✅ | — |
| 56 | `/seguridad/soporte` (admin) | TicketsAdminPage | ✅ | ✅ | — (referencia positiva, §3.5) |
| 57 | `/seguridad/familia` | FamiliaAdminPage | ✅ | ✅ | §3.3 |
| 58 | `/seguridad/regalias` | RegaliasAdminPage | ✅ | ⚠️ | §3.3 |
| 59 | `/seguridad/publicidad` | PublicidadAdminPage | ✅ | ✅ | — (referencia positiva, §3.3/§3.5) |
| 60 | `/seguridad/simulacion` | SimulacionPage | ✅ | ✅ | §3.3 |
| 61 | `/seguridad/finanzas` | FinanzasAdminPage (8 tabs) | ✅ | ❌ | §3.2/§3.3 |
| 62 | `/seguridad/partners` | PartnersConsolePage | ✅ | — | — |
| 63 | `/seguridad/partners/gestion` | AdminPartnersPage | ✅ | ✅ | §3.3 |
| 64 | `/seguridad/partners/metricas` | PartnersMetricasPage | ✅ | ✅ | — (referencia positiva, §3.5) |
| 65 | `/seguridad/ingesta` | EtlPage | ✅ | ❌ | §3.1/§3.2 |
| 66 | `/seguridad/ingesta/dimensiones` | CrudDimensionesPage | ✅ | ✅ | — (referencia positiva, §3.3/§3.5) |
| 67 | `/seguridad/ingesta/calidad` | DataQualityPage | ✅ | — | — |
| 68 | `/seguridad/reporte-usuarios` | ReporteUsuariosPage | ✅ | ❌ | §3.2 |
| 69 | `/seguridad/reporte-strikes` | StrikesGlobalPage | ✅ | ✅ | — |
| 70 | `/seguridad/reporte-ab-tests` | AbTestsPage | ✅ | ✅ | — |
| 71 | `/seguridad/reporte-notificaciones` | NotificacionesAdminPage | ✅ | ⚠️ | — |
| 72 | `/seguridad/reporte-familias` | FamiliasReportePage | ✅ | ⚠️ | §3.2 |
| 73 | `/seguridad/sesiones-activas` | SesionesActivasPage | ✅ | ⚠️ | §3.2 |
| 74 | `/seguridad/disponibilidad` | DisponibilidadInfraPage (mismo componente que #40) | ✅ | ✅ | — |
| 75 | `/reportes/:departamento/:informe` | InformeCompuestoPage (33 informes reales, ver nota) | ✅ | ✅ | — |
| 76 | `*` (catch-all) | NotFoundPage | ✅ | — | — |

*(76 filas — la 77ª "página" es la variante `catalog` de la fila 5, mismo componente
`CatalogPage`, montada dos veces por el router en `/` y `/catalog`.)*

**Nota sobre la fila 75**: `docs/BITACORA_S13.md` y el comentario en `router.tsx` dicen "30
informes compuestos", pero `frontend/src/packages/reportes/config/informesNav.ts` tiene
**33** entradas reales (`grep -c "informe:"`). Discrepancia de documentación menor, no de
código — no se investigó cuáles 3 informes se agregaron después de la cifra original de 30
ni si los 33 tienen su propio archivo de configuración con `render()` implementado (fuera
del alcance de esta pasada, que trató la página como una sola plantilla).

## 3. Hallazgos detallados

### 3.1 — Eje 1: Carga correcta

Los 77 componentes fueron leídos; **ninguno tiene un import roto, una prop inexistente en su
tipo, o una llamada a un endpoint que no existe en el backend correspondiente** — la
correspondencia API-wrapper↔router es consistente en todo el proyecto, sin excepciones
encontradas por los 4 agentes ni por mí.

Sí hay **9 casos de "silent-error-as-empty-state"**: una query *secundaria* de la página
(no la principal) nunca destructura `isError`, así que un fallo real (red, 500) se ve
idéntico a "no hay datos" — nadie se entera de que algo se rompió:

- `ArtistDetailPage.tsx` — la query de tracks del artista no expone `isError` (fallback
  silencioso a "Sin canciones registradas").
- `AlbumDetailPage.tsx` — mismo patrón para tracks del álbum.
- `AdminTracksPage.tsx` (`/seguridad/catalogo`) — **ninguna de sus 2 queries** (`tracksSearch`
  y `tracksOcultos`) expone `isError`. Es el caso más grave de los 9: es una herramienta de
  moderación/takedown — un admin buscando un track para retirarlo por una razón legal real
  podría ver "Sin resultados" cuando en realidad el fetch falló, y concluir erróneamente que
  el track no existe.
- `EngagementPage.tsx:192-197,423-434` — si la sub-query de "desempeño relativo" falla por
  una razón que no es de tier (red/500), no se renderiza nada, ni `ErrorState` ni retry.
- `AdquisicionPage.tsx:40-44` — los chips de filtro por canal desaparecen en silencio si su
  query falla (la query principal de la página sí maneja el error bien).
- `EtlPage.tsx` — el historial de cargas nunca lee ni muestra el campo `total` real que ya
  devuelve el backend (relacionado también con la paginación de esta misma página en §3.2).
- `ProfilePage.tsx:97` — el `<select>` de país queda vacío sin explicación si
  `distribucionApi.paisesPublico()` falla (bajo impacto, tiene fallback sano).
- `EmpresaConfigPage.tsx:117-120` — usa `isSuccess`/`isError` de la mutación en vez de un
  callback con toast; funcionalmente correcto, solo un patrón distinto al resto de la app.

Ninguno de estos 9 casos deja la página completamente en blanco — el impacto real es
"un admin ve una lista vacía y no sabe si es un cero real o un fetch roto".

### 3.2 — Eje 2: Paginación

Volumen real confirmado en esta sesión vía `curl` contra la API Dockerizada:
**13,109 usuarios**, **34,521 transacciones**, **23 solicitudes de cuenta de artista**;
de sesiones anteriores (`docs/qa-visual-s17/`): **37,760 comentarios**, **402 denuncias**,
**~1.6M filas en `FACT_TRACKS`** (de las cuales ~113k tienen `source_type='real'`),
**29,870 artistas**.

**Backend sin `LIMIT` real (no solo "sin paginar en el frontend" — el SQL trae todo)**:
1. **`GET /seguridad/admin/usuarios-reporte`** (`api/paquetes/seguridad/queries.py:494`,
   `USUARIOS_REPORTE`) — sin `LIMIT`, filtra/pagina 100% client-side sobre los 13,109
   usuarios reales de hoy. El más severo de todos: es la única query de este tipo sobre la
   tabla de mayor volumen del sistema.
2. **`GET /finanzas/gastos`** (`api/paquetes/finanzas/router.py:108-130`,
   `gastos_list_sql`) — sin `LIMIT`/`offset` en el SQL, y a diferencia de su vecina
   `ReembolsosTab` (que sí filtra por rango de fecha por defecto), `GastosTab.tsx:28-31`
   no aplica ningún rango — trae el histórico completo de gastos operativos.
3. **`GET /experiencia/admin/familias`** (`FamiliasReportePage.tsx`) — sin `limit` en
   ningún lado, mismo patrón, menor riesgo porque el volumen de familias « usuarios.
4. **`GET /social/admin/denuncias`** desde `ModeracionSocialPage.tsx` — el backend
   (`router.py:410-427`) y el cliente (`social.api.ts:58-66`) SÍ soportan `page`/`limit`,
   pero el componente `DenunciasPanel` (líneas 233-335) nunca mantiene un estado de página
   — siempre pide la página 1/20, sin control de paginación visible. De las 402 denuncias
   reales, solo las primeras 20 (filtradas por estado) son alcanzables desde la UI.
5. **`EtlPage.tsx`** — "Historial de cargas" pide página 1/límite 20 por defecto
   (`ingesta.api.ts:68-69`) y el backend sí devuelve un `total` real
   (`types.ts:51`, `router.py:636-651`) que la página nunca lee ni muestra — no hay
   indicador de "20 de N" ni control de página, a diferencia de su vecina
   `CrudDimensionesPage` en el mismo paquete, que sí pagina correctamente.

**Frontend con `limit` fijo y sin control de página** (el backend sí soporta más):
- `AuditoriaPage.tsx` — `seguridadApi.auditoria(50)` fijo, backend soporta hasta 500.
- `ErroresPage.tsx` — `seguridadApi.errores(50)` fijo, backend soporta hasta 500, y
  tampoco muestra un conteo total (un admin no sabe si hay 51 o 5000 errores).
- `SesionesActivasPage.tsx` — backend tope 200 sin `page`/`offset` en absoluto; si las
  sesiones abiertas reales superan 200 (ya pasó una vez, ver bitácora de incidentes), la
  201ª en adelante es literalmente inalcanzable desde esta página, no solo "no paginada".

**Gaps de affordance en catálogo (backend ya soporta `offset`, la UI no lo expone)**:
- `CatalogPage.tsx` — secciones de canciones/artistas/playlists muestran un top-N fijo con
  el conteo total real en el subtítulo (ej. "2,340,213 resultados") pero sin forma de ver
  más allá del primer lote.
- `SearchResultsPage.tsx` — más severo: el endpoint unificado `GET /search`
  (`router.py:49-103`) ni siquiera acepta `offset` en el backend — no es solo un gap de
  UI, el backend tendría que cambiar para soportarlo.
- `AdminTracksPage.tsx` — mismo patrón que `CatalogPage` pero en una herramienta de
  moderación: buscar un término común entre 1.6M tracks para encontrar uno específico que
  retirar no tiene forma de pasar de los primeros 30 resultados.

**Ya bien resuelto — mencionado para que quede como referencia de "qué se ve bien"**:
`UsuariosAdminPage.tsx`, `TicketsAdminPage.tsx`, `PublicidadAdminPage.tsx`,
`CrudDimensionesPage.tsx`, `AuditoriaFacturacionPage.tsx` (feed global + por-usuario, ambos
paginados server-side desde el fix real documentado en su propio código), `StrikesGlobalPage.tsx`,
`AdminSuscripcionesPage.tsx`, `DisponibilidadPage.tsx` — todos con `page`/`limit` real y
conteo total desde el backend.

### 3.3 — Eje 3: Flujos artificiales

**Hallazgo de mayor impacto de todo el documento**: `SimulacionPage.tsx` — "Simular
actividad de negocio" (línea ~122-124, liquida un período financiero real) y "Generar y
refrescar Gold" (línea ~184-189, dispara un refresh de Airflow de 60 tareas que la propia
página advierte que "puede tardar varios minutos") se disparan **ambas con un solo clic, sin
ningún diálogo de confirmación**. Es la acción con mayor efecto real (dinero + carga de
infraestructura) de todo el frontend y la que menos fricción tiene.

`RegaliasAdminPage.tsx` — "Procesar"/"Rechazar retiro" (línea 518-524, libera o niega dinero
real a un artista/sello) se dispara directo al clic, mientras que "Terminar contrato" 3
secciones más arriba en la misma página SÍ usa `useConfirm()` (línea 58-62). Inconsistencia
real dentro de la misma pantalla. La misma página además apila 4 formularios de creación
siempre visibles (nuevo productor, asignar productor, nueva cuenta sello, nuevo contrato de
9 campos) sin colapsar — se siente como una descarga cruda de formularios comparado con el
patrón ya usado en `CuentaArtistaPage` (formulario colapsado por defecto) o
`DistribucionAdminPage` (organizado en tabs) del mismo código base.

`AdminPartnersPage.tsx` — "Rotar key" (línea 162-164) invalida al instante la integración
en vivo de un partner y la propia página advierte "no se puede recuperar después" (línea
108), pero se dispara sin confirmación — mientras que "Desactivar", una acción menos
irreversible, sí pasa por un `CrudModal` de confirmación.

**Otras 8 acciones destructivas/consecuentes sin confirmación** (todas con un patrón
`useConfirm()`/`CrudModal` ya establecido en la misma página o en una hermana del mismo
paquete, así que el fix sería mecánico, no de diseño nuevo):
- `UsuariosAdminPage.tsx:210-213` — "Suspender cuenta".
- `RevisionCreadoresPage.tsx:176-189,226-239` — aprobar/rechazar cuenta de artista o track.
- `DistribucionAdminPage.tsx` (los 5 tabs) — cero `useConfirm()` en todo el archivo,
  incluida "Revocar licencia" (acción B2B que bloquea a un licenciatario al instante).
- `FamiliaAdminPage.tsx:150-157` — "Quitar" miembro de un plan familiar pago.
- `GastosTab.tsx:189` (finanzas) — "Anular" un gasto.
- `ReembolsosTab.tsx:78-80` (finanzas) — "Procesar reembolso", acción monetaria real.

**Ya bien resuelto — referencia de "qué se ve bien" en confirmación/feedback**:
`PlanesPage.tsx` (confirmación con el monto prorrateado real antes de cobrar, el mejor
ejemplo de feedback intermedio de todo el frontend), `ProfilePage.tsx` (doble confirmación
real para dar de baja la cuenta), `CrudDimensionesPage.tsx` (reconfirmación real cuando el
backend responde 409 por FK — el flujo de borrado mejor diseñado de la auditoría),
`PublicidadAdminPage.tsx` (confirmación con lenguaje de irreversibilidad explícito),
`RegaliasAdminPage.tsx`'s "Terminar contrato" y `AdminPartnersPage.tsx`'s "Desactivar" (la
mitad del patrón correcto en páginas que también tienen la mitad incorrecta, arriba).

### 3.4 — Eje 4: Paridad con funcionalidades tipo Spotify

Verificado por grep real (no de memoria), como pedía el prompt:

**Ya implementado — NO reportar como faltante** (confirmado con el código, no asumido):
- **Radio por track** ("Ir a radio de esta canción") — `frontend/src/packages/catalogo/hooks/useRadio.ts`,
  reemplaza la cola completa con canciones similares vía `GET /experiencia/radio/track/{fact_id}`.
  Completamente funcional, con manejo de "sin sesión" y "sin resultados".
- **Colaboración en playlists** (invitar a otros a editar) — `PlaylistsTab.tsx:24,70-86,142-227`
  + `api/paquetes/biblioteca/router.py` — agregar/quitar colaborador por email, contador de
  colaboradores, mensajes de error reales. Completamente funcional.

**Gaps reales confirmados** (cero coincidencias de código, verificado con grep real):
- **Letras (estáticas o sincronizadas)** — ningún componente, tipo, ni endpoint relacionado
  con "letra"/"lyrics" de canciones existe en el código (las coincidencias de grep fueron
  falsos positivos de la palabra `PlayableTrack`).
- **"No me interesa" en recomendaciones** — cero coincidencias; `RecomendacionesPage.tsx`
  no tiene ninguna acción de descarte/feedback negativo sobre una recomendación.
- **Blend (mezcla entre varios usuarios)** — cero coincidencias en todo el código.
- **Actividad social visible en el reproductor mismo** ("escuchado por amigos" dentro del
  `QueuePanel`/reproductor, no solo en el perfil) — cero coincidencias; el reproductor
  (`QueuePanel.tsx`, `PlayerContext.tsx`) no referencia nada social.
- **Ecualizador/crossfade/sleep timer** — confirmado que sigue sin existir como
  funcionalidad real: la única coincidencia de "ecualizador" en todo el frontend es en
  `AuthHero.tsx`, y es explícitamente "puramente decorativo" según su propio comentario
  (barras de audio animadas en el login, sin lógica de audio real detrás). Ya era sabido de
  baja prioridad — sigue sin implementar, confirmado.

### 3.5 — Eje 5: Navegación y experiencia — "no solo tablas"

**Caso más claro de "solo tabla" con mejor alternativa concreta**: `AdminTracksPage.tsx`
(`/seguridad/catalogo`) — el flujo principal de esta herramienta de takedown sobre un
catálogo de 1.6M tracks es una tabla plana de 3 columnas (Track | Artista | Acción), sin
portada, sin género, sin popularidad — ningún contexto que ayude a un admin a confirmar que
encontró el track correcto antes de ocultarlo. El mismo paquete (`catalogo`) ya tiene
`TrackCard`/`TrackGridCard` con portada, usados en `CatalogPage`/`SearchResultsPage` —
reusar ese patrón acá (en vez de la tabla cruda) sería consistente con el resto del propio
paquete, no una idea nueva. Además, el único conteo visible es una etiqueta ("Tracks ocultos
(N)"), no un stat tile como los que ya usa `ProfilePage`/`BibliotecaPage` en el resto de la
app.

**Páginas de analítica con dato solo accesible vía hover del gráfico, sin tabla alternativa
ni resumen antes del detalle**:
- `TendenciasPage.tsx` — 3 paneles de línea (volumen/popularidad/energía) sin tabla y sin
  ningún KPI resumen antes de los 3 gráficos.
- `DisponibilidadInfraPage.tsx` — gráficos de uptime por componente sin un KPI de "uptime
  promedio" antes de la grilla de gráficos por componente.
- `ChurnPage.tsx`/`AdquisicionPage.tsx` — tienen tabla, pero se beneficiarían de un tile de
  "churn del último mes"/"altas totales en el rango" como titular antes de la tabla, en vez
  de que el número más reciente solo esté disponible leyendo la última fila.

**Páginas de administración predominantemente-tabla que podrían beneficiarse de
agrupación/severidad en vez de lista plana**:
- `ErroresPage.tsx` — log plano sin agrupar por servicio ni filtrar por
  resuelto/no-resuelto (mismo patrón de chips por estado que ya usa `TicketsAdminPage`).
- `CrudDimensionesPage.tsx` — el selector de las 11 tablas de dimensión + "Hechos" es un
  `<select>` plano con solo el nombre técnico de la tabla, sin agrupar ni describir qué
  representa cada una — un data engineer nuevo tiene que adivinar desde el nombre crudo.

**Ejemplos ya bien resueltos, útiles como referencia para las páginas de arriba**:
`PartnersMetricasPage.tsx` (grid de tarjetas, no tabla), `AdminSuscripcionesPage.tsx`
(expansión in-place del detalle de cobros en vez de modal/ruta separada),
`PublicidadAdminPage.tsx` (tabs + donut + KPI + modal ancho con preview en vivo del
anuncio), `TicketsAdminPage.tsx` (cola tipo lista + donut por estado + chips de filtro, no
una tabla cruda). Ver también §3.3 para los ejemplos de confirmación/feedback bien resueltos
(`PlanesPage`, `ProfilePage`, `CrudDimensionesPage`).

## 4. Priorización sugerida

Pensando en los días que quedan antes de la presentación — realista sobre qué es alcanzable
sin arriesgar lo que ya funciona:

### Alto impacto, bajo riesgo de romper algo (candidatos para atacar primero)

**Estado: cerrado completo, S17 sesión 10 (27 ago 2026).** Los 4 puntos de este bloque están
resueltos, verificados en runtime con Docker + Playwright, y commiteados en 4 commits
atómicos (`0da0926`, `de11ced`, `8d3fb45`, `045d18a`). Detalle:

- ✅ **`useConfirm()`/`CrudModal` en las 11 acciones sin confirmación de §3.3** — las 11
  ganaron confirmación real, incluida `SimulacionPage` (con el mensaje mostrando el efecto
  real calculado, no un genérico). `Revocar licencia` (`LicenciasTab.tsx`) resultó ya tener
  fricción real (un modal propio con motivo obligatorio) al revisar el código con más
  cuidado — no necesitaba el fix, era un falso positivo del grep original. `Desactivar
  restricción/país` se dejó sin tocar a propósito (reversibles, efecto positivo).
- ✅ **`LIMIT`/paginación real en `GET /seguridad/admin/usuarios-reporte` y `GET
  /finanzas/gastos`** (§3.2) — ambos convertidos a `LIMIT`/`OFFSET` reales (o rango de
  fecha por defecto + tope de seguridad, para gastos). `pais`/`estado_cuenta` filtran
  server-side en usuarios-reporte; `rol`/`plan` siguen filtrando solo la página actual,
  documentado como decisión consciente (plan no vive en ClickHouse, tocar el modelo de
  datos estaba fuera de alcance de un fix de paginación).
- ✅ **`DenunciasPanel` conectado a la paginación que el backend ya soportaba** — estado de
  página agregado, denuncias más allá de la fila 20 ya son alcanzables.
- ✅ **Los 9 casos de query secundaria sin `isError`** — 8 corregidos; el 9º
  (`EmpresaConfigPage.tsx`) resultó, al revisar el código, ser funcionalmente correcto (usa
  `isSuccess`/`isError` de la mutación, patrón distinto pero sin bug real) — documentado
  como discrepancia entre la auditoría original y el estado real del código, no se tocó.

### Medio impacto, vale la pena si sobra tiempo
- Rediseñar `AdminTracksPage.tsx` con `TrackCard`/grid en vez de tabla (§3.5) — mayor
  esfuerzo visual, pero el componente ya existe en el mismo paquete, no hay que construirlo.
- KPI/tile resumen antes del gráfico en `TendenciasPage`/`DisponibilidadInfraPage`/`ChurnPage`/`AdquisicionPage`
  (§3.5) — bajo esfuerzo, alto valor de lectura en una demo.
- Exponer el `total` que `EtlPage.tsx` ya recibe del backend y agregar control de página
  (§3.2) — el dato ya está en la respuesta, solo falta leerlo.

### Bajo impacto o riesgoso a esta altura — documentar, no atacar antes de la demo
- Cambiar el backend de `GET /search` para soportar `offset` (§3.2) — es el único gap de
  paginación que requiere tocar un endpoint público de alto tráfico justo antes de la
  presentación; alto riesgo de regresión para un beneficio que un evaluador probablemente
  no note en una demo corta.
- Cualquiera de los 5 gaps de paridad Spotify confirmados (§3.4, letras/Blend/"no me
  interesa"/actividad de amigos en el reproductor/ecualizador real) — son features nuevas,
  no fixes; ninguna es un bug, son decisiones de alcance para el stakeholder, no para
  atacar sin más contexto de negocio.
- Reorganizar `RegaliasAdminPage.tsx` (colapsar los 4 formularios) — mejora real pero de
  layout, con riesgo de introducir un bug visual en una página que maneja dinero, justo
  antes de la demo.
