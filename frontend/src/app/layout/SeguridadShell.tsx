import { Suspense } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
// Import directo, no vía el barrel `@packages/seguridad` (arrastraría los
// dashboards con Recharts de ese paquete al bundle principal — ver router.tsx).
import { UserMenu } from '@packages/seguridad/components/UserMenu'
import { RouteLoadingFallback } from '@shared/components/RouteLoadingFallback'
import { ZoneSwitcher } from '@shared/components/ZoneSwitcher'
import styles from './SeguridadShell.module.css'

const ACTIVE_CLS   = `${styles.navItem} ${styles.navActive}`
const INACTIVE_CLS = styles.navItem

export function SeguridadShell() {
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
        <nav className={styles.sidebar} aria-label="Navegación de seguridad">
          <NavLink to="/seguridad/usuarios" className={({ isActive }) => isActive ? ACTIVE_CLS : INACTIVE_CLS}>
            Usuarios
          </NavLink>
          <NavLink to="/seguridad/permisos" className={({ isActive }) => isActive ? ACTIVE_CLS : INACTIVE_CLS}>
            Permisos
          </NavLink>
          <NavLink to="/seguridad/auditoria" className={({ isActive }) => isActive ? ACTIVE_CLS : INACTIVE_CLS}>
            Auditoría
          </NavLink>
          <NavLink to="/seguridad/errores" className={({ isActive }) => isActive ? ACTIVE_CLS : INACTIVE_CLS}>
            Errores
          </NavLink>
          <NavLink to="/seguridad/facturacion" end className={({ isActive }) => isActive ? ACTIVE_CLS : INACTIVE_CLS}>
            Facturación
          </NavLink>
          <NavLink to="/seguridad/facturacion/empresa" className={({ isActive }) => isActive ? ACTIVE_CLS : INACTIVE_CLS}>
            Info. empresa
          </NavLink>
          <NavLink to="/seguridad/creadores" className={({ isActive }) => isActive ? ACTIVE_CLS : INACTIVE_CLS}>
            Creadores
          </NavLink>
          <NavLink to="/seguridad/social" className={({ isActive }) => isActive ? ACTIVE_CLS : INACTIVE_CLS}>
            Social
          </NavLink>
          <NavLink to="/seguridad/distribucion" className={({ isActive }) => isActive ? ACTIVE_CLS : INACTIVE_CLS}>
            Distribución
          </NavLink>
          <NavLink to="/seguridad/catalogo" className={({ isActive }) => isActive ? ACTIVE_CLS : INACTIVE_CLS}>
            Catálogo · Takedown
          </NavLink>
          <NavLink to="/seguridad/suscripciones" className={({ isActive }) => isActive ? ACTIVE_CLS : INACTIVE_CLS}>
            Suscripciones
          </NavLink>
          <NavLink to="/seguridad/soporte" className={({ isActive }) => isActive ? ACTIVE_CLS : INACTIVE_CLS}>
            Soporte
          </NavLink>
          <NavLink to="/seguridad/familia" className={({ isActive }) => isActive ? ACTIVE_CLS : INACTIVE_CLS}>
            Plan familiar
          </NavLink>
          <NavLink to="/seguridad/regalias" className={({ isActive }) => isActive ? ACTIVE_CLS : INACTIVE_CLS}>
            Regalías
          </NavLink>
          <NavLink to="/seguridad/publicidad" className={({ isActive }) => isActive ? ACTIVE_CLS : INACTIVE_CLS}>
            Publicidad
          </NavLink>
          <NavLink to="/seguridad/simulacion" className={({ isActive }) => isActive ? ACTIVE_CLS : INACTIVE_CLS}>
            Simulación
          </NavLink>
          <NavLink to="/seguridad/finanzas" className={({ isActive }) => isActive ? ACTIVE_CLS : INACTIVE_CLS}>
            Finanzas
          </NavLink>
          <NavLink to="/seguridad/partners" end className={({ isActive }) => isActive ? ACTIVE_CLS : INACTIVE_CLS}>
            Partners
          </NavLink>
          <NavLink to="/seguridad/partners/gestion" className={({ isActive }) => isActive ? ACTIVE_CLS : INACTIVE_CLS}>
            Gestión de partners
          </NavLink>
          <NavLink to="/seguridad/partners/metricas" className={({ isActive }) => isActive ? ACTIVE_CLS : INACTIVE_CLS}>
            Métricas de partners
          </NavLink>
          <NavLink to="/seguridad/ingesta" end className={({ isActive }) => isActive ? ACTIVE_CLS : INACTIVE_CLS}>
            Ingesta ETL
          </NavLink>
          <NavLink to="/seguridad/ingesta/dimensiones" className={({ isActive }) => isActive ? ACTIVE_CLS : INACTIVE_CLS}>
            Dimensiones
          </NavLink>
          <NavLink to="/seguridad/ingesta/calidad" className={({ isActive }) => isActive ? ACTIVE_CLS : INACTIVE_CLS}>
            Calidad de datos
          </NavLink>
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
