import { apiClient, type ApiResponse } from '@shared/lib/api-client'
import type {
  CuentaArtista, SubidaTrack, DashboardCreadores,
  SolicitudCuentaBody, SolicitudCuentaResultado,
  ResolverCuentaBody, ResolverCuentaResultado,
  SubidaTrackBody, SubidaTrackResultado,
  ResolverTrackBody, ResolverTrackResultado,
} from '../types'

// Estos endpoints requieren sesión — el header Authorization lo inyecta
// `apiClient` a partir de la sesión guardada por `seguridad` tras login.
export const creadoresApi = {
  miCuenta: () =>
    apiClient.get<CuentaArtista>('/creadores/cuenta'),

  solicitarCuenta: (body: SolicitudCuentaBody) =>
    apiClient.post<SolicitudCuentaResultado>('/creadores/cuenta', body),

  cuentasAdmin: (estado?: string) =>
    apiClient.get<ApiResponse<CuentaArtista>>(
      `/creadores/admin/cuentas${estado ? `?estado=${estado}` : ''}`,
    ),

  resolverCuenta: (cuentaArtistaId: string, body: ResolverCuentaBody) =>
    apiClient.post<ResolverCuentaResultado>(`/creadores/admin/cuentas/${cuentaArtistaId}/resolver`, body),

  misTracks: () =>
    apiClient.get<ApiResponse<SubidaTrack>>('/creadores/tracks'),

  subirTrack: (body: SubidaTrackBody) =>
    apiClient.post<SubidaTrackResultado>('/creadores/tracks', body),

  tracksAdmin: (estado?: string) =>
    apiClient.get<ApiResponse<SubidaTrack>>(
      `/creadores/admin/tracks${estado ? `?estado=${estado}` : ''}`,
    ),

  resolverTrack: (subidaId: string, body: ResolverTrackBody) =>
    apiClient.post<ResolverTrackResultado>(`/creadores/admin/tracks/${subidaId}/resolver`, body),

  dashboard: () =>
    apiClient.get<DashboardCreadores>('/creadores/admin/dashboard'),
}
