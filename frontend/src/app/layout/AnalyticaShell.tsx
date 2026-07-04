import { Suspense } from 'react'
import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { RequireSuscripcionActiva } from '@packages/analitica'
import { UserMenu } from '@packages/seguridad'
import { getRole } from '@shared/lib/session'
import { RouteLoadingFallback } from '@shared/components/RouteLoadingFallback'
import styles from './AnalyticaShell.module.css'

const ACTIVE_CLS    = `${styles.navItem} ${styles.navActive}`
const INACTIVE_CLS  = styles.navItem
const DIMMED_CLS    = `${styles.navItem} ${styles.navDimmed}`
const DIMMED_ACT    = `${styles.navItem} ${styles.navActive}`

// completar-modelo-base: "Adquisición" y "Disponibilidad" salieron de esta
// lista — ya no son placeholders (FACT_ADQUISICION/FACT_DISPONIBILIDAD
// existen), pasan a la nav real de arriba con el mismo gating que el resto.
const COMING_SOON = [
  { label: 'Suscripciones',  to: '/analitica/suscripciones'  },
  { label: 'Partners',       to: '/analitica/partners'       },
  { label: 'Ingestas',       to: '/analitica/ingestas'       },
] as const

const COMING_SOON_PATHS: string[] = COMING_SOON.map(({ to }) => to)

export function AnalyticaShell() {
  const location = useLocation()
  // Los stubs "pronto" (incluido /analitica/suscripciones, destino del
  // redirect) no llaman a ningún endpoint gateado por `require_b2b_panel_access`
  // — nada que proteger ahí, y gatearlos causaría un loop de redirect contra
  // su propio destino.
  const sinGating = COMING_SOON_PATHS.includes(location.pathname)

  return (
    <div className={styles.shell}>
      <header className={styles.brandBar}>
        <a href="/" className={styles.wordmark} aria-label="Tracklytics — volver al catálogo">
          <span className={styles.brand}>Tracklytics</span>
          <span className={styles.panelBadge}>panel</span>
        </a>
        <UserMenu />
      </header>

      <div className={styles.body}>
        <nav className={styles.sidebar} aria-label="Navegación analítica">
          <NavLink
            to="/analitica"
            end
            className={({ isActive }) => isActive ? ACTIVE_CLS : INACTIVE_CLS}
          >
            Dashboard
          </NavLink>
          <NavLink
            to="/analitica/engagement"
            className={({ isActive }) => isActive ? ACTIVE_CLS : INACTIVE_CLS}
          >
            Engagement
          </NavLink>
          <NavLink
            to="/analitica/generos"
            className={({ isActive }) => isActive ? ACTIVE_CLS : INACTIVE_CLS}
          >
            Géneros
          </NavLink>
          <NavLink
            to="/analitica/comparacion"
            className={({ isActive }) => isActive ? ACTIVE_CLS : INACTIVE_CLS}
          >
            Comparación
          </NavLink>
          <NavLink
            to="/analitica/benchmark"
            className={({ isActive }) => isActive ? ACTIVE_CLS : INACTIVE_CLS}
          >
            Benchmark
          </NavLink>
          <NavLink
            to="/analitica/tendencias"
            className={({ isActive }) => isActive ? ACTIVE_CLS : INACTIVE_CLS}
          >
            Tendencias
          </NavLink>
          <NavLink
            to="/analitica/playlists-top"
            className={({ isActive }) => isActive ? ACTIVE_CLS : INACTIVE_CLS}
          >
            Playlists
          </NavLink>
          <NavLink
            to="/analitica/adquisicion"
            className={({ isActive }) => isActive ? ACTIVE_CLS : INACTIVE_CLS}
          >
            Adquisición
          </NavLink>
          <NavLink
            to="/analitica/disponibilidad"
            className={({ isActive }) => isActive ? ACTIVE_CLS : INACTIVE_CLS}
          >
            Disponibilidad
          </NavLink>
          {/* Backend exige `require_staff` (role=admin) en /reporte-diario — se
              oculta para el resto en vez de mostrar un link que siempre rebota,
              mismo criterio que el chequeo de rol del legacy. */}
          {getRole() === 'admin' && (
            <NavLink
              to="/analitica/reporte-diario"
              className={({ isActive }) => isActive ? ACTIVE_CLS : INACTIVE_CLS}
            >
              Reporte diario
            </NavLink>
          )}

          <div className={styles.divider} role="separator" />

          {COMING_SOON.map(({ label, to }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => isActive ? DIMMED_ACT : DIMMED_CLS}
            >
              {label}
              <span className={styles.comingSoonTag} aria-hidden="true">pronto</span>
            </NavLink>
          ))}
        </nav>

        <main className={styles.main}>
          <div className={styles.content}>
            {/* Suspense único para todo el árbol: las páginas de /analitica se
                cargan con React.lazy (ver router.tsx) por el peso de Recharts
                — un solo boundary aquí cubre cualquier página hija, en vez de
                envolver cada `element` del route config individualmente. */}
            <Suspense fallback={<RouteLoadingFallback />}>
              {sinGating ? (
                <Outlet />
              ) : (
                <RequireSuscripcionActiva>
                  <Outlet />
                </RequireSuscripcionActiva>
              )}
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  )
}
