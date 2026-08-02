import { Suspense, useState } from 'react'
import { Outlet, NavLink, useLocation } from 'react-router-dom'
import {
  Users, KeyRound, FileSearch, AlertTriangle, Radio, Flag,
  TrendingUp, Receipt, Building2, CreditCard, Coins, Megaphone, Wallet, FlaskConical,
  Music, Mic2, Globe, Disc3, MessagesSquare,
  Sparkles, LifeBuoy, Users2, GitBranch, Bell, Activity,
  Database, Handshake, UserCog, BarChart3, Table2, CheckCircle2,
  FileBarChart, PanelLeftClose, PanelLeftOpen, type LucideIcon,
} from 'lucide-react'
// Import directo, no vía el barrel `@packages/seguridad` (arrastraría los
// dashboards con Recharts de ese paquete al bundle principal — ver router.tsx).
import { UserMenu } from '@packages/seguridad/components/UserMenu'
import { RouteLoadingFallback } from '@shared/components/RouteLoadingFallback'
import { ZoneSwitcher } from '@shared/components/ZoneSwitcher'
import { getAdminSectionsOpen, setAdminSectionOpen, getSidebarCollapsed, setSidebarCollapsed } from '@shared/lib/ui-prefs'
// SOLO metadata de navegación (sin `render`/plantillas/Recharts) — importar
// `@packages/reportes/config` (el registro completo) desde acá arrastraría
// Recharts al bundle principal, porque `SeguridadShell` se importa eager en
// `router.tsx` (no es lazy). Ver docs/BITACORA_S13.md, "bug de bundle 1MB".
import { DEPARTAMENTOS_NAV } from '@packages/reportes/config/informesNav'
import styles from './SeguridadShell.module.css'

const ACTIVE_CLS   = `${styles.navItem} ${styles.navActive}`
const INACTIVE_CLS = styles.navItem

type Link = { to: string; label: string; icon: LucideIcon; end?: boolean }

type Seccion = {
  label: string
  icon: LucideIcon
  paths: string[]
  links: Link[]
}

