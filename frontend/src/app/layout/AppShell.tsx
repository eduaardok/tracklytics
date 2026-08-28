import { Suspense, useEffect, useState } from 'react'
import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { RouteLoadingFallback } from '@shared/components/RouteLoadingFallback'
import {
  LayoutGrid, Library, CreditCard, Mic2, Users, Globe, LifeBuoy,
  BarChart3, ShieldCheck, Sparkles, Coins, type LucideIcon,
} from 'lucide-react'
// Import directo, no vía el barrel `@packages/seguridad` (arrastraría los
// dashboards con Recharts de ese paquete al bundle principal — ver router.tsx).
import { UserMenu } from '@packages/seguridad/components/UserMenu'
// Mismo criterio de import directo: el barrel de `seguridad` arrastra páginas
// admin al bundle principal.
import { VerificacionEmailBanner } from '@packages/seguridad/components/VerificacionEmailBanner'
import { GlobalSearch } from '@packages/catalogo/components/GlobalSearch'
// Mismo criterio: `@packages/social` exporta ModeracionSocialPage (dashboard
// con Recharts) en su barrel — import directo del componente.
import { NotificationBell } from '@packages/social/components/NotificationBell'
import { ThemeToggle } from '@shared/components/ThemeToggle'
import { ZoneSwitcher } from '@shared/components/ZoneSwitcher'
import { PlayerBarActions } from '@packages/catalogo'
// Import directo (no vía el barrel `@packages/publicidad`): ese barrel
// también exporta PublicidadAdminPage, que no debe entrar al bundle
// principal — mismo criterio que PlayerBarActions/UserMenu/NotificationBell
// arriba.
import { AdBanner } from '@packages/publicidad/components/AdBanner'
import { usePlanActivo } from '@packages/suscripciones/hooks/usePlanActivo'
import { PlayerBar } from '@shared/components/PlayerBar'
import { PageTransition } from '@shared/components/PageTransition'
import { usePlayer } from '@shared/context/PlayerContext'
import { getRole, getUser } from '@shared/lib/session'
import { esSuperadmin } from '@shared/lib/roles'
import { MobileNavDrawer } from './MobileNavDrawer'
import { TopNavMore } from './TopNavMore'
import styles from './AppShell.module.css'

export type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean }

// Rediseño de navegación (híbrido por zona): este shell B2C abandona el
// sidebar — su consumo es primario y plano (4 destinos de diario), así que
// pasa a un top-nav de dos filas: fila 1 marca+búsqueda+acciones, fila 2 los
// tabs primarios + menú "Más" con lo ocasional. El sidebar SOBREVIVE en
// AnalíticaShell/SeguridadShell, donde la densidad real (13+ ítems agrupados
// con gating por rol) sí justifica un panel dedicado. El drawer móvil no
// cambia: bajo 768px el nav de escritorio se oculta y el drawer cubre todo.
const NAV_PRIMARY: NavItem[] = [
  { to: '/',              label: 'Catálogo',       icon: LayoutGrid, end: true },
  { to: '/recomendaciones', label: 'Para ti',      icon: Sparkles },
  { to: '/biblioteca',    label: 'Mi Biblioteca',  icon: Library },
  { to: '/suscripciones', label: 'Mi Plan',        icon: CreditCard },
]

const NAV_SECONDARY: NavItem[] = [
  // "Facturación" salió del nav en S16-P8: vive como tab dentro de Mi Plan
  // (hub pedido por el stakeholder; /facturacion redirige a
  // /suscripciones?tab=facturacion). "Mis ganancias" se sacó por el mismo
  // criterio (S16-P8) porque es una pestaña del hub Creadores
  // (ArtistaHubTabs) — pero esa pestaña solo se monta para cuentas de
  // artista aprobadas. Una cuenta de sello (sin cuenta de artista) nunca
  // pasa por /creadores y quedaba sin ningún punto de entrada visible a
  // /regalias/ganancias pese a tener liquidaciones reales que ver (hallazgo
  // reportado en vivo, S17). Vuelve al nav para cubrir ese caso; para
  // cuentas de artista es una segunda puerta al mismo destino, no un
  // problema.
  { to: '/creadores',                    label: 'Creadores',   icon: Mic2 },
  { to: '/regalias/ganancias',           label: 'Mis ganancias', icon: Coins },
  { to: '/social',                       label: 'Social',      icon: Users },
  { to: '/distribucion/disponibilidad',  label: 'Distribución', icon: Globe },
  { to: '/soporte',                      label: 'Soporte',     icon: LifeBuoy },
]

