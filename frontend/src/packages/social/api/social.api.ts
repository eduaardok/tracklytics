import { apiClient, type ApiResponse } from '@shared/lib/api-client'
import type {
  ArtistaSeguido, SeguirResultado,
  Comentario, ComentarioBody, ComentarioResultado,
  ModerarComentarioBody, ModerarComentarioResultado,
  ComparticionBody, ComparticionResultado,
  DashboardSocial, FeedItem,
  NotificacionesResultado, PerfilPublico,
  Denuncia, DenunciaBody, EstadoDenuncia,
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

  // ── Denuncias de contenido (change p1-ciclos-vida) ──────────────────────────
  denunciar: (body: DenunciaBody) =>
    apiClient.post<{ status: string; denuncia_id: number; estado: string }>('/social/denuncias', body),

  denunciasAdmin: (params: { tipo_objeto?: string; motivo?: string; estado?: string; page?: number; limit?: number } = {}) => {
    const qs = new URLSearchParams()
    if (params.tipo_objeto) qs.set('tipo_objeto', params.tipo_objeto)
    if (params.motivo) qs.set('motivo', params.motivo)
    if (params.estado) qs.set('estado', params.estado)
    qs.set('page', String(params.page ?? 1))
    qs.set('limit', String(params.limit ?? 20))
    return apiClient.get<{ data: Denuncia[]; total: number; page: number; limit: number }>(`/social/admin/denuncias?${qs.toString()}`)
  },

  actualizarDenuncia: (denunciaId: number, estado: EstadoDenuncia) =>
    apiClient.put<{ status: string; denuncia_id: number; estado: string }>(`/social/admin/denuncias/${denunciaId}`, { estado }),

  // ── Compartir ────────────────────────────────────────────────────────────────
  compartir: (body: ComparticionBody) =>
    apiClient.post<ComparticionResultado>('/social/comparticiones', body),

  dashboard: () =>
    apiClient.get<DashboardSocial>('/social/admin/dashboard'),

  feed: () =>
    apiClient.get<ApiResponse<FeedItem>>('/social/feed'),

  // ── Notificaciones (S10 ronda 2) ────────────────────────────────────────────
  notificaciones: (limit = 30) =>
    apiClient.get<NotificacionesResultado>(`/social/notificaciones?limit=${limit}`),

  marcarNotificacionLeida: (factId: number) =>
    apiClient.patch<{ status: string }>(`/social/notificaciones/${factId}/leer`, {}),

  marcarTodasLeidas: () =>
    apiClient.patch<{ status: string }>('/social/notificaciones/leer-todas', {}),

  // ── Perfiles públicos ────────────────────────────────────────────────────────
  perfilPublico: (usuarioId: string) =>
    apiClient.get<PerfilPublico>(`/social/usuarios/${usuarioId}/perfil`),
}