// Secciones colapsables (S13-P8: rediseño con iconos + collapse completo,
// igualando las capacidades de AppShell — ver BITACORA_S13.md). Reagrupa las
// 30 rutas reales de `/seguridad/*` (inventario verificado contra router.tsx,
// ninguna quedó huérfana) en 6 grupos temáticos — incluye `Finanzas` y
// `Simulación`, que no estaban en la propuesta orientativa del pedido pero sí
// existen como rutas reales. "Seguridad" pasa a ser una sección colapsable
// más (antes eran 4 links sueltos sin agrupar, S12) por consistencia con el
// resto — mismo criterio "ninguna ruta fuera de un grupo" pedido en S13-P8.
const SECCIONES: Seccion[] = [
  {
    label: 'Seguridad',
    icon: Users,
    paths: ['/seguridad/usuarios', '/seguridad/permisos', '/seguridad/auditoria', '/seguridad/errores', '/seguridad/sesiones-activas', '/seguridad/reporte-strikes'],
    links: [
      { to: '/seguridad/usuarios', label: 'Usuarios', icon: Users },
      { to: '/seguridad/permisos', label: 'Permisos', icon: KeyRound },
      { to: '/seguridad/auditoria', label: 'Auditoría', icon: FileSearch },
      { to: '/seguridad/errores', label: 'Errores', icon: AlertTriangle },
      { to: '/seguridad/sesiones-activas', label: 'Sesiones activas', icon: Radio },
      { to: '/seguridad/reporte-strikes', label: 'Strikes', icon: Flag },
    ],
  },
  {
    label: 'Comercial',
    icon: TrendingUp,
    paths: ['/seguridad/facturacion', '/seguridad/suscripciones', '/seguridad/regalias', '/seguridad/publicidad', '/seguridad/finanzas', '/seguridad/simulacion'],
    links: [
      { to: '/seguridad/facturacion', label: 'Facturación', icon: Receipt, end: true },
      { to: '/seguridad/facturacion/empresa', label: 'Info. empresa', icon: Building2 },
      { to: '/seguridad/suscripciones', label: 'Suscripciones', icon: CreditCard },
      { to: '/seguridad/regalias', label: 'Regalías', icon: Coins },
      { to: '/seguridad/publicidad', label: 'Publicidad', icon: Megaphone },
      { to: '/seguridad/finanzas', label: 'Finanzas', icon: Wallet },
      { to: '/seguridad/simulacion', label: 'Simulación', icon: FlaskConical },
    ],
  },
  {
    label: 'Contenido',
    icon: Music,
    paths: ['/seguridad/creadores', '/seguridad/distribucion', '/seguridad/catalogo', '/seguridad/social'],
    links: [
      { to: '/seguridad/creadores', label: 'Creadores', icon: Mic2 },
      { to: '/seguridad/distribucion', label: 'Distribución', icon: Globe },
      { to: '/seguridad/catalogo', label: 'Catálogo · Takedown', icon: Disc3 },
      { to: '/seguridad/social', label: 'Moderación social', icon: MessagesSquare },
    ],
  },
  {
    label: 'Producto',
    icon: Sparkles,
    paths: ['/seguridad/soporte', '/seguridad/familia', '/seguridad/reporte-ab-tests', '/seguridad/reporte-notificaciones', '/seguridad/disponibilidad'],
    links: [
      { to: '/seguridad/soporte', label: 'Tickets soporte', icon: LifeBuoy },
      { to: '/seguridad/familia', label: 'Plan familiar', icon: Users2 },
      { to: '/seguridad/reporte-ab-tests', label: 'Pruebas A/B', icon: GitBranch },
      { to: '/seguridad/reporte-notificaciones', label: 'Notificaciones', icon: Bell },
      // Reusa `DisponibilidadInfraPage` (CU-O55, `/analitica/disponibilidad`)
      // — mismo componente y endpoint, sin tier gate propio, solo un
      // segundo punto de entrada para el panel de reportes admin.
      { to: '/seguridad/disponibilidad', label: 'Disponibilidad', icon: Activity },
    ],
  },
  {
    label: 'Datos y Partners',
    icon: Database,
    paths: ['/seguridad/partners', '/seguridad/ingesta'],
    links: [
      { to: '/seguridad/partners', label: 'Partners', icon: Handshake, end: true },
      { to: '/seguridad/partners/gestion', label: 'Gestión de partners', icon: UserCog },
      { to: '/seguridad/partners/metricas', label: 'Métricas de partners', icon: BarChart3 },
      { to: '/seguridad/ingesta', label: 'Ingesta ETL', icon: Database, end: true },
      { to: '/seguridad/ingesta/dimensiones', label: 'Dimensiones', icon: Table2 },
      { to: '/seguridad/ingesta/calidad', label: 'Calidad de datos', icon: CheckCircle2 },
    ],
  },
  {
    label: 'Reportes',
    icon: FileBarChart,
    paths: ['/seguridad/reporte-usuarios', '/seguridad/reporte-familias'],
    links: [
      { to: '/seguridad/reporte-usuarios', label: 'Usuarios', icon: Users },
      { to: '/seguridad/reporte-familias', label: 'Familias', icon: Users2 },
    ],
  },
]

function useToggle(clave: string, defaultOpen: boolean) {
  const [open, setOpen] = useState(defaultOpen)
  function toggle() {
    setOpen((o) => {
      const next = !o
      setAdminSectionOpen(clave, next)
      return next
    })
  }
  return { open, toggle }
}