// Hallazgo post-migración a sidebar (Fase 8): ni antes (nav horizontal +
// "Más") ni después había forma de llegar a `/analitica` o `/seguridad` desde
// el shell B2C — son shells hermanos montados en rutas propias
// (`AnalyticaShell`/`SeguridadShell`, ver router.tsx), invisibles si no se
// conoce la URL de memoria. Gating idéntico al del backend: `/analitica`
// acepta admin o analyst con suscripción activa (`require_b2b_panel_access`,
// api/paquetes/analitica/deps.py); `/seguridad` es admin-only
// (`require_admin`, api/paquetes/seguridad/deps.py). En el modelo top-nav
// viven dentro del menú "Más", tras su propio divisor — conceptualmente son
// "salir a otro panel", no una acción más dentro de la app de consumo.
// FASE 1 (Prompt 10): la gating original usaba `role` crudo de PocketBase
// (`role === 'admin'`), que solo vale para la cuenta superadmin bootstrap —
// las cuentas admin asignadas por BRIDGE_USUARIO_ROL_ADMIN (ej.
// `superadmin@demo.tracklytics.com`, con `role: "user"` + fila `superadmin`
// en el BRIDGE) quedaban sin ver "Analítica"/"Administración" pese a tener
// acceso real (las rutas SÍ las dejaban entrar vía `RequireAuth`/backend,
// que ya usan `esAdmin`/`esSuperadmin`). "Analítica" replica exactamente el
// gating de `require_b2b_panel_access` (`_es_staff_interno` = superadmin,
// no cualquier admin de área) + analyst; "Administración" replica
// `RequireAuth roles={['admin']}` sobre `/seguridad`, que acepta cualquier
// rol admin (`esAdmin`, incluidas las 5 áreas) porque cada sub-página filtra
// su propia sección.
function navAdminFor(role: string | null, superadmin: boolean, esAdmin: boolean): NavItem[] {
  const items: NavItem[] = []
  if (superadmin || role === 'analyst') items.push({ to: '/analitica', label: 'Analítica', icon: BarChart3 })
  if (esAdmin) items.push({ to: '/seguridad', label: 'Administración', icon: ShieldCheck })
  return items
}

export function AppShell() {
  // PlayerBar es `position: fixed` (no ocupa espacio en el flujo) — reserva el
  // hueco con padding-bottom solo cuando hay pista cargada, para no dejar un
  // espacio muerto permanente cuando nadie ha reproducido nada todavía.
  const { currentTrack } = usePlayer()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const location = useLocation()
  const role = getRole()
  const user = getUser()
  const superadmin = esSuperadmin(user)
  const esAdmin = Boolean(user?.esAdmin)
  const navAdmin = navAdminFor(role, superadmin, esAdmin)
  // admin (Lead Data Engineer/CTO) tiene acceso completo sin plan ni pago —
  // "Mi Plan" y "Facturación" no aplican a esa cuenta, se ocultan en vez de
  // mostrar un flujo de suscripción/cobro que el backend ahora rechaza.
  // S16-P12: mismo criterio para superadmin/admin_* de área (`esAdmin` por
  // BRIDGE), no solo el bootstrap con role crudo 'admin'.
  const navPrimary   = role === 'admin' || esAdmin ? NAV_PRIMARY.filter((i) => i.to !== '/suscripciones') : NAV_PRIMARY
  const navSecondary = NAV_SECONDARY
  // Banner display (monetizacion-retencion-mejoras): visible solo para
  // usuarios free, mismo criterio que el paywall de TrackDetailPage. Con el
  // sidebar fuera, el banner pasa a franja propia bajo el nav — a ancho del
  // contenido, sin competir con la navegación.
  const { tipoPlan } = usePlanActivo()

  // Cierra el drawer al navegar y si la ventana crece más allá del breakpoint
  // (ej. rotar una tablet) — evita quedar con el overlay abierto sobre el
  // nav de escritorio.
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

  function renderTab(item: NavItem) {
    const Icon = item.icon
    return (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.end}
        className={({ isActive }) => (isActive ? `${styles.navTab} ${styles.navTabActive}` : styles.navTab)}
      >
        <Icon size={16} className={styles.navIcon} aria-hidden="true" />
        <span>{item.label}</span>
      </NavLink>
    )
  }

  return (
    <div className={styles.shell}>
      <header className={styles.chrome} data-print-hide="true">
        <div className={styles.brandBar}>
          <button
            type="button"
            className={styles.hamburger}
            aria-label="Abrir navegación"
            aria-expanded={mobileNavOpen}
            onClick={() => setMobileNavOpen(true)}
          >
            <span /><span /><span />
          </button>
          <div className={styles.wordmark}>
            <ZoneSwitcher currentZone="catalogo" badge="beta" />
          </div>
          <GlobalSearch />
          <div className={styles.headerActions}>
            <ThemeToggle />
            <NotificationBell />
            <UserMenu />
          </div>
        </div>

        <nav className={styles.navBar} aria-label="Navegación principal">
          <div className={styles.navTabs}>
            {navPrimary.map(renderTab)}
          </div>
          <TopNavMore secondary={navSecondary} admin={navAdmin} />
        </nav>
      </header>

      <VerificacionEmailBanner />

      {tipoPlan === 'free' && (
        <div className={styles.adStrip} data-print-hide="true">
          <AdBanner />
        </div>
      )}

      <main className={`${styles.main} ${currentTrack ? styles.mainWithPlayer : ''}`}>
        <div className={styles.content}>
          <PageTransition>
            {/* Suspense único para todo el Outlet (mismo patrón que
                AnalyticaShell/SeguridadShell): varias rutas hijas ahora son
                lazy (biblioteca, perfil, facturación, creadores, social,
                etc. — S16 prompt 09, fuera del camino crítico de landing/
                login). Catálogo/login se mantienen eager y no disparan
                este fallback. */}
            <Suspense fallback={<RouteLoadingFallback />}>
              <Outlet />
            </Suspense>
          </PageTransition>
        </div>
      </main>

      <MobileNavDrawer
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        primary={navPrimary}
        secondary={[...navSecondary, ...navAdmin]}
        reservePlayerSpace={!!currentTrack}
      />

      <div data-print-hide="true">
        <PlayerBar actions={<PlayerBarActions />} />
      </div>
    </div>
  )
}
