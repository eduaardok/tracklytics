# Auditoría visual de completitud — Frontend Tracklytics (S16)

> **Solo diagnóstico** — no se modificó ningún archivo de código, CSS ni componentes.
> Fecha: 2026-08-22 · Cobertura: todas las pantallas montadas en `frontend/src/app/router.tsx`
> (la estructura real es `frontend/src/packages/<dominio>/pages`, no `frontend/src/pages`).

## Método y vara de medir

Se auditaron ~60 pantallas contra el estándar ya alcanzado:

- **Login/register** (`AuthHero.tsx` + `AuthPages.module.css`): centrado, aurora+grano, stagger, `--ease-out-quart`. Los modos *recuperar/restablecer* contraseña viven **dentro** del card rediseñado (`LoginPage.tsx:243-289`) — **no existen páginas separadas** de recuperación; `RegisterPage` reutiliza el mismo hero. Ambas conformes.
- **Catálogo** (`CatalogPage.tsx`): hero compacto con pulso, grano, filas horizontales con fades (`useDragScroll`), collages (`PlaylistCollage`).
- **Top-nav** (`TopNavMore`, tokens de borde/sombra/glass) y utilidades globales `.card-glass`, `.row-hover`, `.text-display`.
- Los 3 shells ya aplican `PageTransition` (AppShell:194, AnalyticaShell:218, SeguridadShell:366) — la transición de entrada a página **no se reporta como faltante** en ninguna pantalla.

Barridos globales realizados: **cero** hex hardcodeados en CSS modules, **cero** `TODO/FIXME/Lorem/datos mock` visibles en UI, **cero** violaciones de tipografía (todo Space Grotesk/JetBrains Mono vía `var(--font-*)`). El caso "Respuesta a decisiones estratégicas" del BSC se trató como intencional/documentado, igual que las rutas `ComingSoonPage` declaradas en router y el panel demo de login.

---

## Tabla resumen

