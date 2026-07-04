import { useEffect, useState } from 'react'
import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { UserMenu } from '@packages/seguridad'
import { PlayerBarActions } from '@packages/catalogo'
import { PlayerBar } from '@shared/components/PlayerBar'
import { usePlayer } from '@shared/context/PlayerContext'
import { getRole } from '@shared/lib/session'
import { MobileNavDrawer } from './MobileNavDrawer'
import styles from './AppShell.module.css'

// Arquitectura de información del sidebar: consumo primario arriba (lo que un
// usuario B2C visita todo el tiempo), transaccional/admin-adyacente abajo del
// divider (cosas que se visitan ocasionalmente). "Soporte" cae en el segundo
// grupo — es una acción puntual, no de consumo diario, igual que Facturación/
// Creadores/Social/Distribución.
const NAV_PRIMARY = [
  { to: '/',             label: 'Catálogo',      end: true },
  { to: '/biblioteca',   label: 'Mi Biblioteca' },
  { to: '/suscripciones', label: 'Mi Plan' },
]

const NAV_SECONDARY = [
  { to: '/facturacion',                  label: 'Facturación' },
  { to: '/creadores',                    label: 'Creadores' },
  { to: '/social',                       label: 'Social' },
  { to: '/distribucion/disponibilidad',  label: 'Distribución' },
  { to: '/soporte',                      label: 'Soporte' },
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
// más dentro de la app de consumo.
function navAdminFor(role: string | null): { to: string; label: string }[] {
  const items: { to: string; label: string }[] = []
  if (role === 'admin' || role === 'analyst') items.push({ to: '/analitica', label: 'Analítica' })
  if (role === 'admin') items.push({ to: '/seguridad', label: 'Administración' })
  return items
}

export function AppShell() {
  // PlayerBar es `position: fixed` (no ocupa espacio en el flujo) — reserva el
  // hueco con padding-bottom solo cuando hay pista cargada, para no dejar un
  // espacio muerto permanente cuando nadie ha reproducido nada todavía.
  const { currentTrack } = usePlayer()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const location = useLocation()
  const navAdmin = navAdminFor(getRole())

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
        <a href="/" className={styles.wordmark}>
          <img src="/logo.png" alt="" className={styles.logo} width={24} height={24} />
          <span className={styles.brand}>Tracklytics</span>
          <span className={styles.badge}>beta</span>
        </a>
        <UserMenu />
      </header>

      <div className={styles.body}>
        <nav
          className={`${styles.sidebar} ${currentTrack ? styles.sidebarWithPlayer : ''}`}
          aria-label="Navegación principal"
        >
          {NAV_PRIMARY.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => (isActive ? `${styles.navItem} ${styles.navActive}` : styles.navItem)}
            >
              {item.label}
            </NavLink>
          ))}

          <div className={styles.divider} role="separator" />

          {NAV_SECONDARY.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => (isActive ? `${styles.navItem} ${styles.navActive}` : styles.navItem)}
            >
              {item.label}
            </NavLink>
          ))}

          {navAdmin.length > 0 && (
            <>
              <div className={styles.divider} role="separator" />
              {navAdmin.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => (isActive ? `${styles.navItem} ${styles.navActive}` : styles.navItem)}
                >
                  {item.label}
                </NavLink>
              ))}
            </>
          )}
        </nav>

        <main className={`${styles.main} ${currentTrack ? styles.mainWithPlayer : ''}`}>
          <div className={styles.content}>
            <Outlet />
          </div>
        </main>
      </div>

      <MobileNavDrawer
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        primary={NAV_PRIMARY}
        secondary={[...NAV_SECONDARY, ...navAdmin]}
        reservePlayerSpace={!!currentTrack}
      />

      <PlayerBar actions={<PlayerBarActions />} />
    </div>
  )
}
