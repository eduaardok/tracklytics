import { apiClient, type ApiResponse } from '@shared/lib/api-client'
import type { Anunciante, Campana, CampanaBody, ImpresionAsignada, IngresoCampana } from '../types'

export const publicidadApi = {
  anunciantes: () =>
    apiClient.get<ApiResponse<Anunciante>>('/publicidad/admin/anunciantes'),

  crearAnunciante: (body: { nombre: string; sector?: string }) =>
    apiClient.post<{ status: string; anunciante_id: number }>('/publicidad/admin/anunciantes', body),

  campanas: () =>
    apiClient.get<ApiResponse<Campana>>('/publicidad/admin/campanas'),

  crearCampana: (body: CampanaBody) =>
    apiClient.post<{ status: string; campana_id: number }>('/publicidad/admin/campanas', body),

  // Se llama al reproducir un track — el backend decide si corresponde
  // anuncio según el plan real del usuario (RF: usuarios premium nunca
  // reciben `campana`).
  impresion: () =>
    apiClient.post<ImpresionAsignada>('/publicidad/impresion', undefined),

  completarImpresion: (impresionId: string) =>
    apiClient.post<{ status: string; monto?: number; ya_reconocido?: boolean }>(
      `/publicidad/impresion/${impresionId}/completar`, undefined,
    ),

  ingresos: (campanaId?: number) =>
    apiClient.get<ApiResponse<IngresoCampana>>(
      `/publicidad/admin/ingresos${campanaId ? `?campana_id=${campanaId}` : ''}`,
    ),
}
