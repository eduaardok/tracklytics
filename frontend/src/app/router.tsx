import { lazy, Suspense, type ComponentType } from 'react'
import { createBrowserRouter } from 'react-router-dom'
// Import directo (no vía el barrel `@app/layout`): ese índice también
// re-exporta `AnalyticaShell` de forma estática — importar cualquier cosa de
// él arrastraría ese módulo (y Recharts con él) de vuelta al bundle
// principal, anulando el `lazyNamed` de abajo.
import { AppShell } from '@app/layout/AppShell'
import { SeguridadShell } from '@app/layout/SeguridadShell'
import { RouteLoadingFallback } from '@shared/components/RouteLoadingFallback'
import { NotFoundPage } from '@shared/components/NotFoundPage'
import { CatalogPage, TrackDetailPage, ArtistDetailPage, AlbumDetailPage, BibliotecaPage } from '@packages/catalogo'
import { SearchResultsPage } from '@packages/catalogo/pages/SearchResultsPage'
// Mismo motivo que el bloque de arriba (`@app/layout`): 6 de estos 7 barrels
// (seguridad/facturacion/creadores/social/distribucion/experiencia) también
// re-exportan una página con Recharts (los dashboards de S10 Día 3, ver
// `lazyNamed` más abajo) — importar CUALQUIER binding vía el barrel arrastra
// ese módulo de vuelta al bundle principal, aunque el binding usado no sea
// el que pesa. Se importa cada componente directo de su archivo para no
// tocar el barrel desde código eager (hallazgo real: sin esto, el bundle
// principal pasó de ~445kB a ~805kB — verificado con `npm run build`).
import { RequireAuth } from '@packages/seguridad/components/RequireAuth'
import { PermisosPage } from '@packages/seguridad/pages/PermisosPage'
import { ErroresPage } from '@packages/seguridad/pages/ErroresPage'
import { LoginPage } from '@packages/seguridad/pages/LoginPage'
import { RegisterPage } from '@packages/seguridad/pages/RegisterPage'
import { AboutPage } from '@packages/seguridad/pages/AboutPage'
import { ProfilePage } from '@packages/seguridad/pages/ProfilePage'
import { FacturacionPage } from '@packages/facturacion/pages/FacturacionPage'
import { InvoiceDetailPage } from '@packages/facturacion/pages/InvoiceDetailPage'
import { PlanesPage } from '@packages/suscripciones'
import { CuentaArtistaPage } from '@packages/creadores/pages/CuentaArtistaPage'
import { SeguidosSocialPage } from '@packages/social/pages/SeguidosSocialPage'
import { ArtistaSocialPage } from '@packages/social/pages/ArtistaSocialPage'
import { TrackSocialPage } from '@packages/social/pages/TrackSocialPage'
import { PerfilPublicoPage } from '@packages/social/pages/PerfilPublicoPage'
import { DisponibilidadPage } from '@packages/distribucion/pages/DisponibilidadPage'
import { PartnersConsolePage, PartnersMetricasPage, PartnersLandingPage } from '@packages/partners'
import { SoportePage } from '@packages/experiencia/pages/SoportePage'
import { FamiliaAdminPage } from '@packages/experiencia/pages/FamiliaAdminPage'
import { RecomendacionesPage } from '@packages/experiencia/pages/RecomendacionesPage'
import { MisGananciasPage } from '@packages/regalias/pages/MisGananciasPage'

// `/analitica` es la única sección con dependencias pesadas (Recharts, ver
// docs/decisiones-refactorizacion.md §18) que no vale la pena bajar al
// bundle principal para usuarios B2C que nunca la visitan. `lazyNamed` adapta
// los named exports del proyecto (todo el código usa `export function X`,
// nunca `export default`) al contrato de `React.lazy`, que solo acepta un
// default export.
function lazyNamed<P extends object, K extends string>(
  loader: () => Promise<Record<K, ComponentType<P>>>,
  key: K,
): ComponentType<P> {
  return lazy(() => loader().then((mod) => ({ default: mod[key] }))) as unknown as ComponentType<P>
}

