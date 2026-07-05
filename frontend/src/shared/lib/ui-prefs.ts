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
