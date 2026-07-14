import { apiClient, type ApiResponse } from '@shared/lib/api-client'
import type {
  EstadoTicket, MiFamilia, PlanFamiliar, Recomendacion, SeccionRecomendaciones,
  SincronizacionResultado, Ticket, TicketBody, TopTrackPlaylist,
  DashboardExperiencia,
} from '../types'

export const experienciaApi = {
  // ── Recomendaciones (RF-EXP-002/003) ────────────────────────────────────────
  recomendaciones: (limit = 10) =>
    apiClient.get<{ secciones: SeccionRecomendaciones[] }>(`/experiencia/recomendaciones?limit=${limit}`),

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

  resolverSuscripcionDeUsuario: (usuarioId: string) =>
    apiClient.get<{ suscripcion_id: string }>(`/experiencia/familia/resolver-suscripcion/${usuarioId}`),

  agregarMiembro: (suscripcionId: string, usuarioId: string) =>
    apiClient.post<{ status: string; total: number }>(
      `/experiencia/familia/${suscripcionId}/miembros`, { usuario_id: usuarioId },
    ),

  quitarMiembro: (suscripcionId: string, usuarioId: string) =>
    apiClient.delete<{ status: string }>(`/experiencia/familia/${suscripcionId}/miembros/${usuarioId}`),

  // ── Plan familiar, autoservicio del titular (CU-O51/52/53, cambio 2026-07-09) ──
  // A diferencia de los 4 de arriba (admin, requieren `suscripcion_id` y rol
  // admin), estos operan siempre sobre el usuario autenticado.
  crearMiPlanFamiliar: () =>
    apiClient.post<{ status: string; suscripcion_id: string; es_titular: boolean }>('/experiencia/familia', {}),

  miPlanFamiliar: () =>
    apiClient.get<MiFamilia>('/experiencia/familia'),

  agregarMiMiembro: (email: string) =>
    apiClient.post<{ status: string; usuario_id: string; nombre: string; total: number }>(
      '/experiencia/familia/miembros', { email },
    ),

  quitarMiMiembro: (usuarioId: string) =>
    apiClient.delete<{ status: string }>(`/experiencia/familia/miembros/${usuarioId}`),

  dashboard: () =>
    apiClient.get<DashboardExperiencia>('/experiencia/admin/dashboard'),
}
