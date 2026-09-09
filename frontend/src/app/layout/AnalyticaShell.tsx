import { Suspense, useEffect, useMemo, useState } from 'react'
import { Outlet, NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Activity, Music, GitCompare, Target, TrendingUp, ListMusic,
  UserPlus, HeartPulse, CalendarDays, UserMinus, Filter, Scale, CircleDollarSign,
  LineChart, AreaChart, PanelLeftClose, PanelLeftOpen, LayoutGrid, Gauge, Building2,
  UploadCloud, type LucideIcon,
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
import { usePlanActivo } from '@packages/suscripciones/hooks/usePlanActivo'
import { getUser } from '@shared/lib/session'
import { esSuperadmin } from '@shared/lib/roles'
import { RouteLoadingFallback } from '@shared/components/RouteLoadingFallback'
import { PageTransition } from '@shared/components/PageTransition'
import { ZoneSwitcher } from '@shared/components/ZoneSwitcher'
import { SidebarSection } from '@shared/components/SidebarSection'
import { AreaSwitcher } from '@shared/components/AreaSwitcher'
import { useExclusiveAccordion } from '@shared/hooks/useExclusiveAccordion'
import { getSidebarCollapsed, setSidebarCollapsed, getSuperadminArea, setSuperadminArea } from '@shared/lib/ui-prefs'
import { MobileSidebarOverlay } from '@shared/components/MobileSidebarOverlay'
import styles from './AnalyticaShell.module.css'

const ACTIVE_CLS    = `${styles.navItem} ${styles.navActive}`
const INACTIVE_CLS  = styles.navItem

type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean }

// completar-modelo-base: "Adquisición" y "Disponibilidad" salieron de esta
// lista — ya no son placeholders (FACT_ADQUISICION/FACT_DISPONIBILIDAD
// existen), pasan a la nav real de arriba con el mismo gating que el resto.
// monetizacion-retencion-mejoras: "Suscripciones" también sale — pasa a ser
// el dashboard de churn real (admin-only), no un placeholder.
// S17: "Partners" e "Ingestas" también dejaron de ser placeholders
// (`PartnersAnaliticaPage`/`IngestasAnaliticaPage`, ambas admin-only) — pasan
// a NAV_OPERATIVO/NAV_HERRAMIENTAS más abajo con el mismo gating que el resto
// (RequireSuscripcionActiva normal, admin bypassa igual que cualquier otra
// ruta de este árbol). El bypass `COMING_SOON_PATHS` que existía para estos
// dos stubs sin datos ya no aplica — se elimina junto con ellos.

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

// Nivel 2 de navegación (rediseño de dos niveles): los 8 ítems que antes
// vivían en un único `NAV_STAFF` sin agrupar (`require_staff`/admin-only en
// el backend, api/paquetes/analitica/deps.py) se reparten en 3 grupos por
// criterio de negocio — Operativo (consumo diario del staff), Táctico
// (seguimiento periódico) y Herramientas (soporte técnico interno) — cada
// uno colapsable por separado. El gating de cada ítem individual no cambia:
// sigue siendo exactamente `esAdmin` (superadmin), solo se reorganiza la
// presentación.
const NAV_OPERATIVO: NavItem[] = [
  { to: '/analitica/reporte-diario', label: 'Reporte diario', icon: CalendarDays },
  { to: '/analitica/partners',       label: 'Partners',       icon: Building2 },
]

const NAV_TACTICO: NavItem[] = [
  { to: '/analitica/suscripciones',     label: 'Churn de suscripciones', icon: UserMinus },
  { to: '/analitica/funnel-conversion', label: 'Funnel de conversión',   icon: Filter },
  { to: '/analitica/pnl',               label: 'P&L consolidado',        icon: Scale },
  { to: '/analitica/mrr-arr',           label: 'MRR / ARR',              icon: CircleDollarSign },
]

