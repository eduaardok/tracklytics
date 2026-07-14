import { apiClient, type ApiResponse } from '@shared/lib/api-client'
import type {
  Sello, SelloBody, AsignarSelloBody,
  Pais, CanalDistribucion, TipoRestriccion,
  Licencia, LicenciaBody,
  Restriccion, RestriccionBody,
  Disponibilidad, DashboardDistribucion,
  EstadoDisponibilidadFiltro, DisponibilidadListaResponse,
  SolicitudLicencia, SolicitudLicenciaBody, RechazarSolicitudBody, EstadoSolicitudLicencia,
} from '../types'

export const distribucionApi = {
  // ── Sellos discográficos ────────────────────────────────────────────────────
  sellos: () =>
    apiClient.get<ApiResponse<Sello>>('/distribucion/sellos'),

  crearSello: (body: SelloBody) =>
    apiClient.post<{ status: string; sello_id: number; nombre: string }>('/distribucion/sellos', body),

  editarSello: (selloId: number, body: SelloBody) =>
    apiClient.put<{ status: string; sello_id: number; nombre: string }>(`/distribucion/sellos/${selloId}`, body),

  asignarSelloArtista: (artistId: number, body: AsignarSelloBody) =>
    apiClient.put<{ status: string }>(`/distribucion/artistas/${artistId}/sello`, body),

  asignarSelloAlbum: (albumId: number, body: AsignarSelloBody) =>
    apiClient.put<{ status: string }>(`/distribucion/albumes/${albumId}/sello`, body),

  // ── Catálogos fijos (soporte de dropdowns) ──────────────────────────────────
  paises: () =>
    apiClient.get<ApiResponse<Pais>>('/distribucion/paises'),

  // Sin sesión — usado por registro/perfil para poblar el <select> de país
  // (RF-DIS-007/CU-O41, auditoría 2026-07-09): antes era texto libre y
  // `resolver_pais_id` fallaba en silencio contra `DIM_PAIS`.
  paisesPublico: () =>
    apiClient.get<ApiResponse<Pais>>('/distribucion/paises/publico'),

  canales: () =>
    apiClient.get<ApiResponse<CanalDistribucion>>('/distribucion/canales'),

  tiposRestriccion: () =>
    apiClient.get<ApiResponse<TipoRestriccion>>('/distribucion/tipos-restriccion'),

  // ── Licencias ────────────────────────────────────────────────────────────────
  licencias: (params: { selloId?: number; paisId?: number } = {}) => {
    const qs = new URLSearchParams()
    if (params.selloId != null) qs.set('sello_id', String(params.selloId))
    if (params.paisId != null) qs.set('pais_id', String(params.paisId))
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    return apiClient.get<ApiResponse<Licencia>>(`/distribucion/licencias${suffix}`)
  },

  crearLicencia: (body: LicenciaBody) =>
    apiClient.post<{ status: string; licencia_id: number }>('/distribucion/licencias', body),

  // ── Solicitudes de licencia ──────────────────────────────────────────────────
  // Interino: sin login de "sello" todavía (solo admin/user/analyst vía
  // PocketBase), el admin crea la solicitud en nombre del sello — mismo
  // criterio que `crearLicencia` arriba.
  crearSolicitudLicencia: (body: SolicitudLicenciaBody) =>
    apiClient.post<{ status: string; solicitud_id: string; estado: string }>('/distribucion/solicitudes-licencia', body),

  solicitudesLicencia: (estado?: EstadoSolicitudLicencia) => {
    const suffix = estado ? `?estado=${estado}` : ''
    return apiClient.get<ApiResponse<SolicitudLicencia>>(`/distribucion/solicitudes-licencia${suffix}`)
  },

  solicitudesLicenciaDeSello: (selloId: number) =>
    apiClient.get<ApiResponse<SolicitudLicencia>>(`/distribucion/sellos/${selloId}/solicitudes-licencia`),

  aprobarSolicitudLicencia: (solicitudId: string) =>
    apiClient.post<{ status: string; solicitud_id: string; estado: string; licencia_ids: number[] }>(
      `/distribucion/solicitudes-licencia/${solicitudId}/aprobar`, {},
    ),

  rechazarSolicitudLicencia: (solicitudId: string, body: RechazarSolicitudBody) =>
    apiClient.post<{ status: string; solicitud_id: string; estado: string }>(
      `/distribucion/solicitudes-licencia/${solicitudId}/rechazar`, body,
    ),

  // ── Restricciones de reproducción ───────────────────────────────────────────
  restricciones: (factIdTrack: number) =>
    apiClient.get<ApiResponse<Restriccion>>(`/distribucion/restricciones?fact_id_track=${factIdTrack}`),

  crearRestriccion: (body: RestriccionBody) =>
    apiClient.post<{ status: string }>('/distribucion/restricciones', body),

  desactivarRestriccion: (factIdTrack: number, paisId: number, canalId: number) =>
    apiClient.delete<{ status: string }>(`/distribucion/restricciones/${factIdTrack}/${paisId}/${canalId}`),

  // ── Disponibilidad (B2C, solo lectura) ──────────────────────────────────────
  disponibilidad: (factIdTrack: number) =>
    apiClient.get<Disponibilidad>(`/distribucion/disponibilidad/${factIdTrack}`),

  disponibilidadLista: (params: { page?: number; limit?: number; estado?: EstadoDisponibilidadFiltro; search?: string } = {}) => {
    const qs = new URLSearchParams()
    qs.set('page', String(params.page ?? 1))
    qs.set('limit', String(params.limit ?? 50))
    qs.set('estado', params.estado ?? 'todos')
    if (params.search && params.search.trim()) qs.set('search', params.search.trim())
    return apiClient.get<DisponibilidadListaResponse>(`/distribucion/disponibilidad?${qs.toString()}`)
  },

  dashboard: () =>
    apiClient.get<DashboardDistribucion>('/distribucion/admin/dashboard'),
}
