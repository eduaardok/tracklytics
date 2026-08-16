import { Suspense, useState } from 'react'
import { Outlet, NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Activity, Music, GitCompare, Target, TrendingUp, ListMusic,
  UserPlus, HeartPulse, CalendarDays, UserMinus, Filter, Scale, CircleDollarSign,
  LineChart, AreaChart, PanelLeftClose, PanelLeftOpen, LayoutGrid, Gauge, type LucideIcon,
} from 'lucide-react'
import { RequireSuscripcionActiva } from '@packages/analitica'
// Import directo, no vía el barrel `@packages/seguridad` (arrastraría los
// dashboards con Recharts de ese paquete al chunk de AnalyticaShell).
import { UserMenu } from '@packages/seguridad/components/UserMenu'
import { ThemeToggle } from '@shared/components/ThemeToggle'
// `usePlanActivo` (paquete `suscripciones`) es la única forma de saber el
// tier B2B del cliente en el cliente sin reimplementar la regla de negocio
// (mismo criterio que el resto del gating: reaccionar al estado real, no
// adivinar) — se usa solo para decidir si se muestra la sección "Predictivo"
// de la nav, el gating real sigue viviendo en `require_tier` (backend).
import { usePlanActivo } from '@packages/suscripciones'
import { getUser } from '@shared/lib/session'
import { esSuperadmin } from '@shared/lib/roles'
import { RouteLoadingFallback } from '@shared/components/RouteLoadingFallback'
import { PageTransition } from '@shared/components/PageTransition'
import { ZoneSwitcher } from '@shared/components/ZoneSwitcher'
import { getSidebarCollapsed, setSidebarCollapsed } from '@shared/lib/ui-prefs'
import styles from './AnalyticaShell.module.css'

const ACTIVE_CLS    = `${styles.navItem} ${styles.navActive}`
const INACTIVE_CLS  = styles.navItem

type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean }

// completar-modelo-base: "Adquisición" y "Disponibilidad" salieron de esta
// lista — ya no son placeholders (FACT_ADQUISICION/FACT_DISPONIBILIDAD
// existen), pasan a la nav real de arriba con el mismo gating que el resto.
// monetizacion-retencion-mejoras: "Suscripciones" también sale — pasa a ser
// el dashboard de churn real (admin-only), no un placeholder.
// S13-P5: se dejaron de renderizar como enlaces del sidebar (quedaban
// "pronto" visibles en el menú, se veían vacíos si el cursor pasaba por ahí
// en el video — AUDITORIA_S13.md §6.3). Las rutas siguen existiendo en
// router.tsx (`ComingSoonPage`, accesibles por URL directa) — este array
// se conserva solo como fuente de `COMING_SOON_PATHS`, para que esas dos
// rutas sigan bypasseando `RequireSuscripcionActiva` (no hay nada que
// proteger en un stub sin datos).
const COMING_SOON = [
  { label: 'Partners',       to: '/analitica/partners'       },
  { label: 'Ingestas',       to: '/analitica/ingestas'       },
] as const

const COMING_SOON_PATHS: string[] = COMING_SOON.map(({ to }) => to)

// Nav base, visible para cualquier cliente con acceso al panel de analítica
// (S13-P8: rediseño con iconos + collapse completo, igualando a AppShell).
const NAV_BASE: NavItem[] = [
  { to: '/analitica',                  label: 'Dashboard',      icon: LayoutDashboard, end: true },
  { to: '/analitica/engagement',       label: 'Engagement',     icon: Activity },
  { to: '/analitica/generos',          label: 'Géneros',        icon: Music },
  { to: '/analitica/comparacion',      label: 'Comparación',    icon: GitCompare },
  { to: '/analitica/benchmark',        label: 'Benchmark',      icon: Target },
  { to: '/analitica/tendencias',       label: 'Tendencias',     icon: TrendingUp },
  { to: '/analitica/playlists-top',    label: 'Playlists',      icon: ListMusic },
  { to: '/analitica/adquisicion',      label: 'Adquisición',    icon: UserPlus },
  { to: '/analitica/disponibilidad',   label: 'Salud del sistema', icon: HeartPulse },
]

// Backend exige `require_staff` (role=admin) en /reporte-diario, /churn,
// /funnel-conversion, /pnl y /mrr-arr — se ocultan para el resto en vez de
// mostrar un link que siempre rebota, mismo criterio que el chequeo de rol
// del legacy.
const NAV_STAFF: NavItem[] = [
  { to: '/analitica/reporte-diario',     label: 'Reporte diario',        icon: CalendarDays },
  { to: '/analitica/suscripciones',      label: 'Churn de suscripciones', icon: UserMinus },
  { to: '/analitica/funnel-conversion',  label: 'Funnel de conversión',   icon: Filter },
  { to: '/analitica/pnl',                label: 'P&L consolidado',        icon: Scale },
  { to: '/analitica/mrr-arr',            label: 'MRR / ARR',              icon: CircleDollarSign },
  { to: '/analitica/bsc',                label: 'Balanced Scorecard',      icon: LayoutGrid },
  { to: '/analitica/benchmark-sql',      label: 'Benchmark SQL vs Gold',   icon: Gauge },
]

