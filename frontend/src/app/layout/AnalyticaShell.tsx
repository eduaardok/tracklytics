import { Suspense } from 'react'
import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { RequireSuscripcionActiva } from '@packages/analitica'
// Import directo, no vía el barrel `@packages/seguridad` (arrastraría los
// dashboards con Recharts de ese paquete al chunk de AnalyticaShell).
import { UserMenu } from '@packages/seguridad/components/UserMenu'
// `usePlanActivo` (paquete `suscripciones`) es la única forma de saber el
// tier B2B del cliente en el cliente sin reimplementar la regla de negocio
// (mismo criterio que el resto del gating: reaccionar al estado real, no
// adivinar) — se usa solo para decidir si se muestra la sección "Predictivo"
// de la nav, el gating real sigue viviendo en `require_tier` (backend).
import { usePlanActivo } from '@packages/suscripciones'
import { getRole } from '@shared/lib/session'
import { RouteLoadingFallback } from '@shared/components/RouteLoadingFallback'
import { ZoneSwitcher } from '@shared/components/ZoneSwitcher'
import styles from './AnalyticaShell.module.css'

const ACTIVE_CLS    = `${styles.navItem} ${styles.navActive}`
const INACTIVE_CLS  = styles.navItem

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

export function AnalyticaShell() {
  const location = useLocation()
  const { tipoPlan } = usePlanActivo()
  // Los stubs "pronto" (incluido /analitica/suscripciones, destino del
  // redirect) no llaman a ningún endpoint gateado por `require_b2b_panel_access`
  // — nada que proteger ahí, y gatearlos causaría un loop de redirect contra
  // su propio destino.
  const sinGating = COMING_SOON_PATHS.includes(location.pathname)
  // Sección "Predictivo" (b2b-tier-access-analitica): visible solo para tier
  // Enterprise o admin (mismo criterio que la sección staff de abajo) — se
  // oculta para el resto en vez de mostrar un link que siempre rebota con
  // el estado "disponible desde plan Enterprise".
  const esEnterprise = tipoPlan === 'enterprise' || getRole() === 'admin'

  return (
    <div className={styles.shell}>
      <header className={styles.brandBar}>
        <span className={styles.wordmark}>
          <img src="/logo.png" alt="" className={styles.logo} width={24} height={24} />
          <span className={styles.brand}>Tracklytics</span>
          <span className={styles.panelBadge}>panel</span>
        </span>
        <ZoneSwitcher zone="analitica" />
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
          {/* Backend exige `require_staff` (role=admin) en /reporte-diario,
              /churn, /funnel-conversion, /pnl y /mrr-arr — se ocultan para el
              resto en vez de mostrar un link que siempre rebota, mismo
              criterio que el chequeo de rol del legacy. */}
          {getRole() === 'admin' && (
            <>
              <NavLink
                to="/analitica/reporte-diario"
                className={({ isActive }) => isActive ? ACTIVE_CLS : INACTIVE_CLS}
              >
                Reporte diario
              </NavLink>
              <NavLink
                to="/analitica/suscripciones"
                className={({ isActive }) => isActive ? ACTIVE_CLS : INACTIVE_CLS}
              >
                Churn de suscripciones
              </NavLink>
              <NavLink
                to="/analitica/funnel-conversion"
                className={({ isActive }) => isActive ? ACTIVE_CLS : INACTIVE_CLS}
              >
                Funnel de conversión
              </NavLink>
              <NavLink
                to="/analitica/pnl"
                className={({ isActive }) => isActive ? ACTIVE_CLS : INACTIVE_CLS}
              >
                P&amp;L consolidado
              </NavLink>
              <NavLink
                to="/analitica/mrr-arr"
                className={({ isActive }) => isActive ? ACTIVE_CLS : INACTIVE_CLS}
              >
                MRR / ARR
              </NavLink>
            </>
          )}

          {esEnterprise && (
            <>
              <NavLink
                to="/analitica/proyeccion-genero"
                className={({ isActive }) => isActive ? ACTIVE_CLS : INACTIVE_CLS}
              >
                Proyección de género
              </NavLink>
              <NavLink
                to="/analitica/proyeccion-artista"
                className={({ isActive }) => isActive ? ACTIVE_CLS : INACTIVE_CLS}
              >
                Proyección de artista
              </NavLink>
            </>
          )}

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
