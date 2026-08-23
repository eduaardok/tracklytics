import { apiClient, type ApiResponse } from '@shared/lib/api-client'
import type {
  AnaliticaArtista,
  CuentaArtista, SubidaTrack, DashboardCreadores,
  SolicitudCuentaBody, SolicitudCuentaResultado,
  ResolverCuentaBody, ResolverCuentaResultado,
  SubidaTrackBody, SubidaTrackResultado,
  ResolverTrackBody, ResolverTrackResultado,
  EditarTrackBody,
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

  // Analítica propia del artista (R2, S16-P9): engagement real sobre los
  // tracks promovidos propios. 403 si la cuenta no está aprobada.
  // (Sobre `ApiResponse<T>`: ese tipo modela el envelope LISTADO — data es
  // T[]. Este endpoint devuelve UN objeto, así que va tipado explícito.)
  miAnalitica: () =>
    apiClient.get<{ data: AnaliticaArtista }>('/creadores/mi-analitica'),

  subirTrack: (body: SubidaTrackBody) =>
    apiClient.post<SubidaTrackResultado>('/creadores/tracks', body),

  // Ciclo de vida de un track propio (change p1-ciclos-vida).
  editarTrack: (subidaId: string, body: EditarTrackBody) =>
    apiClient.put<{ status: string; subida_id: string; estado: string }>(`/creadores/tracks/${subidaId}`, body),

  retirarTrack: (subidaId: string) =>
    apiClient.post<{ status: string; subida_id: string; estado: string; disponible: number }>(`/creadores/tracks/${subidaId}/retirar`, undefined),

  tracksAdmin: (estado?: string) =>
    apiClient.get<ApiResponse<SubidaTrack>>(
      `/creadores/admin/tracks${estado ? `?estado=${estado}` : ''}`,
    ),

  resolverTrack: (subidaId: string, body: ResolverTrackBody) =>
    apiClient.post<ResolverTrackResultado>(`/creadores/admin/tracks/${subidaId}/resolver`, body),

  dashboard: () =>
    apiClient.get<DashboardCreadores>('/creadores/admin/dashboard'),
}