| Pantalla | Criterio(s) | Severidad | Referencia |
|---|---|---|---|
| **TRANSVERSAL — badges semánticos con literales de tema oscuro** | 4 | **ALTA** | `seguridad/pages/SeguridadPages.module.css:241-247`; igual en `social/pages/SocialPages.module.css:727-728` |
| Biblioteca (Mi Biblioteca) | 1, 3 | media/baja | `catalogo/pages/BibliotecaPage.tsx:60-73` (statCards), `:89-91` (tabs sin fade) |
| Detalle de álbum | 2 | **media** | `catalogo/pages/AlbumDetailPage.tsx:97,99` |
| Social · Artista | 1, 3 | **media** | `social/pages/ArtistaSocialPage.tsx:95-127` |
| Social · Track | 2 | **media** | `social/pages/TrackSocialPage.tsx:187` |
| Perfil (/perfil) | 1, 3 | **media** | `seguridad/pages/ProfilePage.tsx:258-577`, `:286,349` |
| Mi Plan (suscripciones) | 2 | **media** | `suscripciones/pages/PlanesPage.tsx:295,359` |
| Facturación · detalle factura | 2 | **media** | `facturacion/pages/InvoiceDetailPage.tsx:38` |
| Mis ganancias (regalías) | 2 | **media** | `regalias/pages/MisGananciasPage.tsx:159` |
| Admin · Usuarios | 2, 4 | **media** | `seguridad/pages/UsuariosAdminPage.tsx:146,183`; `.module.css:100-169` |
| Admin · Reporte usuarios | 2 | **media** | `seguridad/pages/ReporteUsuariosPage.tsx:176` (`shell.empty` no existe) |
| Admin · Strikes global | 2 | **media** | `seguridad/pages/StrikesGlobalPage.tsx:123` (mismo bug `.empty`) |
| Admin · Familias reporte / AB tests / Notificaciones | 2 | **media** | `experiencia/pages/FamiliasReportePage.tsx:101`, `AbTestsPage.tsx:85`, `social/pages/NotificacionesAdminPage.tsx:118` |
| Analítica — estado de carga (13 pantallas) | 3 | **media** | patrón `<div style={{minHeight}}/>` vacío: `GenerosPage:68`, `ComparacionPage:66`, `ArtistaBenchmarkPage:52`, `TendenciasPage:155`, `ReporteDiarioPage:56`, `AdquisicionPage:109`, `DisponibilidadInfraPage:104`, `ChurnPage:50`, `FunnelConversionPage:55`, `PnlPage:63`, `MrrArrPage:55`, `ProyeccionGeneroPage:81`, `ProyeccionArtistaPage:76` |
| Analítica · Funnel conversión | 3 | **media** | `analitica/pages/FunnelConversionPage.tsx:76` + `.module.css:81-89` |
| Analítica · Simulación | 3 | **media** | `simulacion/pages/SimulacionPage.module.css` (cero `transition/animation`) |
| Finanzas admin (CSS compartido) | 4 | **media** | `finanzas/pages/FinanzasPages.module.css:231-266,396-397` (~12 tintes literales) |
| Analítica — charts sin entrada | 3 | media | `isAnimationActive={false}`: `TendenciasPage:77`, `DisponibilidadInfraPage:68`, `AudioRadarChart:83`, `MiniLineChart:93`, `MiniBarChart:43`, `MiniDonutChart:20` |
| Búsqueda | 2, 3 | baja | `SearchResultsPage.tsx:138-139` (icono ♪ genérico), css `.row:hover` sin transition |
| Recomendaciones (Para ti) | 2 | baja | `RecomendacionesPage.tsx:104-110` (vacío custom sin EmptyState) |
| Social · Seguidos | 2, 3 | baja | `SeguidosSocialPage.tsx:118-123,163-168`; dropdowns sin animación |
| Perfil público | 2, 3 | baja | `PerfilPublicoPage.tsx:31` (carga plana), `:79-80` (playlists sin collage) |
| Detalle track / páginas de detalle (CSS) | 3, 4 | baja | `TrackDetailPage.tsx:81`; `DetailPages.module.css:336-340` |
| Reproductor persistente (PlayerBar) | 4 | baja | `shared/components/PlayerBar.module.css:54,93,158,266` (oklch literales) |
| Analítica · Géneros / Comparación / Benchmark artista / Proyecciones | 2, 3 | baja/media | prompts vacíos en texto plano (`GenerosPage:61-65`, etc.) |
| Admin · Permisos | 2 | baja | `PermisosPage.tsx:55-66` (sin guía de estado inicial) |
| Admin · Familia | 2 | baja | `FamiliaAdminPage.tsx:121` |
| Ingesta (ETL, dimensiones, calidad) | 1, 2, 3, 4 | baja | `EtlPage.tsx:340,414,451`; `CrudDimensionesPage.tsx:375`; `DataQualityPage.tsx:65,89` |
| Publicidad admin | 2, 4 | baja | `PublicidadAdminPage.module.css:45,215-221,299` |
| Partners (landing/métricas) | 3, 4 | baja | `PartnersMetricasPage.module.css:64-66`; landing `:13-14` |
| Distribución · Disponibilidad | 2, 3 | baja | `DisponibilidadPage.tsx:146`; css `tr:hover` sin transition |
| Regalías admin / Suscripciones admin / Empresa config | 2, 3 | baja | loaders planos: `RegaliasAdminPage.tsx:449`, `AdminSuscripcionesPage.tsx:95`, `EmpresaConfigPage.tsx:42` |
| Acerca de (AboutPage CSS) | 3, 4 | baja | glows sin override `[data-theme='dark']`; `.waves` estática |
| Coming soon (Analítica partners/ingestas) | 3 | baja | existencia intencional; diseño digno pero espartano |

**Pantallas conformes (sin hallazgos):** RegisterPage, ErroresPage, AuditoriaPage,
SesionesActivasPage, TicketsAdminPage, TopTracksPlaylistsPage, ModeracionSocialPage,
InformeCompuestoPage, NotFoundPage, SoportePage, ArtistDetailPage, PlaylistsTab,
AuditoriaFacturacionPage, RevisionCreadoresPage, DistribucionAdminPage,
AdminPartnersPage, PartnersConsolePage, DashboardPage (solo detalles menores),
EngagementPage (ídem), BenchmarkSqlPage, PnlPage, MrrArrPage, ChurnPage, TierUpsell,
y sobre todo **BalancedScorecardPage** (referente del paquete analítica).

---

## Hallazgos de severidad alta y media

