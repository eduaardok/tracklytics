import { Link, useLocation } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import styles from './Breadcrumb.module.css'

type BreadcrumbEntry = { label: string; path: string }

const BREADCRUMB_MAP: Record<string, { parent: string; parentPath: string; label: string }> = {
  '/seguridad/facturacion/empresa': {
    parent: 'Facturación',
    parentPath: '/seguridad/facturacion',
    label: 'Información de la empresa',
  },
  '/seguridad/partners/gestion': {
    parent: 'Partners',
    parentPath: '/seguridad/partners',
    label: 'Gestión de partners',
  },
  '/seguridad/partners/metricas': {
    parent: 'Partners',
    parentPath: '/seguridad/partners',
    label: 'Métricas de partners',
  },
  '/seguridad/ingesta/dimensiones': {
    parent: 'Ingesta ETL',
    parentPath: '/seguridad/ingesta',
    label: 'Dimensiones',
  },
  '/seguridad/ingesta/calidad': {
    parent: 'Ingesta ETL',
    parentPath: '/seguridad/ingesta',
    label: 'Calidad de datos',
  },
}

function resolveBreadcrumbs(pathname: string): BreadcrumbEntry[] {
  // Exact match first
  const exact = BREADCRUMB_MAP[pathname]
  if (exact) {
    return [
      { label: 'Administración', path: '/seguridad' },
      { label: exact.parent, path: exact.parentPath },
      { label: exact.label, path: pathname },
    ]
  }

  // Dynamic route: /reportes/:departamento/:informe
  const reportMatch = pathname.match(/^\/reportes\/([^/]+)\/([^/]+)$/)
  if (reportMatch) {
    const [, depto, informe] = reportMatch
    const deptoLabel = depto.charAt(0).toUpperCase() + depto.slice(1).replace(/-/g, ' ')
    return [
      { label: 'Administración', path: '/seguridad' },
      { label: 'Reportes', path: '/seguridad' },
      { label: deptoLabel, path: '/seguridad' },
      { label: informe.replace(/-/g, ' '), path: pathname },
    ]
  }

  return []
}

export function Breadcrumb() {
  const { pathname } = useLocation()
  const entries = resolveBreadcrumbs(pathname)

  if (entries.length === 0) return null

  return (
    <nav aria-label="Breadcrumb" className={styles.nav}>
      <ol className={styles.list}>
        {entries.map((entry, i) => {
          const isLast = i === entries.length - 1
          return (
            <li key={entry.path + i} className={styles.item}>
              {isLast ? (
                <span className={styles.current} aria-current="page">{entry.label}</span>
              ) : (
                <>
                  <Link to={entry.path} className={styles.link}>{entry.label}</Link>
                  <ChevronRight size={14} className={styles.separator} aria-hidden="true" />
                </>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
