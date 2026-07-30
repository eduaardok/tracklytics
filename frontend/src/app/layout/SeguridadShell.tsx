import { Suspense, useState } from 'react'
import { Outlet, NavLink, useLocation } from 'react-router-dom'
// Import directo, no vía el barrel `@packages/seguridad` (arrastraría los
// dashboards con Recharts de ese paquete al bundle principal — ver router.tsx).
import { UserMenu } from '@packages/seguridad/components/UserMenu'
import { RouteLoadingFallback } from '@shared/components/RouteLoadingFallback'
import { ZoneSwitcher } from '@shared/components/ZoneSwitcher'
import { getAdminSectionsOpen, setAdminSectionOpen } from '@shared/lib/ui-prefs'
// SOLO metadata de navegación (sin `render`/plantillas/Recharts) — importar
// `@packages/reportes/config` (el registro completo) desde acá arrastraría
// Recharts al bundle principal, porque `SeguridadShell` se importa eager en
// `router.tsx` (no es lazy). Ver docs/BITACORA_S13.md, "bug de bundle 1MB".
import { DEPARTAMENTOS_NAV } from '@packages/reportes/config/informesNav'
import styles from './SeguridadShell.module.css'

const ACTIVE_CLS   = `${styles.navItem} ${styles.navActive}`
const INACTIVE_CLS = styles.navItem

type Seccion = {
  label: string
  paths: string[]
  links: Array<{ to: string; label: string; end?: boolean }>
}

// Secciones colapsables (S12): la sección "Seguridad" (Usuarios/Permisos/
// Auditoría/Errores) queda fuera de este arreglo — es la sección principal,
// siempre visible, sin label ni toggle (ver SeguridadShell original).
const SECCIONES: Seccion[] = [
  {
    label: 'Comercial',
    paths: ['/seguridad/facturacion', '/seguridad/suscripciones', '/seguridad/regalias', '/seguridad/publicidad', '/seguridad/finanzas'],
    links: [
      { to: '/seguridad/facturacion', label: 'Facturación', end: true },
      { to: '/seguridad/facturacion/empresa', label: 'Info. empresa' },
      { to: '/seguridad/suscripciones', label: 'Suscripciones' },
      { to: '/seguridad/regalias', label: 'Regalías' },
      { to: '/seguridad/publicidad', label: 'Publicidad' },
      { to: '/seguridad/finanzas', label: 'Finanzas' },
    ],
  },
  {
    label: 'Contenido',
    paths: ['/seguridad/creadores', '/seguridad/social', '/seguridad/distribucion', '/seguridad/catalogo', '/seguridad/soporte', '/seguridad/familia'],
    links: [
      { to: '/seguridad/creadores', label: 'Creadores' },
      { to: '/seguridad/social', label: 'Social' },
      { to: '/seguridad/distribucion', label: 'Distribución' },
      { to: '/seguridad/catalogo', label: 'Catálogo · Takedown' },
      { to: '/seguridad/soporte', label: 'Soporte' },
      { to: '/seguridad/familia', label: 'Plan familiar' },
    ],
  },
  {
    label: 'Datos y Partners',
    paths: ['/seguridad/partners', '/seguridad/ingesta', '/seguridad/simulacion'],
    links: [
      { to: '/seguridad/partners', label: 'Partners', end: true },
      { to: '/seguridad/partners/gestion', label: 'Gestión de partners' },
      { to: '/seguridad/partners/metricas', label: 'Métricas de partners' },
      { to: '/seguridad/ingesta', label: 'Ingesta ETL', end: true },
      { to: '/seguridad/ingesta/dimensiones', label: 'Dimensiones' },
      { to: '/seguridad/ingesta/calidad', label: 'Calidad de datos' },
      { to: '/seguridad/simulacion', label: 'Simulación' },
    ],
  },
  {
    label: 'Reportes',
    paths: ['/seguridad/reporte-usuarios', '/seguridad/reporte-strikes', '/seguridad/reporte-ab-tests', '/seguridad/reporte-notificaciones', '/seguridad/reporte-familias', '/seguridad/sesiones-activas', '/seguridad/disponibilidad'],
    links: [
      { to: '/seguridad/reporte-usuarios', label: 'Usuarios' },
      { to: '/seguridad/reporte-strikes', label: 'Strikes' },
      { to: '/seguridad/reporte-ab-tests', label: 'Pruebas A/B' },
      { to: '/seguridad/reporte-notificaciones', label: 'Notificaciones' },
      { to: '/seguridad/reporte-familias', label: 'Familias' },
      { to: '/seguridad/sesiones-activas', label: 'Sesiones activas' },
      // Reusa `DisponibilidadInfraPage` (CU-O55, `/analitica/disponibilidad`)
      // — mismo componente y endpoint, sin tier gate propio, solo un
      // segundo punto de entrada para el panel de reportes admin.
      { to: '/seguridad/disponibilidad', label: 'Disponibilidad' },
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

function SidebarSection({ seccion, defaultOpen, extra }: { seccion: Seccion; defaultOpen: boolean; extra?: React.ReactNode }) {
  // Recuerda si el admin abrió/cerró esta sección a mano (S13 polish
  // visual) — antes se olvidaba al navegar a otra ruta, solo se
  // auto-abría si contenía la ruta activa (`defaultOpen`).
  const { open, toggle } = useToggle(seccion.label, defaultOpen)

  return (
    <div>
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
        <span>{seccion.label}</span>
        <span className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`} aria-hidden="true">▸</span>
      </div>
      <div className={`${styles.sectionLinks} ${open ? styles.sectionLinksOpen : ''} ${extra ? styles.informesComposuestosLinks : ''}`}>
        {seccion.links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            className={({ isActive }) => isActive ? ACTIVE_CLS : INACTIVE_CLS}
          >
            {link.label}
          </NavLink>
        ))}
        {extra}
      </div>
    </div>
  )
}

// Submenú anidado "Informes Compuestos" (S13-P3b) — 9 departamentos, cada
// uno colapsable por separado, dentro de la sección "Reportes" ya existente.
// Un nivel más de anidación que `SidebarSection` (que ya cubre el primer
// nivel de colapso): mismo patrón, mismo helper `useToggle`/`setAdminSectionOpen`
// con una clave compuesta para no chocar con las claves de nivel superior.
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
          {/* Sección por defecto (S12): sin label ni toggle — es lo primero que ve un
              admin al entrar al panel, no necesita anunciarse como grupo colapsable. */}
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

          {/* Resto de secciones (S12): colapsables, abiertas por defecto solo
              si contienen la ruta activa — ver SidebarSection arriba. */}
          {SECCIONES.map((seccion) => (
            <SidebarSection
              key={seccion.label}
              seccion={seccion}
              defaultOpen={
                seccion.paths.some((p) => location.pathname.startsWith(p))
                || (seccion.label === 'Reportes' && location.pathname.startsWith('/reportes'))
              }
              extra={seccion.label === 'Reportes' ? <InformesCompuestosMenu /> : undefined}
            />
          ))}
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