### A1 · ALTA — Badges semánticos con colores de tema oscuro fijos (rompen en light, el tema por defecto)
`SeguridadPages.module.css:241-247` define `.badgeActive/.badgeSuspend/.badgeBlocked` con
literales `oklch(0.7 …)` (claridad pensada para fondo oscuro); en tema claro esos verdes/rojos/naranjas
quedan lavados sobre superficie casi blanca (contraste muy por debajo de AA). El mismo patrón en
`SocialPages.module.css:727-728` afecta los badges leído/no-leído de notificaciones. Afecta a
ReporteUsuarios, StrikesGlobal, SesionesActivas y NotificacionesAdmin — justo pantallas donde el
color del badge comunica estado crítico. **Cómo sí:** cualquier badge que consuma `var(--color-success)`/
`var(--color-error)` (se re-tematizan solos), o `color-mix(in oklch, var(--color-primary)…)` como hace
`AdquisicionPage.module.css:83`.

### A2 · MEDIA — Copy incorrecto heredado de playlist en la página de álbum
`AlbumDetailPage.tsx:97,99`: estado vacío dice *"Sin canciones registradas para esta playlist."* y el
`aria-label` es *"Canciones de la playlist"* dentro de la pantalla de **álbum**. Copy-paste de
TrackDetail/playlist que delata falta de terminación. **Cómo sí:** ArtistDetailPage, que usa EmptyState
con copy propio de su contexto.

### A3 · MEDIA — Comentarios sociales muestran UUID crudo como autor
`TrackSocialPage.tsx:187`: `Usuario {c.usuario_id.slice(0, 6)}` renderiza `"Usuario a3f9c1"` visible.
En una app de consumo esto lee como dato sin terminar; el fallback `Track #{id}` (:104) es el mismo
problema. Contrasta con SeguidosSocialPage, que resuelve nombre+avatar en sus tarjetas.

### A4 · MEDIA — ArtistaSocialPage es una sola barra sin identidad visual
`ArtistaSocialPage.tsx:95-127`: toda la página es una caja `subjectBar` (nombre + botones seguir/
compartir). Sin portada, sin métricas, sin jerarquía tipo hero — el **mismo artista** se ve pulido en
ArtistDetailPage (hero con SkeletonLoader, tracks con EmptyState) y desangelado entrando por Social.
El dropdown compartir además aparece/desaparece sin animación (`SocialPages.module.css:150-163`).

### A5 · MEDIA — Perfil: densidad de cajas apiladas + colapsables abruptos
`ProfilePage.tsx:258-577`: 6+ secciones idénticas (surface+border apiladas) sin cabecera de identidad
(avatar/plan) ni diferenciación visual — comparado con la tarjeta única y jerárquica del login se siente
un formulario administrativo. Además `{cambiandoPassword && (...)}` monta/desmonta bloques sin ninguna
transición (`:286,349`), y sesiones/familia muestran `Cargando…` plano (`:412,471`).

### A6 · MEDIA — Páginas de monetización que arrancan como "Cargando…" de página completa
`MisGananciasPage.tsx:159`, `PlanesPage.tsx:295,359` e `InvoiceDetailPage.tsx:38` devuelven
`<p>Cargando…</p>` como **única** pantalla durante la carga. Son las pantallas de pago/ganancias:
la primera impresión es texto plano en vez del skeleton que ya existe (`SkeletonLoader`).
**Cómo sí:** SoportePage (usa `.skel` + ErrorState) y el Suspense+fallback de los shells.

### A7 · MEDIA — Clase fantasma `shell.empty`: estados vacíos sin estilo en 3 reportes admin
`shell.empty` se usa en `ReporteUsuariosPage.tsx:176`, `StrikesGlobalPage.tsx:123` y
`UsuariosAdminPage.tsx:146`, pero **`.empty` no existe en `SeguridadPages.module.css`**
(verificado): "Sin usuarios que coincidan…" / "Sin strikes activos." se renderizan como texto
completamente sin estilo. Es la causa raíz de varios "estado vacío sin diseño" del grupo seguridad.

### A8 · MEDIA — Analítica: 13 pantallas cargan como panel vacío y sus charts aparecen de golpe
Patrón transversal `{styles.panel} + minHeight inline` sin skeleton (lista completa en la tabla) y
`isAnimationActive={false}` en Line/Area/Radar/mini-charts. El resultado: dashboards que se sienten
muertos frente al pulso del hero de catálogo o el count-up del KPICard de Dashboard/BSC. Probablemente
deliberado para ExportPDF, pero es la principal razón de la percepción de estaticismo del paquete.
**Cómo sí:** BalancedScorecardPage (`SkeletonCard`, `.progressFill` con transition, `card-glass`).

