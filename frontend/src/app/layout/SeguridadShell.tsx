import { Suspense, useMemo, useState } from 'react'
import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { getUser } from '@shared/lib/session'
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
import { ThemeToggle } from '@shared/components/ThemeToggle'
import { RouteLoadingFallback } from '@shared/components/RouteLoadingFallback'
import { PageTransition } from '@shared/components/PageTransition'
import { ZoneSwitcher } from '@shared/components/ZoneSwitcher'
import { SidebarSection } from '@shared/components/SidebarSection'
import { AreaSwitcher } from '@shared/components/AreaSwitcher'
import { useExclusiveAccordion } from '@shared/hooks/useExclusiveAccordion'
import { setAdminSectionOpen, getSidebarCollapsed, setSidebarCollapsed, getSuperadminArea, setSuperadminArea } from '@shared/lib/ui-prefs'
// SOLO metadata de navegación (sin `render`/plantillas/Recharts) — importar
// `@packages/reportes/config` (el registro completo) desde acá arrastraría
// Recharts al bundle principal, porque `SeguridadShell` se importa eager en
// `router.tsx` (no es lazy). Ver docs/BITACORA_S13.md, "bug de bundle 1MB".
import { DEPARTAMENTOS_NAV } from '@packages/reportes/config/informesNav'
import { rolesDeUsuario, puedeVer, esSuperadmin } from '@shared/lib/roles'
import { RoleBadge } from '@shared/components/RoleBadge'
import styles from './SeguridadShell.module.css'

const ACTIVE_CLS   = `${styles.navItem} ${styles.navActive}`
const INACTIVE_CLS = styles.navItem

// `roles` ausente = visible para cualquier admin (comportamiento histórico).
// Con `roles`, superadmin siempre pasa; el resto exige tener alguno de esos
// roles de área — mismo mapeo departamento→rol verificado por curl real en
// docs/CUENTAS_DEMO.md y `api/paquetes/reportes/deps.py` (única fuente de
// verdad de gating; ver `puedeVer` en shared/lib/roles.ts).
type Link = { to: string; label: string; icon: LucideIcon; end?: boolean; roles?: string[] }

type Seccion = {
  label: string
  icon: LucideIcon
  paths: string[]
  links: Link[]
  roles?: string[]
}

