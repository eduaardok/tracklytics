import { lazy, Suspense, type ComponentType } from 'react'
import { createBrowserRouter } from 'react-router-dom'
// Import directo (no vía el barrel `@app/layout`): ese índice también
// re-exporta `AnalyticaShell` de forma estática — importar cualquier cosa de
// él arrastraría ese módulo (y Recharts con él) de vuelta al bundle
// principal, anulando el `lazyNamed` de abajo.
import { AppShell } from '@app/layout/AppShell'
import { SeguridadShell } from '@app/layout/SeguridadShell'
import { RouteLoadingFallback } from '@shared/components/RouteLoadingFallback'
import { CatalogPage, TrackDetailPage, ArtistDetailPage, AlbumDetailPage, BibliotecaPage } from '@packages/catalogo'
import { PermisosPage, AuditoriaPage, ErroresPage, LoginPage, RegisterPage, ProfilePage, RequireAuth } from '@packages/seguridad'
import { FacturacionPage, AuditoriaFacturacionPage } from '@packages/facturacion'
import { PlanesPage } from '@packages/suscripciones'
import { CuentaArtistaPage, RevisionCreadoresPage } from '@packages/creadores'
import { SeguidosSocialPage, ArtistaSocialPage, TrackSocialPage, ModeracionSocialPage } from '@packages/social'
import { DistribucionAdminPage, DisponibilidadPage } from '@packages/distribucion'
import { PartnersConsolePage, PartnersMetricasPage } from '@packages/partners'
import { SoportePage, TicketsAdminPage, FamiliaAdminPage } from '@packages/experiencia'

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
const TopTracksPlaylistsPage  = lazyNamed(() => import('@packages/experiencia/pages/TopTracksPlaylistsPage'), 'TopTracksPlaylistsPage')

// `ingesta/DataQualityPage` también usa Recharts (donut de distribución por
// origen) — mismo motivo que arriba, se saca del bundle principal. EtlPage/
// CrudDimensionesPage no lo necesitan pero se lazy-loadean igual por
// consistencia: son admin-only, nunca están en el camino crítico de carga.
const EtlPage             = lazyNamed(() => import('@packages/ingesta/pages/EtlPage'), 'EtlPage')
const CrudDimensionesPage = lazyNamed(() => import('@packages/ingesta/pages/CrudDimensionesPage'), 'CrudDimensionesPage')
const DataQualityPage     = lazyNamed(() => import('@packages/ingesta/pages/DataQualityPage'), 'DataQualityPage')

export const router = createBrowserRouter([
  { path: '/login',    element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  {
    path: '/',
    element: <AppShell />,
    children: [
      // ── B2C ─────────────────────────────────────────────────────────────────
      // Catálogo: navegación pública, sin sesión (mismo criterio que el
      // backend, api/paquetes/catalogo/router.py no gatea ningún endpoint).
      { index: true,        element: <CatalogPage /> },
      { path: 'catalog',    element: <CatalogPage /> },
      { path: 'catalogo/track/:factId',      element: <TrackDetailPage /> },
      { path: 'catalogo/artista/:artistaId', element: <ArtistDetailPage /> },
      { path: 'catalogo/album/:albumId',     element: <AlbumDetailPage /> },
      // Biblioteca personal (favoritos/playlists/historial): requiere sesión
      // (`require_b2c_user` en /biblioteca/*, backend ya archivado).
      { path: 'biblioteca',  element: <RequireAuth><BibliotecaPage /></RequireAuth> },
      { path: 'perfil',      element: <RequireAuth><ProfilePage /></RequireAuth> },
      // El resto requiere sesión — sus endpoints dependen de `get_current_user`
      // o `require_b2c_user` en el backend, y hasta ahora el guard nunca se
      // aplicaba del lado del cliente.
      { path: 'facturacion', element: <RequireAuth><FacturacionPage /></RequireAuth> },
      { path: 'suscripciones', element: <RequireAuth><PlanesPage /></RequireAuth> },
      { path: 'creadores',   element: <RequireAuth><CuentaArtistaPage /></RequireAuth> },
      { path: 'social',                element: <RequireAuth><SeguidosSocialPage /></RequireAuth> },
      { path: 'social/artista/:artistaId', element: <RequireAuth><ArtistaSocialPage /></RequireAuth> },
      { path: 'social/track/:factId',      element: <RequireAuth><TrackSocialPage /></RequireAuth> },
      { path: 'distribucion/disponibilidad', element: <RequireAuth><DisponibilidadPage /></RequireAuth> },
      { path: 'soporte',     element: <RequireAuth><SoportePage /></RequireAuth> },
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
      { path: 'suscripciones',          element: <ComingSoonPage section="Suscripciones" description="Métricas de planes activos, conversiones B2C/B2B y retención por cohorte." /> },
      // CU-O54 (completar-modelo-base): reemplaza el placeholder — FACT_ADQUISICION ya existe.
      { path: 'adquisicion',            element: <AdquisicionPage /> },
      { path: 'partners',               element: <ComingSoonPage section="Partners" description="Rendimiento por partner, SLA de entrega y cobertura de catálogo." /> },
      // CU-O55 (completar-modelo-base): reemplaza el placeholder — FACT_DISPONIBILIDAD ya existe.
      // No confundir con `/distribucion/disponibilidad` (restricción geográfica de reproducción).
      { path: 'disponibilidad',         element: <DisponibilidadInfraPage /> },
      { path: 'ingestas',               element: <ComingSoonPage section="Ingestas" description="Histórico de ETL: volumen, duración, tasa de error y comparativa inter-run." /> },
    ],
  },
  {
    path: '/seguridad',
    // Todo lo que cuelga de este shell es admin-only en el backend
    // (require_admin), un solo guard con `roles` alcanza para todo el árbol.
    element: <RequireAuth roles={['admin']}><SeguridadShell /></RequireAuth>,
    children: [
      { index: true,        element: <PermisosPage /> },
      { path: 'permisos',   element: <PermisosPage /> },
      { path: 'auditoria',  element: <AuditoriaPage /> },
      { path: 'errores',    element: <ErroresPage /> },
      { path: 'facturacion', element: <AuditoriaFacturacionPage /> },
      { path: 'creadores',   element: <RevisionCreadoresPage /> },
      { path: 'social',      element: <ModeracionSocialPage /> },
      { path: 'distribucion', element: <DistribucionAdminPage /> },
      { path: 'soporte',     element: <TicketsAdminPage /> },
      { path: 'familia',     element: <FamiliaAdminPage /> },
      // `partners` e `ingesta` viven aquí, no en árboles propios: son
      // herramientas de back-office 100% admin-only (partners: la consola de
      // verificación, no la API en sí — ver packages/partners/README.md;
      // ingesta: gestion_datos, admin-only real en el backend), mismo patrón
      // que facturacion/creadores/social/distribucion ya usan para su propia
      // vista de administración. El guard de rol del shell (línea de arriba)
      // ya cubre estas rutas — no hace falta un RequireAuth por ruta como en
      // reporte-diario (analitica), que sí vive en un shell no admin-only.
      { path: 'partners',              element: <PartnersConsolePage /> },
      { path: 'partners/metricas',     element: <PartnersMetricasPage /> },
      { path: 'ingesta',                element: <EtlPage /> },
      { path: 'ingesta/dimensiones',    element: <CrudDimensionesPage /> },
      { path: 'ingesta/calidad',        element: <DataQualityPage /> },
    ],
  },
])
