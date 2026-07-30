// Preferencias de UI persistentes (no de sesión — separado a propósito de
// `session.ts`, que solo guarda token/usuario/dispositivo). Primera de su
// tipo en el proyecto: hoy no existía ningún mecanismo de preferencias de UI.

const SIDEBAR_COLLAPSED_KEY = 'ui_sidebar_collapsed'

export function getSidebarCollapsed(): boolean {
  return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
}

export function setSidebarCollapsed(collapsed: boolean): void {
  localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0')
}

// Vista de la sección "Canciones" del catálogo (S13 polish visual): grid vs.
// lista, recordada entre sesiones igual que el colapso del sidebar de arriba.
export type CatalogViewMode = 'list' | 'grid'
const CATALOG_VIEW_KEY = 'ui_catalog_view'

export function getCatalogViewMode(): CatalogViewMode {
  return localStorage.getItem(CATALOG_VIEW_KEY) === 'grid' ? 'grid' : 'list'
}

export function setCatalogViewMode(mode: CatalogViewMode): void {
  localStorage.setItem(CATALOG_VIEW_KEY, mode)
}

// Estado abierto/cerrado de las secciones colapsables del sidebar de
// Administración (SeguridadShell) — antes solo se abrían si contenían la
// ruta activa y se olvidaban al navegar a otra sección (S13 polish visual).
const ADMIN_SECTIONS_KEY = 'ui_admin_sections_open'

export function getAdminSectionsOpen(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(ADMIN_SECTIONS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function setAdminSectionOpen(label: string, open: boolean): void {
  const current = getAdminSectionsOpen()
  current[label] = open
  localStorage.setItem(ADMIN_SECTIONS_KEY, JSON.stringify(current))
}