const NAV_HERRAMIENTAS: NavItem[] = [
  { to: '/analitica/benchmark-sql', label: 'Benchmark SQL vs Gold', icon: Gauge },
  { to: '/analitica/ingestas',      label: 'Ingestas',              icon: UploadCloud },
]

// Grupo "Estratégico": BSC (`require_staff`, admin-only) + Predictivo
// (b2b-tier-access-analitica, tier Enterprise) — comparten grupo porque
// ambos son de horizonte largo/one-off, aunque su gating de backend sea
// distinto. El GRUPO se muestra si el usuario cumple cualquiera de los dos
// criterios (esAdmin || esEnterprise, ver más abajo) — pero como
// `esEnterprise` ya incluye a `esAdmin` (superadmin siempre es "enterprise
// implícito"), un cliente B2B tier Enterprise sin ser admin vería el grupo
// completo si BSC no se filtrara aparte: BSC solo respondería 403 para esa
// cuenta. Por eso BSC se filtra con su propio guard (`esAdmin`) en vez de
// vivir en el array base — "cada ítem sigue respetando su propio guard de
// ruta sin cambios" (mismo gating exacto que tenía en `NAV_STAFF` antes de
// este rediseño).
const NAV_PREDICTIVO: NavItem[] = [
  { to: '/analitica/proyeccion-genero',  label: 'Proyección de género',   icon: LineChart },
  { to: '/analitica/proyeccion-artista', label: 'Proyección de artista',  icon: AreaChart },
]

const ITEM_BSC: NavItem = { to: '/analitica/bsc', label: 'Balanced Scorecard', icon: LayoutGrid }