### A9 · MEDIA — Funnel conversión: el visual protagonista es estático
`FunnelConversionPage.tsx:76` fija `width` inline sin `transition` ni animación de crecimiento
(`.module.css:81-89`): el funnel aparece lleno de golpe tras la carga. Un solo `transition: width`
con `--ease-out-quart` lo alinearía con el resto del lenguaje motion. Ídem BenchmarkSqlPage
(`:50-105`): KPIs+tabla+veredicto aparecen sin entrada tras "Medir ahora".

### A10 · MEDIA — SimulacionPage: única hoja del proyecto con cero transiciones
`SimulacionPage.module.css` no tiene ni un `transition`/`animation`: hovers instantáneos, tablas sin
feedback, cambios de estado abruptos. Además mezcla dos tablas dentro de un solo panel (`tsx:205-251`)
y usa loader plano (`:211`).

### A11 · MEDIA — Finanzas admin: doble implementación de la paleta semántica
`FinanzasPages.module.css:231-266,396-397` repite ~12 tintes `oklch(...)` literales para badges,
banners y alertas donde Publicidad ya estandarizó `color-mix(var(--color-*))`; incluye un hex
hardcodeado en el SVG del select (`stroke='%2358586a'`, `:106`, no adapta a tema). Deuda visual hoy
baja (los valores coinciden con tokens) pero garantiza deriva futura. Mismo patrón duplicado en
`UsuariosAdminPage.module.css:100-169` (con hue 300 ≠ 290 del primario) y `TierUpsell.module.css:7-17`.

### Menores destacados (baja)
- **Biblioteca**: statCards genéricos sin icono/acento (`BibliotecaPage.tsx:60-73`) y cambio de tab
  sin fade (`:89-91`) — la pantalla B2C más visitada tras catálogo es también la más plana.
- **Búsqueda**: playlists con icono genérico `♪` en vez de `PlaylistCollage`
  (`SearchResultsPage.tsx:138-139`), inconsistente con Biblioteca.
- **Prompts vacíos en analítica táctica** (Géneros/Comparación/Benchmark/Proyecciones): texto plano
  "Selecciona un género…" sin EmptyState; "datos insuficientes" mostrado como error genérico en
  Proyecciones cuando Engagement ya tiene `.insufficientNotice`.
- Loaders planos dispersos: `// cargando…` en tabs de biblioteca y detalles de track/álbum;
  `Cargando…` en celdas de finanzas/regalías/suscripciones admin — todos reemplazables por
  `SkeletonLoader`/`SkeletonTableRows` que ya existen.

---

## Ranking priorizado: qué rediseñar primero

| # | Objetivo | Justificación breve |
|---|---|---|
| **1** | **BibliotecaPage (+ Favoritos/Historial tabs)** | Es tab de nav primario ("Mi Biblioteca") y la primera impresión B2C después del catálogo; hoy son statCards anónimos + tabs sin fade + `// cargando…`. Máxima exposición, brecha directa contra CatalogPage. |
| **2** | **Perfil (`ProfilePage`)** | Auto-gestión frecuente y pantalla larga: densidad de cajas idénticas sin cabecera de identidad ni transiciones. Un hero de usuario (avatar/plan) + acordeón animado la alinea con el estándar login. |
| **3** | **Social B2C (`ArtistaSocialPage` + `TrackSocialPage`)** | Zona entera de consumo con identidad rota: artista sin portada/métricas y autores-UUID, junto a un ArtistDetailPage pulido. La incongruencia entre puertas de entrada al mismo contenido es lo que más se percibe como "sin terminar". |
| **4** | **Monetización (`PlanesPage`, `MisGananciasPage`, `InvoiceDetailPage`)** | Las pantallas de dinero abren con "Cargando…" de página completa. Sustituir por skeletons existentes es esfuerzo mínimo con impacto directo en la percepción de producto serio (además de A1, que arregla badges de estado en todo el admin). |
| **5** | **Analítica: patrón de carga + funnel/benchmark (transversal)** | No es un rediseño sino un fix de sistema aplicado a 13 pantallas: reemplazar panel-vacío por SkeletonLoader y dar entrada al funnel (`width` + ease-out-quart). Una sola decisión eleva el paquete completo al nivel BSC. |

*Correcciones puntuales previas a cualquier rediseño (costo casi cero): A1 (badges light-theme),
A2 (copy álbum), A3 (UUID), A7 (clase `shell.empty` inexistente).*
