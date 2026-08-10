import type { SessionUser } from './session'

// Roles administrativos por área (BRIDGE_USUARIO_ROL_ADMIN) + 'superadmin' +
// 'analyst' (rol B2B nativo de PocketBase, no vive en el BRIDGE). Único
// lugar del frontend que enumera estos strings — todo lo demás (sidebar,
// landing post-login, badge) los consume desde acá para no repetir la lista.
export const ROLES_ADMIN_AREA = [
  'admin_finanzas', 'admin_contenido', 'admin_comunidad',
  'admin_datos', 'admin_comercial',
] as const
export type RolAdminArea = (typeof ROLES_ADMIN_AREA)[number]

export const ROL_LABELS: Record<string, string> = {
  superadmin:       'Superadmin',
  admin_finanzas:   'Admin · Finanzas',
  admin_contenido:  'Admin · Contenido',
  admin_comunidad:  'Admin · Comunidad',
  admin_datos:      'Admin · Datos',
  admin_comercial:  'Admin · Comercial',
  analyst:          'Analista',
  user:             'Usuario',
}

// Color por rol para el badge (Fase 4.3) — mismo violeta del design system
// para los roles admin genéricos, un acento distinto por área para que un
// evaluador vea de un vistazo que cada cuenta demo es distinta.
export const ROL_COLORS: Record<string, string> = {
  superadmin:      'oklch(0.68 0.14 290)', // primary-light
  admin_finanzas:  'oklch(0.72 0.16 150)', // success
  admin_contenido: 'oklch(0.70 0.14 195)', // accent/teal
  admin_comunidad: 'oklch(0.78 0.18 70)',  // warning/ámbar
  admin_datos:     'oklch(0.65 0.20 320)', // magenta
  admin_comercial: 'oklch(0.65 0.22 25)',  // error/rojo (marca, no estado)
  analyst:         'oklch(0.58 0.010 285)', // muted
}

// Todos los roles administrativos vigentes de la sesión — el bootstrap
// `role==='admin'` de PocketBase (cuenta superadmin original, sin fila en el
// BRIDGE) se trata como 'superadmin' explícito para que la misma lógica de
// visibilidad sirva para ambos casos. `rolesAdmin` puede además incluir
// 'superadmin' literal si el BRIDGE ya tiene esa fila (S14-P3: la cuenta
// superadmin demo quedó con `role` crudo "user" en PocketBase + fila BRIDGE).
export function rolesDeUsuario(user: SessionUser | null): string[] {
  if (!user) return []
  const roles = new Set(user.rolesAdmin ?? [])
  if (user.role === 'admin') roles.add('superadmin')
  if (user.role === 'analyst') roles.add('analyst')
  return [...roles]
}

export function esSuperadmin(user: SessionUser | null): boolean {
  return rolesDeUsuario(user).includes('superadmin')
}

// Un elemento de nav (sección/link/depto) sin `roles` es visible para
// cualquier admin (comportamiento histórico, para no ocultar nada que este
// cambio no haya mapeado explícitamente). Con `roles`, superadmin siempre
// pasa (ve todo) y el resto exige intersección real.
export function puedeVer(rolesRequeridos: string[] | undefined, userRoles: string[]): boolean {
  if (!rolesRequeridos || rolesRequeridos.length === 0) return true
  if (userRoles.includes('superadmin')) return true
  return rolesRequeridos.some((r) => userRoles.includes(r))
}

// Destino de aterrizaje post-login para cuentas admin/analyst (Fase 4.2) —
// primer rol con match en la tabla gana; superadmin siempre al dashboard
// ejecutivo. Cuentas B2C (`role==='user'` sin rolesAdmin) no pasan por acá,
// las resuelve `resolverDestinoPostAuth` (planes) en su lugar.
const LANDING_POR_ROL: Record<string, string> = {
  superadmin:      '/analitica',
  admin_finanzas:  '/seguridad/finanzas',
  admin_contenido: '/seguridad/catalogo',
  admin_comunidad: '/seguridad/social',
  admin_datos:     '/seguridad/ingesta',
  admin_comercial: '/seguridad/partners',
  analyst:         '/analitica',
}

export function landingPostLogin(user: SessionUser | null): string | null {
  const roles = rolesDeUsuario(user)
  if (roles.includes('superadmin')) return LANDING_POR_ROL.superadmin
  for (const r of roles) {
    if (LANDING_POR_ROL[r]) return LANDING_POR_ROL[r]
  }
  return null
}
