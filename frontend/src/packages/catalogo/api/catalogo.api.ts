import { apiClient, type ApiResponse } from '@shared/lib/api-client'
import type { Track, TrackDetail, AudioFeatures, Artist, Album, Genre, TracksSearchParams, SearchAllResultado } from '../types'

export const catalogoApi = {
  // ── Búsqueda unificada (change p2-descubrimiento-comunidad) ─────────────────
  // Una sola llamada para los 4 grupos, en vez de tres endpoints por entidad.
  searchAll: (q: string, limit = 5) =>
    apiClient.get<SearchAllResultado>(
      `/search?q=${encodeURIComponent(q)}&limit=${limit}`,
    ),

  // ── Tracks ──────────────────────────────────────────────────────────────────
  tracksTop: (limit = 20) =>
    apiClient.get<ApiResponse<Track>>(`/tracks/top?limit=${limit}`),

  tracksSearch: ({ q = '', genre = '', limit = 50, offset = 0, popularityMin, tempoMin, tempoMax, energyMin }: TracksSearchParams = {}) => {
    const qs = new URLSearchParams({ q, genre, limit: String(limit), offset: String(offset) })
    if (popularityMin != null) qs.set('popularity_min', String(popularityMin))
    if (tempoMin != null) qs.set('tempo_min', String(tempoMin))
    if (tempoMax != null) qs.set('tempo_max', String(tempoMax))
    if (energyMin != null) qs.set('energy_min', String(energyMin))
    return apiClient.get<ApiResponse<Track>>(`/tracks/search?${qs.toString()}`)
  },

  // ── Takedown administrativo (change p1-ciclos-vida, rol admin_contenido) ────
  tracksOcultos: (limit = 100) =>
    apiClient.get<ApiResponse<Track>>(`/admin/tracks/ocultos?limit=${limit}`),

  ocultarTrack: (factId: number) =>
    apiClient.post<{ status: string; fact_id: number; track_id: string; disponible: number }>(`/admin/tracks/${factId}/ocultar`, undefined),

  restaurarTrack: (factId: number) =>
    apiClient.post<{ status: string; fact_id: number; track_id: string; disponible: number }>(`/admin/tracks/${factId}/restaurar`, undefined),

  tracksByArtist: (artistId: number, limit = 20) =>
    apiClient.get<ApiResponse<Track>>(`/tracks/by-artist/${artistId}?limit=${limit}`),

  tracksByAlbum: (albumId: number, limit = 50) =>
    apiClient.get<ApiResponse<Track>>(`/tracks/by-album/${albumId}?limit=${limit}`),

  tracksByGenre: (genreId: number, limit = 50) =>
    apiClient.get<ApiResponse<Track>>(`/tracks/by-genre/${genreId}?limit=${limit}`),

  trackDetail: (trackId: string) =>
    apiClient.get<TrackDetail>(`/tracks/${trackId}`),

  trackDetailByFact: (factId: number) =>
    apiClient.get<TrackDetail>(`/tracks/fact/${factId}`),

  // Premium-only (backend responde 403 si el plan activo no es premium) —
  // ver RF de paywall real, `require_active_subscription("premium")`.
  audioFeatures: (factId: number) =>
    apiClient.get<AudioFeatures>(`/tracks/fact/${factId}/audio-features`),

  // ── Artists ─────────────────────────────────────────────────────────────────
  artistsTop: (limit = 20) =>
    apiClient.get<ApiResponse<Artist>>(`/artists/top?limit=${limit}`),

  artistsSearch: (q: string, limit = 20) =>
    apiClient.get<ApiResponse<Artist>>(`/artists/search?q=${encodeURIComponent(q)}&limit=${limit}`),

  artistDetail: (artistId: number) =>
    apiClient.get<Artist>(`/artists/${artistId}`),

  // ── Albums ──────────────────────────────────────────────────────────────────
  albumsSearch: (q: string, limit = 20) =>
    apiClient.get<ApiResponse<Album>>(`/albums/search?q=${encodeURIComponent(q)}&limit=${limit}`),

  albumDetail: (albumId: number) =>
    apiClient.get<Album>(`/albums/${albumId}`),

  // ── Genres ──────────────────────────────────────────────────────────────────
  genresList: () =>
    apiClient.get<ApiResponse<Genre>>('/genres'),

  genreDetail: (genreId: number) =>
    apiClient.get<Genre>(`/genres/${genreId}`),
}