export function AnalyticaShell() {
  const location = useLocation()
  const { tipoPlan } = usePlanActivo()
  const [collapsed, setCollapsed] = useState(getSidebarCollapsed)
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
  const [superadminArea, setSuperadminAreaState] = useState(getSuperadminArea)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  function handleAreaSelect(area: string | null) {
    setSuperadminAreaState(area)
    setSuperadminArea(area)
  }

  // Mismo criterio que MobileNavDrawer en AppShell.tsx: cierra el overlay al
  // navegar y si la ventana crece más allá del breakpoint (ej. rotar una
  // tablet), bloquea el scroll del body mientras está abierto, y cierra con
  // Escape.
  useEffect(() => { setMobileNavOpen(false) }, [location.pathname])

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 769px)')
    function onChange(e: MediaQueryListEvent) { if (e.matches) setMobileNavOpen(false) }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    document.body.style.overflow = mobileNavOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [mobileNavOpen])

  useEffect(() => {
    if (!mobileNavOpen) return
    function onKeyDown(e: KeyboardEvent) { if (e.key === 'Escape') setMobileNavOpen(false) }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [mobileNavOpen])

  // Nivel 2: grupos colapsables visibles según el mismo gating que ya tenían
  // sus ítems (esAdmin para Operativo/Táctico/Herramientas). "Estratégico" se
  // muestra con esAdmin || esEnterprise, pero BSC dentro del grupo sigue
  // exigiendo esAdmin en particular (ver comentario de `ITEM_BSC`) — sin
  // este filtro por ítem, un cliente Enterprise no-admin vería un link a BSC
  // que el backend rechaza con 403. Para superadmin, additionally filtra
  // por área seleccionada en el selector "Viendo como".
  const groups = useMemo(() => {
    const allGroups = [
      { key: 'operativo',    label: 'Operativo',    items: NAV_OPERATIVO,      visible: esAdmin },
      { key: 'tactico',      label: 'Táctico',      items: NAV_TACTICO,        visible: esAdmin },
      { key: 'estrategico',  label: 'Estratégico',  items: [...(esAdmin ? [ITEM_BSC] : []), ...NAV_PREDICTIVO], visible: esAdmin || esEnterprise },
      { key: 'herramientas', label: 'Herramientas', items: NAV_HERRAMIENTAS,   visible: esAdmin },
    ]
    return allGroups
      .filter((g) => g.visible)
      .filter((g) => !superadmin || !superadminArea || g.label === superadminArea)
  }, [esAdmin, esEnterprise, superadmin, superadminArea])

  const activeGroupKey = groups.find((g) => g.items.some((i) => location.pathname === i.to || location.pathname.startsWith(`${i.to}/`)))?.key ?? null
  const { openGroup, toggle } = useExclusiveAccordion('analitica-sidebar-open-group', activeGroupKey)

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev
      setSidebarCollapsed(next)
      return next
    })
  }

  // `mobile`: el overlay a pantalla completa (MobileSidebarOverlay) siempre
  // renderiza la variante expandida — el estado `collapsed` (a 64px) es una
  // preferencia de sidebar sticky de escritorio sin sentido dentro de un
  // panel a pantalla completa (ver design.md, Risks/Trade-offs).
  function renderNavItem(item: NavItem, mobile: boolean) {
    const Icon = item.icon
    const itemCollapsed = collapsed && !mobile
    return (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.end}
        title={itemCollapsed ? item.label : undefined}
        className={({ isActive }) => isActive ? ACTIVE_CLS : INACTIVE_CLS}
      >
        <Icon size={16} className={styles.navIcon} aria-hidden="true" />
        <span className={styles.navText}>{item.label}</span>
      </NavLink>
    )
  }

  // Contenido del sidebar compartido entre la variante sticky de escritorio
  // y el overlay móvil — mismo cálculo de `groups`/`superadminArea` para las
  // dos superficies, sin una segunda lista que pueda desincronizarse.
  function renderSidebarGroups(mobile: boolean) {
    const effectiveCollapsed = collapsed && !mobile
    return (
      <div className={styles.navGroups}>
        {/* Consumo diario, siempre visible sin colapsar (nivel 2, grupo
            base) — el resto de los grupos son acciones ocasionales. */}
        {NAV_BASE.map((item) => renderNavItem(item, mobile))}

        {superadmin && !effectiveCollapsed && (
          <AreaSwitcher
            areas={['Operativo', 'Táctico', 'Estratégico', 'Herramientas']}
            selected={superadminArea}
            onSelect={handleAreaSelect}
          />
        )}

        {groups.map((g) => (
          <SidebarSection
            key={g.key}
            label={g.label}
            open={openGroup === g.key}
            collapsed={effectiveCollapsed}
            onToggle={() => toggle(g.key)}
          >
            {g.items.map((item) => renderNavItem(item, mobile))}
          </SidebarSection>
        ))}
      </div>
    )
  }

  return (
    <div className={styles.shell}>
      <header className={styles.brandBar}>
        <button
          type="button"
          className={styles.hamburger}
          aria-label="Abrir navegación"
          aria-expanded={mobileNavOpen}
          onClick={() => setMobileNavOpen(true)}
        >
          <span /><span /><span />
        </button>
        <ZoneSwitcher currentZone="analitica" badge="panel" />
        <ThemeToggle />
        <UserMenu />
      </header>

      <div className={styles.body}>
        <nav className={[styles.sidebar, collapsed ? styles.sidebarCollapsed : ''].join(' ').trim()} aria-label="Navegación analítica">
          {renderSidebarGroups(false)}

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

        <MobileSidebarOverlay open={mobileNavOpen} onClose={() => setMobileNavOpen(false)}>
          <nav className={[styles.sidebar, styles.sidebarMobile].join(' ')} aria-label="Navegación analítica (móvil)">
            {renderSidebarGroups(true)}
          </nav>
        </MobileSidebarOverlay>

        <main className={styles.main}>
          <div className={styles.content}>
            {/* Suspense único para todo el árbol: las páginas de /analitica se
                cargan con React.lazy (ver router.tsx) por el peso de Recharts
                — un solo boundary aquí cubre cualquier página hija, en vez de
                envolver cada `element` del route config individualmente. */}
            <Suspense fallback={<RouteLoadingFallback />}>
              <PageTransition>
                <RequireSuscripcionActiva>
                  <Outlet />
                </RequireSuscripcionActiva>
              </PageTransition>
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  )
}
