import { apiClient, type ApiResponse } from '@shared/lib/api-client'
import type {
  ArtistaSeguido, SeguirResultado,
  Comentario, ComentarioBody, ComentarioResultado,
  ModerarComentarioBody, ModerarComentarioResultado,
  ComparticionBody, ComparticionResultado,
} from '../types'

export const socialApi = {
  // ── Seguimiento de artistas ────────────────────────────────────────────────
  misSeguidos: () =>
    apiClient.get<ApiResponse<ArtistaSeguido>>('/social/seguimiento'),

  seguirArtista: (artistaId: number) =>
    apiClient.post<SeguirResultado>(`/social/seguimiento/${artistaId}`, {}),

  dejarDeSeguir: (artistaId: number) =>
    apiClient.delete<SeguirResultado>(`/social/seguimiento/${artistaId}`),

  // ── Comentarios ─────────────────────────────────────────────────────────────
  comentariosDeTrack: (factIdTrack: number) =>
    apiClient.get<ApiResponse<Comentario>>(`/social/comentarios/${factIdTrack}`),

  comentar: (body: ComentarioBody) =>
    apiClient.post<ComentarioResultado>('/social/comentarios', body),

  // ── Moderación (admin) ──────────────────────────────────────────────────────
  comentariosAdmin: (params: { factIdTrack?: number; estado?: string } = {}) => {
    const qs = new URLSearchParams()
    if (params.factIdTrack != null) qs.set('fact_id_track', String(params.factIdTrack))
    if (params.estado) qs.set('estado', params.estado)
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    return apiClient.get<ApiResponse<Comentario>>(`/social/admin/comentarios${suffix}`)
  },

  moderarComentario: (factId: number, body: ModerarComentarioBody) =>
    apiClient.post<ModerarComentarioResultado>(`/social/admin/comentarios/${factId}/moderar`, body),

  // ── Compartir ────────────────────────────────────────────────────────────────
  compartir: (body: ComparticionBody) =>
    apiClient.post<ComparticionResultado>('/social/comparticiones', body),
}