// Departamento (slug de DEPARTAMENTOS_NAV) → rol administrativo, calcado 1:1
// de `api/paquetes/reportes/deps.py` (`require_<depto>`) — filtrar el
// sidebar por esto evita mostrar un link a un informe que el backend
// rechazaría con 403 igual (mismo espíritu que el resto de este archivo:
// la autorización real vive en el backend, esto es solo no mostrar lo que
// de todos modos no se puede abrir).
const DEPTO_ROLES: Record<string, string[]> = {
  comercial:  ['admin_comercial'],
  tecnologia: ['admin_datos'],
  financiero: ['admin_finanzas'],
  datos:      ['admin_datos'],
  analitica:  ['admin_datos'],
  contenido:  ['admin_contenido'],
  comunidad:  ['admin_comunidad'],
  seguridad:  ['superadmin'],
  producto:   ['admin_comunidad'],
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
    // Todo el bloque es `require_admin` (superadmin) en el backend salvo
    // Strikes (`GET /admin/strikes` usa `require_comunidad_admin`,
    // api/paquetes/seguridad/router.py:1015) — moderación de comunidad, no
    // "seguridad" en sentido estricto, aunque viva en este endpoint.
    links: [
      { to: '/seguridad/usuarios', label: 'Usuarios', icon: Users, roles: ['superadmin'] },
      { to: '/seguridad/permisos', label: 'Permisos', icon: KeyRound, roles: ['superadmin'] },
      { to: '/seguridad/auditoria', label: 'Auditoría', icon: FileSearch, roles: ['superadmin'] },
      { to: '/seguridad/errores', label: 'Errores', icon: AlertTriangle, roles: ['superadmin'] },
      { to: '/seguridad/sesiones-activas', label: 'Sesiones activas', icon: Radio, roles: ['superadmin'] },
      { to: '/seguridad/reporte-strikes', label: 'Strikes', icon: Flag, roles: ['admin_comunidad'] },
    ],
  },
  {
    label: 'Comercial',
    icon: TrendingUp,
    paths: ['/seguridad/facturacion', '/seguridad/suscripciones', '/seguridad/regalias', '/seguridad/publicidad', '/seguridad/finanzas', '/seguridad/simulacion'],
    // Roles verificados contra `require_admin`/`require_rol_admin` de cada
    // capability (facturacion/finanzas/regalias/publicidad → admin_finanzas;
    // suscripciones → admin_comercial, no admin_finanzas — corrección real
    // encontrada al leer suscripciones/router.py, no una suposición).
    links: [
      { to: '/seguridad/facturacion', label: 'Facturación', icon: Receipt, end: true, roles: ['admin_finanzas'] },
      { to: '/seguridad/facturacion/empresa', label: 'Info. empresa', icon: Building2, roles: ['admin_finanzas'] },
      { to: '/seguridad/suscripciones', label: 'Suscripciones', icon: CreditCard, roles: ['admin_comercial'] },
      { to: '/seguridad/regalias', label: 'Regalías', icon: Coins, roles: ['admin_finanzas'] },
      { to: '/seguridad/publicidad', label: 'Publicidad', icon: Megaphone, roles: ['admin_finanzas'] },
      { to: '/seguridad/finanzas', label: 'Finanzas', icon: Wallet, roles: ['admin_finanzas'] },
      { to: '/seguridad/simulacion', label: 'Simulación', icon: FlaskConical, roles: ['admin_datos'] },
    ],
  },
  {
    label: 'Contenido',
    icon: Music,
    paths: ['/seguridad/creadores', '/seguridad/distribucion', '/seguridad/catalogo', '/seguridad/social'],
    links: [
      { to: '/seguridad/creadores', label: 'Creadores', icon: Mic2, roles: ['admin_contenido'] },
      { to: '/seguridad/distribucion', label: 'Distribución', icon: Globe, roles: ['admin_contenido'] },
      { to: '/seguridad/catalogo', label: 'Catálogo · Takedown', icon: Disc3, roles: ['admin_contenido'] },
      { to: '/seguridad/social', label: 'Moderación social', icon: MessagesSquare, roles: ['admin_comunidad'] },
    ],
  },
  {
    label: 'Producto',
    icon: Sparkles,
    paths: ['/seguridad/soporte', '/seguridad/familia', '/seguridad/reporte-ab-tests', '/seguridad/reporte-notificaciones', '/seguridad/disponibilidad'],
    // `experiencia/deps.py`: require_admin = admin_comunidad, para todo el
    // bloque (soporte/familia/ab-tests/notificaciones).
    links: [
      { to: '/seguridad/soporte', label: 'Tickets soporte', icon: LifeBuoy, roles: ['admin_comunidad'] },
      { to: '/seguridad/familia', label: 'Plan familiar', icon: Users2, roles: ['admin_comunidad'] },
      { to: '/seguridad/reporte-ab-tests', label: 'Pruebas A/B', icon: GitBranch, roles: ['admin_comunidad'] },
      { to: '/seguridad/reporte-notificaciones', label: 'Notificaciones', icon: Bell, roles: ['admin_comunidad'] },
      // Reusa `DisponibilidadInfraPage` (CU-O55, `/analitica/disponibilidad`)
      // — mismo componente y endpoint, sin tier gate propio, solo un
      // segundo punto de entrada para el panel de reportes admin. Sin
      // `roles`: no tiene un rol de área propio en el backend (endpoint de
      // `analitica`, no de `experiencia`), se deja visible a cualquier admin.
      { to: '/seguridad/disponibilidad', label: 'Disponibilidad', icon: Activity },
    ],
  },
  {
    label: 'Datos y Partners',
    icon: Database,
    paths: ['/seguridad/partners', '/seguridad/ingesta'],
    // partners/deps.py: require_partner_admin = admin_comercial.
    // gestion_datos/deps.py: require_lead_data_engineer = admin_datos.
    links: [
      { to: '/seguridad/partners', label: 'Partners', icon: Handshake, end: true, roles: ['admin_comercial'] },
      { to: '/seguridad/partners/gestion', label: 'Gestión de partners', icon: UserCog, roles: ['admin_comercial'] },
      { to: '/seguridad/partners/metricas', label: 'Métricas de partners', icon: BarChart3, roles: ['admin_comercial'] },
      { to: '/seguridad/ingesta', label: 'Ingesta ETL', icon: Database, end: true, roles: ['admin_datos'] },
      { to: '/seguridad/ingesta/dimensiones', label: 'Dimensiones', icon: Table2, roles: ['admin_datos'] },
      { to: '/seguridad/ingesta/calidad', label: 'Calidad de datos', icon: CheckCircle2, roles: ['admin_datos'] },
    ],
  },
  {
    label: 'Reportes',
    icon: FileBarChart,
    paths: ['/seguridad/reporte-usuarios', '/seguridad/reporte-familias'],
    // seguridad/router.py `/admin/usuarios-reporte` → require_admin
    // (superadmin). experiencia/router.py `/admin/familias` → require_admin
    // de esa capability (admin_comunidad).
    links: [
      { to: '/seguridad/reporte-usuarios', label: 'Usuarios', icon: Users, roles: ['superadmin'] },
      { to: '/seguridad/reporte-familias', label: 'Familias', icon: Users2, roles: ['admin_comunidad'] },
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

// Submenú anidado "Informes Compuestos" (S13-P3b) — 9 departamentos, cada
// uno colapsable por separado, dentro de la sección "Reportes" ya existente.
// No se renderiza en modo `collapsed` (S13-P8): 30 rutas hoja no caben como
// riel de iconos, y no hay un índice único al que un solo ícono pudiera
// llevar — se navega a esta sección expandiendo el sidebar completo.
function InformesCompuestosMenu({ departamentos }: { departamentos: typeof DEPARTAMENTOS_NAV }) {
  const location = useLocation()
  const { open, toggle } = useToggle(
    'Informes Compuestos',
    departamentos.some((d) => location.pathname.startsWith(`/reportes/${d.slug}`)),
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
        {departamentos.map((depto) => (
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
  const user = getUser()
  const userRoles = useMemo(() => rolesDeUsuario(user), [user])
  const superadmin = esSuperadmin(user)
  const [superadminArea, setSuperadminAreaState] = useState(getSuperadminArea)

  function handleAreaSelect(area: string | null) {
    setSuperadminAreaState(area)
    setSuperadminArea(area)
  }

  // Filtra sidebar por rol (Fase 4.1, S14-FINAL) — generaliza el mecanismo
  // que antes solo cubría "Simulación" (`usePuedeVerSimulacion`) a TODOS los
  // links con `roles` declarado arriba. Una sección sin links visibles se
  // omite entera (ej. "Datos y Partners" completa para `admin_finanzas`) en
  // vez de quedar como grupo vacío. Para superadmin, additionally filtra
  // por área seleccionada en el selector "Viendo como".
  const seccionesVisibles = useMemo(() => {
    return SECCIONES
      .map((s) => ({
        ...s,
        links: s.links.filter((l) => puedeVer(l.roles, userRoles)),
      }))
      .filter((s) => puedeVer(s.roles, userRoles) && s.links.length > 0)
      .filter((s) => !superadmin || !superadminArea || s.label === superadminArea)
  }, [userRoles, superadmin, superadminArea])

  // Mismo criterio para los 9 departamentos de informes compuestos — el
  // mapeo real de `DEPTO_ROLES` calca `api/paquetes/reportes/deps.py`
  // (`require_<depto>`), así que nunca se muestra un link que el backend
  // rechazaría con 403 igual.
  const departamentosVisibles = useMemo(
    () => DEPARTAMENTOS_NAV.filter((d) => puedeVer(DEPTO_ROLES[d.slug], userRoles)),
    [userRoles],
  )

  // Acordeón exclusivo del nivel 2 (rediseño de navegación de dos niveles) —
  // antes cada una de las 6-7 secciones se abría/cerraba de forma
  // independiente (`useToggle` local por sección, sin exclusividad ni
  // persistencia real: `getAdminSectionsOpen` se importaba pero nunca se
  // leía). Ahora solo una sección está abierta a la vez, se persiste en
  // localStorage vía `useExclusiveAccordion`, y la sección con la ruta
  // activa se abre sola al navegar.
  const activeSeccionLabel = seccionesVisibles.find((s) =>
    s.paths.some((p) => location.pathname.startsWith(p))
    || (s.label === 'Reportes' && location.pathname.startsWith('/reportes')),
  )?.label ?? null
  const { openGroup, toggle } = useExclusiveAccordion('seguridad-sidebar-open-group', activeSeccionLabel)

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
        <ZoneSwitcher currentZone="administracion" badge="admin" />
        <ThemeToggle />
        <UserMenu />
      </header>

      <div className={styles.body}>
        <nav className={[styles.sidebar, collapsed ? styles.sidebarCollapsed : ''].join(' ').trim()} aria-label="Navegación de seguridad">
          <div className={styles.navGroups}>
            {superadmin && !collapsed && (
              <AreaSwitcher
                areas={SECCIONES.map((s) => s.label)}
                selected={superadminArea}
                onSelect={handleAreaSelect}
              />
            )}
            {seccionesVisibles.map((seccion) => (
              <SidebarSection
                key={seccion.label}
                label={seccion.label}
                icon={seccion.icon}
                open={openGroup === seccion.label}
                collapsed={collapsed}
                onToggle={() => toggle(seccion.label)}
                tall={seccion.label === 'Reportes'}
                extra={seccion.label === 'Reportes' ? <InformesCompuestosMenu departamentos={departamentosVisibles} /> : undefined}
              >
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
              </SidebarSection>
            ))}
          </div>

          {user && !collapsed && (
            <div className={styles.accountFooter}>
              <span className={styles.accountAvatar} aria-hidden="true">{user.email[0]?.toUpperCase()}</span>
              <span className={styles.accountInfo}>
                <span className={styles.accountEmail}>{user.email}</span>
                <RoleBadge user={user} />
              </span>
            </div>
          )}

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
              <PageTransition>
                <Outlet />
              </PageTransition>
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  )
}