const AnalyticaShell = lazyNamed(() => import('@app/layout/AnalyticaShell'), 'AnalyticaShell')
const DashboardPage           = lazyNamed(() => import('@packages/analitica/pages/DashboardPage'), 'DashboardPage')
const EngagementPage          = lazyNamed(() => import('@packages/analitica/pages/EngagementPage'), 'EngagementPage')
const ComingSoonPage          = lazyNamed(() => import('@packages/analitica/pages/ComingSoonPage'), 'ComingSoonPage')
const GenerosPage             = lazyNamed(() => import('@packages/analitica/pages/GenerosPage'), 'GenerosPage')
const ComparacionPage         = lazyNamed(() => import('@packages/analitica/pages/ComparacionPage'), 'ComparacionPage')
const ArtistaBenchmarkPage    = lazyNamed(() => import('@packages/analitica/pages/ArtistaBenchmarkPage'), 'ArtistaBenchmarkPage')
const TendenciasPage          = lazyNamed(() => import('@packages/analitica/pages/TendenciasPage'), 'TendenciasPage')
const ReporteDiarioPage       = lazyNamed(() => import('@packages/analitica/pages/ReporteDiarioPage'), 'ReporteDiarioPage')
const AdquisicionPage         = lazyNamed(() => import('@packages/analitica/pages/AdquisicionPage'), 'AdquisicionPage')
const DisponibilidadInfraPage = lazyNamed(() => import('@packages/analitica/pages/DisponibilidadInfraPage'), 'DisponibilidadInfraPage')
const ChurnPage               = lazyNamed(() => import('@packages/analitica/pages/ChurnPage'), 'ChurnPage')
const FunnelConversionPage    = lazyNamed(() => import('@packages/analitica/pages/FunnelConversionPage'), 'FunnelConversionPage')
const PnlPage                 = lazyNamed(() => import('@packages/analitica/pages/PnlPage'), 'PnlPage')
const MrrArrPage              = lazyNamed(() => import('@packages/analitica/pages/MrrArrPage'), 'MrrArrPage')
const ProyeccionGeneroPage    = lazyNamed(() => import('@packages/analitica/pages/ProyeccionGeneroPage'), 'ProyeccionGeneroPage')
const ProyeccionArtistaPage   = lazyNamed(() => import('@packages/analitica/pages/ProyeccionArtistaPage'), 'ProyeccionArtistaPage')
const TopTracksPlaylistsPage  = lazyNamed(() => import('@packages/experiencia/pages/TopTracksPlaylistsPage'), 'TopTracksPlaylistsPage')

// `ingesta/DataQualityPage` también usa Recharts (donut de distribución por
// origen) — mismo motivo que arriba, se saca del bundle principal. EtlPage/
// CrudDimensionesPage no lo necesitan pero se lazy-loadean igual por
// consistencia: son admin-only, nunca están en el camino crítico de carga.
const EtlPage             = lazyNamed(() => import('@packages/ingesta/pages/EtlPage'), 'EtlPage')
const CrudDimensionesPage = lazyNamed(() => import('@packages/ingesta/pages/CrudDimensionesPage'), 'CrudDimensionesPage')
const DataQualityPage     = lazyNamed(() => import('@packages/ingesta/pages/DataQualityPage'), 'DataQualityPage')

