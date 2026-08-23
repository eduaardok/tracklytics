import { apiClient, type ApiResponse } from '@shared/lib/api-client'
import type {
  ArtistaSeguido, SeguirResultado,
  Comentario, ComentarioBody, ComentarioResultado,
  ModerarComentarioBody, ModerarComentarioResultado,
  ComparticionBody, ComparticionResultado,
  DashboardSocial, FeedItem,
  NotificacionesResultado, PerfilPublico, PerfilPublicoResultado,
  Denuncia, DenunciaBody, EstadoDenuncia,
  ActualizarDenunciaResultado, UsuarioBloqueado, NotificacionAdmin,
} from '../types'

export type PreferenciaNotificacion = { tipo: string; activo: boolean }

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
  // Paginado (antes traía TODA `FACT_COMENTARIO` de una vez — ~38k filas,
  // ~11.5MB de JSON, colgaba /seguridad/social al renderizar una lista sin
  // virtualizar con eso) — mismo contrato page/limit/total que `denunciasAdmin`.
  comentariosAdmin: (params: { factIdTrack?: number; estado?: string; page?: number; limit?: number } = {}) => {
    const qs = new URLSearchParams()
    if (params.factIdTrack != null) qs.set('fact_id_track', String(params.factIdTrack))
    if (params.estado) qs.set('estado', params.estado)
    qs.set('page', String(params.page ?? 1))
    qs.set('limit', String(params.limit ?? 20))
    return apiClient.get<{ data: Comentario[]; total: number; page: number; limit: number }>(
      `/social/admin/comentarios?${qs.toString()}`,
    )
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

  // `emitirStrike` sanciona al autor del contenido en la misma acción que
  // resuelve la denuncia (change p2-descubrimiento-comunidad).
  actualizarDenuncia: (
    denunciaId: number, estado: EstadoDenuncia,
    opciones: { emitirStrike?: boolean; motivo?: string } = {},
  ) =>
    apiClient.put<ActualizarDenunciaResultado>(`/social/admin/denuncias/${denunciaId}`, {
      estado,
      emitir_strike: opciones.emitirStrike ?? false,
      motivo: opciones.motivo ?? '',
    }),

  // ── Bloqueo usuario-a-usuario (change p2-descubrimiento-comunidad) ──────────
  bloquear: (usuarioId: string) =>
    apiClient.post<{ status: string; bloqueado_id: string }>('/social/bloqueos', { usuario_id: usuarioId }),

  desbloquear: (usuarioId: string) =>
    apiClient.delete<{ status: string; desbloqueado_id: string }>(`/social/bloqueos/${usuarioId}`),

  misBloqueados: () =>
    apiClient.get<ApiResponse<UsuarioBloqueado>>('/social/bloqueos'),

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

  // ── Preferencias de notificación — opt-out por tipo (P2, S16) ───────────────
  preferenciasNotificacion: () =>
    apiClient.get<{ data: PreferenciaNotificacion[] }>('/social/notificaciones/preferencias'),

  actualizarPreferenciaNotificacion: (tipo: string, activo: boolean) =>
    apiClient.put<{ status: string; tipo: string; activo: boolean }>(
      `/social/notificaciones/preferencias/${tipo}`, { activo },
    ),

  // ── Perfiles públicos ────────────────────────────────────────────────────────
  perfilPublico: (usuarioId: string) =>
    apiClient.get<PerfilPublico>(`/social/usuarios/${usuarioId}/perfil`),

  // Descubrimiento de perfiles públicos por nombre (S16) — puerta de entrada
  // a perfilPublico() para quien no conoce ya el usuario_id.
  buscarPerfiles: (q: string) =>
    apiClient.get<ApiResponse<PerfilPublicoResultado>>(`/social/usuarios/buscar?q=${encodeURIComponent(q)}`),

  // ── Reportes administrativos (S12) ──────────────────────────────────────────
  notificacionesAdmin: () =>
    apiClient.get<{ notificaciones: NotificacionAdmin[] }>('/social/admin/notificaciones'),
}
