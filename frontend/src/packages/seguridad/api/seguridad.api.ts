import { apiClient, type ApiResponse } from '@shared/lib/api-client'
import type {
  Permiso, AuditLogEntry, ErrorSistemaEntry, AsignarPermisoBody, DashboardSeguridad, CatalogoPermisos,
  UsuarioAdmin, RolAdmin, RolAdminResumen, Usuario360, Strike, StrikeEmitidoResultado,
  UsuarioReporte, StrikeGlobal, SesionActiva,
} from '../types'

export type UsuariosAdminFiltros = {
  page?:        number
  limit?:       number
  rol?:         string
  estado?:      string
  fechaDesde?:  string
  fechaHasta?:  string
}

// Estos endpoints son admin-only (require_admin en el backend) — el header
// Authorization lo inyecta `apiClient` (shared/lib/api-client.ts) a partir de
// la sesión guardada en shared/lib/session.ts tras login (ver auth.api.ts).
export const seguridadApi = {
  permisos: (usuarioId: string) =>
    apiClient.get<ApiResponse<Permiso>>(`/seguridad/permisos/${usuarioId}`),

  asignarPermiso: (body: AsignarPermisoBody) =>
    apiClient.post<{ status: string }>('/seguridad/permisos', body),

  catalogoPermisos: () =>
    apiClient.get<CatalogoPermisos>('/seguridad/permisos/catalogo'),

  auditoria: (limit = 50) =>
    apiClient.get<ApiResponse<AuditLogEntry>>(`/seguridad/auditoria?limit=${limit}`),

  errores: (limit = 50) =>
    apiClient.get<ApiResponse<ErrorSistemaEntry>>(`/seguridad/errores?limit=${limit}`),

  dashboard: () =>
    apiClient.get<DashboardSeguridad>('/seguridad/admin/dashboard'),

  // ── Gestión administrativa de usuarios (change roles-gestion-usuarios) ───────
  rolesAdmin: () =>
    apiClient.get<ApiResponse<RolAdmin>>('/seguridad/admin/roles-admin'),

  // Landing de /seguridad (S17): mismo catálogo + usuarios_asignados.
  rolesAdminResumen: () =>
    apiClient.get<ApiResponse<RolAdminResumen>>('/seguridad/admin/roles-admin/resumen'),

  usuarios: (f: UsuariosAdminFiltros = {}) => {
    const p = new URLSearchParams()
    if (f.page)       p.set('page', String(f.page))
    if (f.limit)      p.set('limit', String(f.limit))
    if (f.rol)        p.set('rol', f.rol)
    if (f.estado)     p.set('estado', f.estado)
    if (f.fechaDesde) p.set('fecha_desde', f.fechaDesde)
    if (f.fechaHasta) p.set('fecha_hasta', f.fechaHasta)
    const qs = p.toString()
    return apiClient.get<ApiResponse<UsuarioAdmin>>(`/seguridad/admin/usuarios${qs ? `?${qs}` : ''}`)
  },

  usuario360: (usuarioId: string) =>
    apiClient.get<Usuario360>(`/seguridad/admin/usuarios/${usuarioId}`),

  asignarRolAdmin: (usuarioId: string, rolAdmin: string) =>
    apiClient.post<{ status: string }>(`/seguridad/admin/usuarios/${usuarioId}/rol-admin`, { rol_admin: rolAdmin }),

  revocarRolAdmin: (usuarioId: string, rolAdmin: string) =>
    apiClient.delete<{ status: string }>(`/seguridad/admin/usuarios/${usuarioId}/rol-admin/${rolAdmin}`),

  suspenderUsuario: (usuarioId: string) =>
    apiClient.post<{ status: string; estado_cuenta: string }>(`/seguridad/admin/usuarios/${usuarioId}/suspender`, {}),

  reactivarUsuario: (usuarioId: string) =>
    apiClient.post<{ status: string; estado_cuenta: string }>(`/seguridad/admin/usuarios/${usuarioId}/reactivar`, {}),

  // ── Sanciones (change p2-descubrimiento-comunidad, rol admin_comunidad) ─────
  strikesDeUsuario: (usuarioId: string) =>
    apiClient.get<{ data: Strike[]; total: number; activos: number }>(
      `/seguridad/admin/usuarios/${usuarioId}/strikes`,
    ),

  emitirStrike: (usuarioId: string, motivo: string) =>
    apiClient.post<StrikeEmitidoResultado>(
      `/seguridad/admin/usuarios/${usuarioId}/strikes`, { motivo },
    ),

  // ── Reportes administrativos (S12) ──────────────────────────────────────────
  usuariosReporte: () =>
    apiClient.get<{ usuarios: UsuarioReporte[] }>('/seguridad/admin/usuarios-reporte'),

  strikesGlobal: (page = 1, limit = 50) => {
    const p = new URLSearchParams()
    if (page > 1) p.set('page', String(page))
    if (limit !== 50) p.set('limit', String(limit))
    const qs = p.toString()
    return apiClient.get<ApiResponse<StrikeGlobal>>(`/seguridad/admin/strikes${qs ? `?${qs}` : ''}`)
  },

  // Obj 30 / OT-30 (S13-P2). `total` es el conteo real (sin el LIMIT de
  // `sesiones`) — necesario para no mostrar un KPI capado a la página.
  sesionesActivas: () =>
    apiClient.get<{ sesiones: SesionActiva[]; total: number }>('/seguridad/admin/sesiones-activas'),
}
