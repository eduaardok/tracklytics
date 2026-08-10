import { useEffect, useState } from 'react'
import { Outlet, NavLink, useLocation } from 'react-router-dom'
import {
  LayoutGrid, Library, CreditCard, Receipt, Mic2, Users, Globe, LifeBuoy,
  BarChart3, ShieldCheck, PanelLeftClose, PanelLeftOpen, Sparkles, Coins, type LucideIcon,
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
import { PlayerBarActions } from '@packages/catalogo'
// Import directo (no vía el barrel `@packages/publicidad`): ese barrel
// también exporta PublicidadAdminPage, que no debe entrar al bundle
// principal — mismo criterio que PlayerBarActions/UserMenu/NotificationBell
// arriba.
import { AdBanner } from '@packages/publicidad/components/AdBanner'
import { usePlanActivo } from '@packages/suscripciones'
import { PlayerBar } from '@shared/components/PlayerBar'
import { PageTransition } from '@shared/components/PageTransition'
import { usePlayer } from '@shared/context/PlayerContext'
import { getRole } from '@shared/lib/session'
import { getSidebarCollapsed, setSidebarCollapsed } from '@shared/lib/ui-prefs'
import { MobileNavDrawer } from './MobileNavDrawer'
import styles from './AppShell.module.css'

export type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean }

// Arquitectura de información del sidebar: consumo primario arriba (lo que un
// usuario B2C visita todo el tiempo), transaccional/admin-adyacente abajo del
// divider (cosas que se visitan ocasionalmente). "Soporte" cae en el segundo
// grupo — es una acción puntual, no de consumo diario, igual que Facturación/
// Creadores/Social/Distribución.
const NAV_PRIMARY: NavItem[] = [
  { to: '/',              label: 'Catálogo',       icon: LayoutGrid, end: true },
  { to: '/recomendaciones', label: 'Para ti',      icon: Sparkles },
  { to: '/biblioteca',    label: 'Mi Biblioteca',  icon: Library },
  { to: '/suscripciones', label: 'Mi Plan',        icon: CreditCard },
]

const NAV_SECONDARY: NavItem[] = [
  { to: '/facturacion',                  label: 'Facturación', icon: Receipt },
  { to: '/creadores',                    label: 'Creadores',   icon: Mic2 },
  { to: '/social',                       label: 'Social',      icon: Users },
  { to: '/distribucion/disponibilidad',  label: 'Distribución', icon: Globe },
  { to: '/soporte',                      label: 'Soporte',     icon: LifeBuoy },
  { to: '/regalias/ganancias',           label: 'Mis ganancias', icon: Coins },
]

// Hallazgo post-migración a sidebar (Fase 8): ni antes (nav horizontal +
// "Más") ni después había forma de llegar a `/analitica` o `/seguridad` desde
// el shell B2C — son shells hermanos montados en rutas propias
// (`AnalyticaShell`/`SeguridadShell`, ver router.tsx), invisibles si no se
// conoce la URL de memoria. Gating idéntico al del backend: `/analitica`
// acepta admin o analyst con suscripción activa (`require_b2b_panel_access`,
// api/paquetes/analitica/deps.py); `/seguridad` es admin-only
// (`require_admin`, api/paquetes/seguridad/deps.py). Grupo propio con su
// propio divider — conceptualmente son "salir a otro panel", no una acción
// más dentro de la app de consumo. (La salida de vuelta vive en `ZoneSwitcher`,
// montado dentro de esos dos shells.)
function navAdminFor(role: string | null): NavItem[] {
  const items: NavItem[] = []
  if (role === 'admin' || role === 'analyst') items.push({ to: '/analitica', label: 'Analítica', icon: BarChart3 })
  if (role === 'admin') items.push({ to: '/seguridad', label: 'Administración', icon: ShieldCheck })
  return items
}

export function AppShell() {
  // PlayerBar es `position: fixed` (no ocupa espacio en el flujo) — reserva el
  // hueco con padding-bottom solo cuando hay pista cargada, para no dejar un
  // espacio muerto permanente cuando nadie ha reproducido nada todavía.
  const { currentTrack } = usePlayer()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(getSidebarCollapsed)
  const location = useLocation()
  const role = getRole()
  const navAdmin = navAdminFor(role)
  // admin (Lead Data Engineer/CTO) tiene acceso completo sin plan ni pago —
  // "Mi Plan" y "Facturación" no aplican a esa cuenta, se ocultan en vez de
  // mostrar un flujo de suscripción/cobro que el backend ahora rechaza.
  const navPrimary   = role === 'admin' ? NAV_PRIMARY.filter((i) => i.to !== '/suscripciones') : NAV_PRIMARY
  const navSecondary = role === 'admin' ? NAV_SECONDARY.filter((i) => i.to !== '/facturacion') : NAV_SECONDARY
  // Banner display (monetizacion-retencion-mejoras): visible solo para
  // usuarios free, mismo criterio que el paywall de TrackDetailPage.
  const { tipoPlan } = usePlanActivo()

  // Cierra el drawer al navegar y si la ventana crece más allá del breakpoint
  // (ej. rotar una tablet) — evita quedar con el overlay abierto sobre el
  // sidebar de escritorio.
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
        className={({ isActive }) => (isActive ? `${styles.navItem} ${styles.navActive}` : styles.navItem)}
      >
        <Icon className={styles.navIcon} size={18} aria-hidden="true" />
        <span className={styles.navText}>{item.label}</span>
      </NavLink>
    )
  }

  return (
    <div className={styles.shell}>
      <header className={styles.brandBar} data-print-hide="true">
        <button
          type="button"
          className={styles.hamburger}
          aria-label="Abrir navegación"
          aria-expanded={mobileNavOpen}
          onClick={() => setMobileNavOpen(true)}
        >
          <span /><span /><span />
        </button>
        <a href="/" className={styles.wordmark}>
          <img src="/logo.png" alt="" className={styles.logo} width={24} height={24} />
          <span className={styles.brand}>Tracklytics</span>
          <span className={styles.badge}>beta</span>
        </a>
        <GlobalSearch />
        <div className={styles.headerActions}>
          <NotificationBell />
          <UserMenu />
        </div>
      </header>

      <VerificacionEmailBanner />

      <div className={styles.body}>
        <nav
          className={[
            styles.sidebar,
            currentTrack ? styles.sidebarWithPlayer : '',
            collapsed ? styles.sidebarCollapsed : '',
          ].join(' ').trim()}
          aria-label="Navegación principal"
          data-print-hide="true"
        >
          <div className={styles.navGroups}>
            {navPrimary.map(renderNavItem)}

            <div className={styles.divider} role="separator" />

            {navSecondary.map(renderNavItem)}

            {navAdmin.length > 0 && (
              <>
                <div className={styles.divider} role="separator" />
                {navAdmin.map(renderNavItem)}
              </>
            )}

            {tipoPlan === 'free' && <AdBanner collapsed={collapsed} />}
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

        <main className={`${styles.main} ${currentTrack ? styles.mainWithPlayer : ''}`}>
          <div className={styles.content}>
            <PageTransition>
              <Outlet />
            </PageTransition>
          </div>
        </main>
      </div>

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
