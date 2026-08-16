import { apiClient } from '@shared/lib/api-client'
import { getDeviceId } from '@shared/lib/session'
import type { Favoritos, Historial, LikesResultado, Playlist, PlaylistDetail } from '../types'

export const bibliotecaApi = {
  // ── Favoritos ────────────────────────────────────────────────────────────────
  favoritos: () =>
    apiClient.get<Favoritos>('/biblioteca/favoritos'),

  agregarFavorito: (factId: number) =>
    apiClient.post<{ status: string; plan: string }>(`/biblioteca/favoritos/${factId}`, {}),

  quitarFavorito: (factId: number) =>
    apiClient.delete<{ status: string }>(`/biblioteca/favoritos/${factId}`),

  // ── Like/dislike ─────────────────────────────────────────────────────────────
  likes: (factId: number) =>
    apiClient.get<LikesResultado>(`/biblioteca/tracks/${factId}/likes`),

  // Batch (useLikes.ts agrupa N tracks visibles en una sola llamada — evita
  // que un listado de catálogo dispare un GET por TrackCard, hallazgo real
  // de rendimiento con 503 reproducido bajo carga, S16 prompt 09).
  likesBatch: (factIds: number[]) =>
    apiClient.get<{ data: Record<string, LikesResultado> }>(
      `/biblioteca/tracks/likes?fact_ids=${factIds.join(',')}`,
    ),

  likeTrack: (factId: number) =>
    apiClient.post<{ status: string }>(`/biblioteca/tracks/${factId}/like`, {}),

  dislikeTrack: (factId: number) =>
    apiClient.post<{ status: string }>(`/biblioteca/tracks/${factId}/dislike`, {}),

  quitarVoto: (factId: number) =>
    apiClient.delete<{ status: string }>(`/biblioteca/tracks/${factId}/like`),

  // ── Historial ────────────────────────────────────────────────────────────────
  historial: (limit = 50) =>
    apiClient.get<Historial>(`/biblioteca/historial?limit=${limit}`),

  // `dispositivo_id` habilita el evento de reproducción enriquecido
  // (RF-EXP-001, capability `experiencia`); `impresionId` (opcional) marca
  // como reproducida la recomendación de la que proviene este play, si aplica
  // (RF-EXP-003) — ver api/paquetes/biblioteca/router.py::add_historial.
  registrarReproduccion: (factId: number, impresionId?: number) =>
    apiClient.post<{ status: string }>(`/biblioteca/historial/${factId}`, {
      dispositivo_id: getDeviceId(),
      ...(impresionId != null ? { impresion_id: impresionId } : {}),
    }),

  // ── Playlists ────────────────────────────────────────────────────────────────
  playlists: () =>
    apiClient.get<{ data: Playlist[] }>('/biblioteca/playlists'),

  playlistDetalle: (playlistId: string) =>
    apiClient.get<PlaylistDetail>(`/biblioteca/playlists/${playlistId}`),

  crearPlaylist: (name: string) =>
    apiClient.post<Playlist>('/biblioteca/playlists', { name }),

  renombrarPlaylist: (playlistId: string, name: string) =>
    apiClient.patch<{ playlist_id: string; name: string }>(`/biblioteca/playlists/${playlistId}`, { name }),

  eliminarPlaylist: (playlistId: string) =>
    apiClient.delete<{ status: string }>(`/biblioteca/playlists/${playlistId}`),

  agregarTrackAPlaylist: (playlistId: string, factId: number) =>
    apiClient.post<{ status: string; already_added: boolean }>(
      `/biblioteca/playlists/${playlistId}/tracks`, { fact_id: factId },
    ),

  quitarTrackDePlaylist: (playlistId: string, factId: number) =>
    apiClient.delete<{ status: string }>(`/biblioteca/playlists/${playlistId}/tracks/${factId}`),

  reordenarPlaylist: (playlistId: string, factIds: number[]) =>
    apiClient.put<{ status: string }>(`/biblioteca/playlists/${playlistId}/reordenar`, { fact_ids: factIds }),

  agregarColaborador: (playlistId: string, email: string) =>
    apiClient.post<{ status: string; usuario_id: string; nombre: string }>(
      `/biblioteca/playlists/${playlistId}/colaboradores`, { email },
    ),

  quitarColaborador: (playlistId: string, usuarioId: string) =>
    apiClient.delete<{ status: string }>(`/biblioteca/playlists/${playlistId}/colaboradores/${usuarioId}`),

  // Perfiles públicos (S10 ronda 2): el dueño decide cuáles de sus playlists
  // expone en su perfil público.
  actualizarVisibilidadPlaylist: (playlistId: string, esPublica: boolean) =>
    apiClient.patch<{ playlist_id: string; name: string; es_publica: boolean }>(
      `/biblioteca/playlists/${playlistId}/visibilidad`, { es_publica: esPublica },
    ),
}