// `collapsed` (sidebar entero reducido a solo iconos, S13-P8) hace bypass del
// plegado por sección: no hay espacio para chevron+label de sección en 64px,
// así que en ese modo se listan los links de TODAS las secciones directo,
// como un único riel de iconos (mismo criterio que AppShell, que no tiene
// niveles de sección) — el estado abierto/cerrado de cada sección se conserva
// en localStorage y vuelve a aplicarse tal cual al expandir de nuevo.
function SidebarSection({ seccion, defaultOpen, extra, collapsed }: { seccion: Seccion; defaultOpen: boolean; extra?: React.ReactNode; collapsed: boolean }) {
  const { open, toggle } = useToggle(seccion.label, defaultOpen)
  const Icon = seccion.icon
  const mostrarLinks = collapsed || open

  return (
    <div>
      {!collapsed && (
        <div
          className={styles.sectionHeader}
          onClick={toggle}
          role="button"
          tabIndex={0}
          aria-expanded={open}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              toggle()
            }
          }}
        >
          <span className={styles.sectionHeaderLabel}>
            <Icon size={14} className={styles.sectionIcon} aria-hidden="true" />
            <span>{seccion.label}</span>
          </span>
          <span className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`} aria-hidden="true">▸</span>
        </div>
      )}
      {/* `informesComposuestosLinks` (max-height más alto, para caber los 30
          informes anidados) reemplaza a `sectionLinksOpen`, no se suma aparte
          de `mostrarLinks` — antes se aplicaba con solo comprobar `extra`,
          sin mirar el estado abierto/cerrado, así que "Reportes" (la única
          sección con `extra`) quedaba SIEMPRE con max-height:2000px sin
          importar el toggle: el chevron rotaba pero el contenido nunca se
          ocultaba. Bug real, heredado de S13-P3b (no introducido en S13-P8),
          reportado por el usuario ("lo despliego y no pasa nada"). */}
      <div className={`${styles.sectionLinks} ${mostrarLinks ? (extra && !collapsed ? styles.informesComposuestosLinks : styles.sectionLinksOpen) : ''}`}>
        {seccion.links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            title={collapsed ? link.label : undefined}
            className={({ isActive }) => isActive ? ACTIVE_CLS : INACTIVE_CLS}
          >
            <link.icon size={16} className={styles.navIcon} aria-hidden="true" />
            <span className={styles.navText}>{link.label}</span>
          </NavLink>
        ))}
        {!collapsed && extra}
      </div>
    </div>
  )
}

// Submenú anidado "Informes Compuestos" (S13-P3b) — 9 departamentos, cada
// uno colapsable por separado, dentro de la sección "Reportes" ya existente.
// No se renderiza en modo `collapsed` (S13-P8): 30 rutas hoja no caben como
// riel de iconos, y no hay un índice único al que un solo ícono pudiera
// llevar — se navega a esta sección expandiendo el sidebar completo.
function InformesCompuestosMenu() {
  const location = useLocation()
  const { open, toggle } = useToggle(
    'Informes Compuestos',
    DEPARTAMENTOS_NAV.some((d) => location.pathname.startsWith(`/reportes/${d.slug}`)),
  )

  return (
    <div>
      <div
        className={styles.subSectionHeader}
        onClick={toggle}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle() } }}
      >
        <span>Informes Compuestos</span>
        <span className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`} aria-hidden="true">▸</span>
      </div>
      <div className={`${styles.subSectionLinks} ${open ? styles.informesComposuestosLinks : ''}`}>
        {DEPARTAMENTOS_NAV.map((depto) => (
          <DepartamentoSubSection key={depto.slug} slug={depto.slug} label={depto.label} informes={depto.informes} />
        ))}
      </div>
    </div>
  )
}

function DepartamentoSubSection({ slug, label, informes }: { slug: string; label: string; informes: { informe: string; codigo: string; labelCorto: string }[] }) {
  const location = useLocation()
  const { open, toggle } = useToggle(
    `Informes Compuestos > ${label}`,
    location.pathname.startsWith(`/reportes/${slug}`),
  )

  return (
    <div>
      <div
        className={styles.subSectionHeader}
        onClick={toggle}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle() } }}
      >
        <span>{label} ({informes.length})</span>
        <span className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`} aria-hidden="true">▸</span>
      </div>
      <div className={`${styles.subSectionLinks} ${open ? styles.subSectionLinksOpen : ''}`}>
        {informes.map((inf) => (
          <NavLink
            key={inf.informe}
            to={`/reportes/${slug}/${inf.informe}`}
            className={({ isActive }) => isActive ? ACTIVE_CLS : INACTIVE_CLS}
          >
            {inf.codigo} · {inf.labelCorto}
          </NavLink>
        ))}
      </div>
    </div>
  )
}

export function SeguridadShell() {
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(getSidebarCollapsed)

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev
      setSidebarCollapsed(next)
      return next
    })
  }

  return (
    <div className={styles.shell}>
      <header className={styles.brandBar}>
        <span className={styles.wordmark}>
          <img src="/logo.png" alt="" className={styles.logo} width={24} height={24} />
          <span className={styles.brand}>Tracklytics</span>
          <span className={styles.panelBadge}>admin</span>
        </span>
        <ZoneSwitcher zone="administracion" />
        <UserMenu />
      </header>

      <div className={styles.body}>
        <nav className={[styles.sidebar, collapsed ? styles.sidebarCollapsed : ''].join(' ').trim()} aria-label="Navegación de seguridad">
          <div className={styles.navGroups}>
            {SECCIONES.map((seccion) => (
              <SidebarSection
                key={seccion.label}
                seccion={seccion}
                collapsed={collapsed}
                defaultOpen={
                  seccion.paths.some((p) => location.pathname.startsWith(p))
                  || (seccion.label === 'Reportes' && location.pathname.startsWith('/reportes'))
                }
                extra={seccion.label === 'Reportes' ? <InformesCompuestosMenu /> : undefined}
              />
            ))}
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
            {/* `ingesta` (EtlPage/CrudDimensionesPage/DataQualityPage) es lazy
                — DataQualityPage arrastra Recharts, mismo motivo que
                AnalyticaShell. Un solo Suspense cubre las 3. */}
            <Suspense fallback={<RouteLoadingFallback />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  )
}
