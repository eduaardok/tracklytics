import { apiClient, type ApiResponse } from '@shared/lib/api-client'
import type {
  Sello, SelloBody, AsignarSelloBody,
  Pais, CanalDistribucion, TipoRestriccion,
  Licencia, LicenciaBody,
  Restriccion, RestriccionBody,
  Disponibilidad,
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
}
