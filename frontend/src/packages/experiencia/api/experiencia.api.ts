import { apiClient, type ApiResponse } from '@shared/lib/api-client'
import type {
  EstadoTicket, PlanFamiliar, Recomendacion,
  SincronizacionResultado, Ticket, TicketBody, TopTrackPlaylist,
} from '../types'

export const experienciaApi = {
  // ── Recomendaciones (RF-EXP-002/003) ────────────────────────────────────────
  recomendaciones: (limit = 10) =>
    apiClient.get<{ data: Recomendacion[]; algoritmo: string }>(`/experiencia/recomendaciones?limit=${limit}`),

  // ── Tickets de soporte (RF-EXP-004/005) ─────────────────────────────────────
  crearTicket: (body: TicketBody) =>
    apiClient.post<{ status: string; fact_id: number; estado: EstadoTicket }>('/experiencia/tickets', body),

  misTickets: () =>
    apiClient.get<ApiResponse<Ticket>>('/experiencia/tickets'),

  ticketsAdmin: (estado?: string) =>
    apiClient.get<ApiResponse<Ticket>>(`/experiencia/tickets${estado ? `?estado=${estado}` : ''}`),

  actualizarTicket: (factId: number, estado: EstadoTicket) =>
    apiClient.put<{ status: string; fact_id: number; estado: EstadoTicket }>(`/experiencia/tickets/${factId}`, { estado }),

  // ── Reflejo de playlists (RF-EXP-006/007) ───────────────────────────────────
  sincronizarPlaylists: () =>
    apiClient.post<SincronizacionResultado>('/experiencia/playlists/sincronizar', {}),

  topTracksPlaylists: (limit = 20) =>
    apiClient.get<ApiResponse<TopTrackPlaylist>>(`/experiencia/playlists/top-tracks?limit=${limit}`),

  // ── Plan familiar (RF-EXP-008) ──────────────────────────────────────────────
  crearTitular: (usuarioId: string) =>
    apiClient.post<{ status: string; suscripcion_id: string; usuario_id: string; es_titular: boolean }>(
      '/experiencia/familia/titular', { usuario_id: usuarioId },
    ),

  verPlanFamiliar: (suscripcionId: string) =>
    apiClient.get<PlanFamiliar>(`/experiencia/familia/${suscripcionId}`),

  agregarMiembro: (suscripcionId: string, usuarioId: string) =>
    apiClient.post<{ status: string; total: number }>(
      `/experiencia/familia/${suscripcionId}/miembros`, { usuario_id: usuarioId },
    ),

  quitarMiembro: (suscripcionId: string, usuarioId: string) =>
    apiClient.delete<{ status: string }>(`/experiencia/familia/${suscripcionId}/miembros/${usuarioId}`),
}
