import { apiClient, type ApiResponse } from '@shared/lib/api-client'
import type { Track, TrackDetail, Artist, Album, Genre, TracksSearchParams } from '../types'

export const catalogoApi = {
  // ── Tracks ──────────────────────────────────────────────────────────────────
  tracksTop: (limit = 20) =>
    apiClient.get<ApiResponse<Track>>(`/tracks/top?limit=${limit}`),

  tracksSearch: ({ q = '', genre = '', limit = 50, offset = 0 }: TracksSearchParams = {}) =>
    apiClient.get<ApiResponse<Track>>(
      `/tracks/search?q=${encodeURIComponent(q)}&genre=${encodeURIComponent(genre)}&limit=${limit}&offset=${offset}`,
    ),

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