// Sección "Predictivo" (b2b-tier-access-analitica): visible solo para tier
// Enterprise o admin — se oculta para el resto en vez de mostrar un link que
// siempre rebota con el estado "disponible desde plan Enterprise".
const NAV_PREDICTIVO: NavItem[] = [
  { to: '/analitica/proyeccion-genero',  label: 'Proyección de género',  icon: LineChart },
  { to: '/analitica/proyeccion-artista', label: 'Proyección de artista', icon: AreaChart },
]

export function AnalyticaShell() {
  const location = useLocation()
  const { tipoPlan } = usePlanActivo()
  const [collapsed, setCollapsed] = useState(getSidebarCollapsed)
  // Los stubs "pronto" (incluido /analitica/suscripciones, destino del
  // redirect) no llaman a ningún endpoint gateado por `require_b2b_panel_access`
  // — nada que proteger ahí, y gatearlos causaría un loop de redirect contra
  // su propio destino.
  const sinGating = COMING_SOON_PATHS.includes(location.pathname)
  const user = getUser()
  // FASE 1 (Prompt 10): NAV_STAFF replica `require_staff`/`_es_staff_interno`
  // del backend (api/paquetes/analitica/deps.py) — superadmin únicamente
  // (role==='admin' o fila 'superadmin' vigente en el BRIDGE), NO cualquier
  // admin de área. `getRole() === 'admin'` no reconocía a las cuentas
  // superadmin asignadas por BRIDGE (`role` crudo queda "user"), ocultando
  // "Reporte diario"/"Churn"/etc. pese a tener acceso real.
  const superadmin = esSuperadmin(user)
  const esEnterprise = tipoPlan === 'enterprise' || superadmin
  const esAdmin = superadmin

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev
      setSidebarCollapsed(next)
      return next
    })
  }

  function renderNavItem(item: NavItem) {
    const Icon = item.icon
    return (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.end}
        title={collapsed ? item.label : undefined}
        className={({ isActive }) => isActive ? ACTIVE_CLS : INACTIVE_CLS}
      >
        <Icon size={16} className={styles.navIcon} aria-hidden="true" />
        <span className={styles.navText}>{item.label}</span>
      </NavLink>
    )
  }

  return (
    <div className={styles.shell}>
      <header className={styles.brandBar}>
        <span className={styles.wordmark}>
          <img src="/logo.png" alt="" className={styles.logo} width={24} height={24} />
          <span className={styles.brand}>Tracklytics</span>
          <span className={styles.panelBadge}>panel</span>
        </span>
        <ZoneSwitcher zone="analitica" />
        <ThemeToggle />
        <UserMenu />
      </header>

      <div className={styles.body}>
        <nav className={[styles.sidebar, collapsed ? styles.sidebarCollapsed : ''].join(' ').trim()} aria-label="Navegación analítica">
          <div className={styles.navGroups}>
            {NAV_BASE.map(renderNavItem)}

            {esAdmin && (
              <>
                <div className={styles.divider} role="separator" />
                {NAV_STAFF.map(renderNavItem)}
              </>
            )}

            {esEnterprise && (
              <>
                <div className={styles.divider} role="separator" />
                {NAV_PREDICTIVO.map(renderNavItem)}
              </>
            )}
          </div>

          <button
            type="button"
            className={styles.collapseBtn}
            onClick={toggleCollapsed}
            title={collapsed ? 'Expandir navegación' : 'Colapsar navegación'}
            aria-label={collapsed ? 'Expandir navegación' : 'Colapsar navegación'}
            aria-pressed={collapsed}
          >
            {collapsed ? <PanelLeftOpen size={18} aria-hidden="true" /> : <PanelLeftClose size={18} aria-hidden="true" />}
            <span className={styles.navText}>Colapsar</span>
          </button>
        </nav>

        <main className={styles.main}>
          <div className={styles.content}>
            {/* Suspense único para todo el árbol: las páginas de /analitica se
                cargan con React.lazy (ver router.tsx) por el peso de Recharts
                — un solo boundary aquí cubre cualquier página hija, en vez de
                envolver cada `element` del route config individualmente. */}
            <Suspense fallback={<RouteLoadingFallback />}>
              <PageTransition>
                {sinGating ? (
                  <Outlet />
                ) : (
                  <RequireSuscripcionActiva>
                    <Outlet />
                  </RequireSuscripcionActiva>
                )}
              </PageTransition>
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  )
}