// Dashboards de los 6 dominios nuevos (RT-04, S10 Día 3) — cada uno agregó
// Recharts a una pantalla admin-only que antes no lo tenía; mismo motivo que
// el bloque de arriba, se sacan del bundle principal.
const AuditoriaPage            = lazyNamed(() => import('@packages/seguridad/pages/AuditoriaPage'), 'AuditoriaPage')
// Gestión de usuarios (change roles-gestion-usuarios): admin-only, importa
// `susc_pb`/tanstack — se lazy-carga por consistencia con el resto del árbol
// de administración, para no arrastrar sus dependencias al bundle principal.
const UsuariosAdminPage        = lazyNamed(() => import('@packages/seguridad/pages/UsuariosAdminPage'), 'UsuariosAdminPage')
const AuditoriaFacturacionPage = lazyNamed(() => import('@packages/facturacion/pages/AuditoriaFacturacionPage'), 'AuditoriaFacturacionPage')
const EmpresaConfigPage = lazyNamed(() => import('@packages/facturacion/pages/EmpresaConfigPage'), 'EmpresaConfigPage')
const RevisionCreadoresPage    = lazyNamed(() => import('@packages/creadores/pages/RevisionCreadoresPage'), 'RevisionCreadoresPage')
const ModeracionSocialPage     = lazyNamed(() => import('@packages/social/pages/ModeracionSocialPage'), 'ModeracionSocialPage')
const DistribucionAdminPage    = lazyNamed(() => import('@packages/distribucion/pages/DistribucionAdminPage'), 'DistribucionAdminPage')
const TicketsAdminPage         = lazyNamed(() => import('@packages/experiencia/pages/TicketsAdminPage'), 'TicketsAdminPage')

// Admin-only, sin Recharts propio — pero importan `distribucionApi`/
// `creadoresApi` vía sus barrels (RegaliasAdminPage), así que igual se
// lazy-cargan para no arrastrar esos barrels al bundle principal.
const RegaliasAdminPage   = lazyNamed(() => import('@packages/regalias/pages/RegaliasAdminPage'), 'RegaliasAdminPage')
const PublicidadAdminPage = lazyNamed(() => import('@packages/publicidad/pages/PublicidadAdminPage'), 'PublicidadAdminPage')
const SimulacionPage      = lazyNamed(() => import('@packages/simulacion/pages/SimulacionPage'), 'SimulacionPage')
const FinanzasAdminPage   = lazyNamed(() => import('@packages/finanzas/pages/FinanzasAdminPage'), 'FinanzasAdminPage')
// Nuevas páginas admin (change p1-ciclos-vida) — import directo del archivo,
// no del barrel, para no arrastrar sus dependencias al bundle principal.
const AdminTracksPage        = lazyNamed(() => import('@packages/catalogo/pages/AdminTracksPage'), 'AdminTracksPage')
const AdminPartnersPage      = lazyNamed(() => import('@packages/partners/pages/AdminPartnersPage'), 'AdminPartnersPage')
const AdminSuscripcionesPage = lazyNamed(() => import('@packages/suscripciones/pages/AdminSuscripcionesPage'), 'AdminSuscripcionesPage')

// Reportes administrativos (S12) — mismo motivo que el bloque de arriba:
// admin-only, se lazy-cargan por consistencia con el resto del árbol de
// administración, aunque ninguno traiga Recharts propio.
const ReporteUsuariosPage      = lazyNamed(() => import('@packages/seguridad/pages/ReporteUsuariosPage'), 'ReporteUsuariosPage')
const StrikesGlobalPage        = lazyNamed(() => import('@packages/seguridad/pages/StrikesGlobalPage'), 'StrikesGlobalPage')
const AbTestsPage              = lazyNamed(() => import('@packages/experiencia/pages/AbTestsPage'), 'AbTestsPage')
const NotificacionesAdminPage  = lazyNamed(() => import('@packages/social/pages/NotificacionesAdminPage'), 'NotificacionesAdminPage')
const FamiliasReportePage      = lazyNamed(() => import('@packages/experiencia/pages/FamiliasReportePage'), 'FamiliasReportePage')
// Obj 30 / OT-30 (S13-P2): única brecha total detectada en S13-P1.
const SesionesActivasPage      = lazyNamed(() => import('@packages/seguridad/pages/SesionesActivasPage'), 'SesionesActivasPage')
// Los 30 informes compuestos (S13-P3b) — una sola página de ruta dinámica
// (arrastra Recharts vía las plantillas de `shared/components/reportes`),
// ver docs/BITACORA_S13.md para por qué es 1 componente y no 30.
const InformeCompuestoPage     = lazyNamed(() => import('@packages/reportes/pages/InformeCompuestoPage'), 'InformeCompuestoPage')

