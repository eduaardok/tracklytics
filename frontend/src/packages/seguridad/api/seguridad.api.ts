import { apiClient, type ApiResponse } from '@shared/lib/api-client'
import type { Permiso, AuditLogEntry, ErrorSistemaEntry, AsignarPermisoBody, DashboardSeguridad, CatalogoPermisos } from '../types'

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
}
