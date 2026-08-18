import { apiClient, type ApiResponse } from '@shared/lib/api-client'
import type {
  Anunciante, Campana, CampanaBody, CampanaEditBody, EstadoManualCampana,
  ImpresionAsignada, ImpresionDisplayAsignada, IngresoCampana,
} from '../types'

export const publicidadApi = {
  anunciantes: (page = 1, limit = 20) => {
    const p = new URLSearchParams()
    if (page > 1) p.set('page', String(page))
    if (limit !== 20) p.set('limit', String(limit))
    const qs = p.toString()
    return apiClient.get<ApiResponse<Anunciante>>(`/publicidad/admin/anunciantes${qs ? `?${qs}` : ''}`)
  },

  crearAnunciante: (body: { nombre: string; sector?: string }) =>
    apiClient.post<{ status: string; anunciante_id: number }>('/publicidad/admin/anunciantes', body),

  editarAnunciante: (anuncianteId: number, body: { nombre: string; sector?: string }) =>
    apiClient.put<{ status: string; anunciante_id: number }>(`/publicidad/admin/anunciantes/${anuncianteId}`, body),

  desactivarAnunciante: (anuncianteId: number) =>
    apiClient.post<{ status: string; anunciante_id: number; activo: number }>(`/publicidad/admin/anunciantes/${anuncianteId}/desactivar`, undefined),

  campanas: (params: { page?: number; limit?: number; estado?: string; tipo_anuncio?: string; q?: string } = {}) => {
    const p = new URLSearchParams()
    if ((params.page ?? 1) > 1) p.set('page', String(params.page))
    if (params.limit && params.limit !== 20) p.set('limit', String(params.limit))
    if (params.estado) p.set('estado', params.estado)
    if (params.tipo_anuncio) p.set('tipo_anuncio', params.tipo_anuncio)
    if (params.q) p.set('q', params.q)
    const qs = p.toString()
    return apiClient.get<ApiResponse<Campana>>(`/publicidad/admin/campanas${qs ? `?${qs}` : ''}`)
  },

  crearCampana: (body: CampanaBody) =>
    apiClient.post<{ status: string; campana_id: number }>('/publicidad/admin/campanas', body),

  editarCampana: (campanaId: number, body: CampanaEditBody) =>
    apiClient.put<{ status: string; campana_id: number }>(`/publicidad/admin/campanas/${campanaId}`, body),

  // Ciclo de vida de campaña (change p1-ciclos-vida): pausa/reanudación/cierre
  // MANUAL, independiente del agotamiento de presupuesto.
  transicionCampana: (campanaId: number, accion: 'pausar' | 'reanudar' | 'finalizar') =>
    apiClient.post<{ status: string; campana_id: number; estado_manual: EstadoManualCampana }>(`/publicidad/admin/campanas/${campanaId}/${accion}`, undefined),

  // Se llama al reproducir un track — el backend decide si corresponde
  // anuncio según el plan real del usuario (RF: usuarios premium nunca
  // reciben `campana`).
  impresion: () =>
    apiClient.post<ImpresionAsignada>('/publicidad/impresion', undefined),

  completarImpresion: (impresionId: string) =>
    apiClient.post<{ status: string; monto?: number; ya_reconocido?: boolean }>(
      `/publicidad/impresion/${impresionId}/completar`, undefined,
    ),

  // Se llama al cargar home/catálogo — independiente del reproductor. El
  // backend decide si corresponde banner según el plan real del usuario.
  impresionDisplay: () =>
    apiClient.post<ImpresionDisplayAsignada>('/publicidad/impresion-display', undefined),

  registrarClick: (impresionId: string) =>
    apiClient.post<{ status: string; monto?: number; ya_reconocido?: boolean }>(
      `/publicidad/impresion/${impresionId}/click`, undefined,
    ),

  ingresos: (campanaId?: number) =>
    apiClient.get<ApiResponse<IngresoCampana>>(
      `/publicidad/admin/ingresos${campanaId ? `?campana_id=${campanaId}` : ''}`,
    ),
}