export const router = createBrowserRouter([
  { path: '/login',      element: <LoginPage /> },
  { path: '/register',   element: <RegisterPage /> },
  { path: '/acerca-de',  element: <AboutPage /> },
  // Pública, sin sesión — porte de app/partners/landing.html (legacy) al
  // retirar `app/` (consolidación a React, 2026-07-10).
  { path: '/partners', element: <PartnersLandingPage /> },
  {
    path: '/',
    element: <AppShell />,
    children: [
      // ── B2C ─────────────────────────────────────────────────────────────────
      // Catálogo: navegación pública, sin sesión (mismo criterio que el
      // backend, api/paquetes/catalogo/router.py no gatea ningún endpoint).
      { index: true,        element: <CatalogPage /> },
      { path: 'catalog',    element: <CatalogPage /> },
      // Búsqueda unificada (change p2-descubrimiento-comunidad): pública igual
      // que el resto del catálogo — con sesión, además incluye las playlists
      // privadas del usuario.
      { path: 'buscar',     element: <SearchResultsPage /> },
      { path: 'catalogo/track/:factId',      element: <TrackDetailPage /> },
      { path: 'catalogo/artista/:artistaId', element: <ArtistDetailPage /> },
      { path: 'catalogo/album/:albumId',     element: <AlbumDetailPage /> },
      // Biblioteca personal (favoritos/playlists/historial): requiere sesión
      // (`require_b2c_user` en /biblioteca/*, backend ya archivado).
      { path: 'biblioteca',  element: <RequireAuth><BibliotecaPage /></RequireAuth> },
      { path: 'recomendaciones', element: <RequireAuth><RecomendacionesPage /></RequireAuth> },
      { path: 'perfil',      element: <RequireAuth><ProfilePage /></RequireAuth> },
      // Perfil público (S10 ronda 2): pública/sin sesión — el backend ya
      // resuelve la visibilidad (404 si es privado), mismo criterio que
      // `catalogo/track/:factId` de arriba.
      { path: 'usuarios/:usuarioId', element: <PerfilPublicoPage /> },
      // El resto requiere sesión — sus endpoints dependen de `get_current_user`
      // o `require_b2c_user` en el backend, y hasta ahora el guard nunca se
      // aplicaba del lado del cliente.
      { path: 'facturacion', element: <RequireAuth><FacturacionPage /></RequireAuth> },
      { path: 'facturacion/:invoiceId', element: <RequireAuth><InvoiceDetailPage /></RequireAuth> },
      { path: 'suscripciones', element: <RequireAuth><PlanesPage /></RequireAuth> },
      { path: 'creadores',   element: <RequireAuth><CuentaArtistaPage /></RequireAuth> },
      { path: 'social',                element: <RequireAuth><SeguidosSocialPage /></RequireAuth> },
      { path: 'social/artista/:artistaId', element: <RequireAuth><ArtistaSocialPage /></RequireAuth> },
      { path: 'social/track/:factId',      element: <RequireAuth><TrackSocialPage /></RequireAuth> },
      { path: 'distribucion/disponibilidad', element: <RequireAuth><DisponibilidadPage /></RequireAuth> },
      { path: 'soporte',     element: <RequireAuth><SoportePage /></RequireAuth> },
      { path: 'regalias/ganancias', element: <RequireAuth><MisGananciasPage /></RequireAuth> },
    ],
  },
  {
    path: '/analitica',
    // AnalyticaShell mismo es lazy (arrastra RequireSuscripcionActiva y el
    // API client de analitica) — este Suspense cubre su propia carga; el de
    // AnalyticaShell.tsx cubre las páginas hijas, también lazy.
    element: (
      <Suspense fallback={<RouteLoadingFallback />}>
        <AnalyticaShell />
      </Suspense>
    ),
    children: [
      { index: true,                    element: <DashboardPage /> },
      { path: 'engagement',             element: <EngagementPage /> },
      // RF-EXP-007 (CU-O50): mismo shell/gating que el resto de las
      // consultas tácticas de Cliente B2B — admin bypassa vía
      // RequireSuscripcionActiva, igual que cualquier otra ruta de este árbol.
      { path: 'playlists-top',          element: <TopTracksPlaylistsPage /> },
      { path: 'generos',                element: <GenerosPage /> },
      { path: 'comparacion',            element: <ComparacionPage /> },
      { path: 'benchmark',              element: <ArtistaBenchmarkPage /> },
      { path: 'tendencias',             element: <TendenciasPage /> },
      // Backend gatea /app/v1/analitica/reporte-diario con `require_staff`
      // (admin), no solo `require_b2b_panel_access` — RequireSuscripcionActiva
      // (aplicado a todo el Outlet del shell) no distingue ese caso, así que
      // esta ruta necesita además el guard genérico de rol, igual que el resto
      // del árbol admin-only (`/seguridad`).
      { path: 'reporte-diario',         element: <RequireAuth roles={['admin']}><ReporteDiarioPage /></RequireAuth> },
      // CU-O72 (monetizacion-retencion-mejoras): reemplaza el placeholder —
      // el backend gatea `/analitica/churn` con `require_staff` (admin), no
      // solo `require_b2b_panel_access` — mismo criterio que reporte-diario.
      { path: 'suscripciones',          element: <RequireAuth roles={['admin']}><ChurnPage /></RequireAuth> },
      // CU-O54 (completar-modelo-base): reemplaza el placeholder — FACT_ADQUISICION ya existe.
      { path: 'adquisicion',            element: <AdquisicionPage /> },
      // CU-O73/CU-O74 (monetizacion-retencion-mejoras): también admin-only.
      { path: 'funnel-conversion',      element: <RequireAuth roles={['admin']}><FunnelConversionPage /></RequireAuth> },
      { path: 'pnl',                    element: <RequireAuth roles={['admin']}><PnlPage /></RequireAuth> },
      { path: 'mrr-arr',                element: <RequireAuth roles={['admin']}><MrrArrPage /></RequireAuth> },
      { path: 'partners',               element: <ComingSoonPage section="Partners" description="Rendimiento por partner, SLA de entrega y cobertura de catálogo." /> },
      // CU-O55 (completar-modelo-base): reemplaza el placeholder — FACT_DISPONIBILIDAD ya existe.
      // No confundir con `/distribucion/disponibilidad` (restricción geográfica de reproducción).
      { path: 'disponibilidad',         element: <DisponibilidadInfraPage /> },
      { path: 'ingestas',               element: <ComingSoonPage section="Ingestas" description="Histórico de ETL: volumen, duración, tasa de error y comparativa inter-run." /> },
      // CU-O92/CU-O93 (b2b-tier-access-analitica): paneles predictivos
      // exclusivos Enterprise. El backend gatea con `require_tier("enterprise")`
      // (además de `require_b2b_panel_access` del shell) — no necesitan un
      // `RequireAuth` de rol como reporte-diario/churn (esos son admin-only por
      // `role`, esto es tier B2B por `tipo_plan`, ver TierUpsell para el 403).
      { path: 'proyeccion-genero',      element: <ProyeccionGeneroPage /> },
      { path: 'proyeccion-artista',     element: <ProyeccionArtistaPage /> },
    ],
  },
  {
    path: '/seguridad',
    // Todo lo que cuelga de este shell es admin-only en el backend
    // (require_admin), un solo guard con `roles` alcanza para todo el árbol.
    element: <RequireAuth roles={['admin']}><SeguridadShell /></RequireAuth>,
    children: [
      { index: true,        element: <PermisosPage /> },
      { path: 'usuarios',   element: <UsuariosAdminPage /> },
      { path: 'permisos',   element: <PermisosPage /> },
      { path: 'auditoria',  element: <AuditoriaPage /> },
      { path: 'errores',    element: <ErroresPage /> },
      { path: 'facturacion', element: <AuditoriaFacturacionPage /> },
      { path: 'facturacion/empresa', element: <EmpresaConfigPage /> },
      { path: 'creadores',   element: <RevisionCreadoresPage /> },
      { path: 'social',      element: <ModeracionSocialPage /> },
      { path: 'distribucion', element: <DistribucionAdminPage /> },
      { path: 'catalogo',    element: <AdminTracksPage /> },
      { path: 'suscripciones', element: <AdminSuscripcionesPage /> },
      { path: 'soporte',     element: <TicketsAdminPage /> },
      { path: 'familia',     element: <FamiliaAdminPage /> },
      { path: 'regalias',    element: <RegaliasAdminPage /> },
      { path: 'publicidad',  element: <PublicidadAdminPage /> },
      { path: 'simulacion',  element: <SimulacionPage /> },
      { path: 'finanzas',    element: <FinanzasAdminPage /> },
      // `partners` e `ingesta` viven aquí, no en árboles propios: son
      // herramientas de back-office 100% admin-only (partners: la consola de
      // verificación, no la API en sí — ver packages/partners/README.md;
      // ingesta: gestion_datos, admin-only real en el backend), mismo patrón
      // que facturacion/creadores/social/distribucion ya usan para su propia
      // vista de administración. El guard de rol del shell (línea de arriba)
      // ya cubre estas rutas — no hace falta un RequireAuth por ruta como en
      // reporte-diario (analitica), que sí vive en un shell no admin-only.
      { path: 'partners',              element: <PartnersConsolePage /> },
      { path: 'partners/gestion',      element: <AdminPartnersPage /> },
      { path: 'partners/metricas',     element: <PartnersMetricasPage /> },
      { path: 'ingesta',                element: <EtlPage /> },
      { path: 'ingesta/dimensiones',    element: <CrudDimensionesPage /> },
      { path: 'ingesta/calidad',        element: <DataQualityPage /> },
      // ── Reportes administrativos (S12) ──────────────────────────────────────
      { path: 'reporte-usuarios',       element: <ReporteUsuariosPage /> },
      { path: 'reporte-strikes',        element: <StrikesGlobalPage /> },
      { path: 'reporte-ab-tests',       element: <AbTestsPage /> },
      { path: 'reporte-notificaciones', element: <NotificacionesAdminPage /> },
      { path: 'reporte-familias',       element: <FamiliasReportePage /> },
      { path: 'sesiones-activas',       element: <SesionesActivasPage /> },
      // Reusa el mismo componente que `/analitica/disponibilidad` (CU-O55) —
      // ver comentario en SeguridadShell.tsx. Mismo `lazyNamed` de arriba, no
      // se vuelve a importar el módulo.
      { path: 'disponibilidad',         element: <DisponibilidadInfraPage /> },
    ],
  },
  {
    // Árbol hermano de `/seguridad` (mismo `SeguridadShell`+guard, prefijo de
    // URL distinto): los 30 informes compuestos (S13-P3b) piden vivir bajo
    // `/reportes/...` explícitamente — montar el mismo shell acá en vez de
    // anidarlos bajo `/seguridad/reportes-compuestos/...` conserva el
    // sidebar/chrome admin sin romper esa convención de ruta pedida.
    path: '/reportes',
    element: <RequireAuth roles={['admin']}><SeguridadShell /></RequireAuth>,
    children: [
      { path: ':departamento/:informe', element: <InformeCompuestoPage /> },
    ],
  },
  // Catch-all: sin esto, cualquier URL sin match (typo, enlace viejo) caía en
  // el error boundary por defecto de react-router-dom en vez de una página real.
  { path: '*', element: <NotFoundPage /> },
])
