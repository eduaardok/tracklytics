export type Track = {
  fact_id:      number
  track_id:     string
  track_name:   string
  artist_name:  string
  genre_name:   string
  popularity:   number
  duration_ms:  number
  danceability: number
  energy:       number
  valence:      number
  // RF-EXP-009: portada real (álbum si existe, si no la del artista) — null
  // cuando no hay portada resuelta o el track no pertenece al catálogo
  // licenciado base; el frontend usa el reemplazo visual local en ese caso.
  imagen_url?:  string | null
  // S14-P1: detección de featuring, derivada de track_name en el backend
  // (`core/featuring.py`) — nunca se escribe a FACT_TRACKS.
  es_featuring?:     boolean
  artista_principal?: string
  artistas_feat?:      string[]
  // S13-P6: marcador de catálogo (frontend-only) — 'synthetic' identifica
  // los ~1M tracks generados sintéticamente (vs. ~113k reales), nunca se
  // usa para filtrar ni se persiste ningún cambio a partir de este campo.
  source_type?: 'real' | 'synthetic' | 'user_uploaded'
}

// `danceability/energy/valence/speechiness/acousticness/instrumentalness/
// liveness` ya NO viajan en `TrackDetail` — solo `GET
// /tracks/fact/{fact_id}/audio-features` (premium, ver `AudioFeatures` abajo)
// las expone. Antes viajaban aquí siempre y el paywall de TrackDetailPage
// era 100% del cliente (auditoría 2026-07-10, cierre de `require_active_
// subscription`) — un usuario free podía leerlas igual desde Network.
export type TrackDetail = Omit<Track, 'danceability' | 'energy' | 'valence'> & {
  loudness:   number
  tempo:      number
  artist_id:  number
  album_name: string
  album_id:   number
}

export type AudioFeatures = {
  danceability:     number
  energy:           number
  valence:          number
  acousticness:     number
  speechiness:      number
  instrumentalness: number
  liveness:         number
}

export type Artist = {
  artist_id:       number
  name:            string
  track_count:     number
  avg_popularity?: number
  avg_energy?:     number
  avg_danceability?: number
  avg_valence?:    number
  country?:        string
  record_label?:   string
  imagen_url?:     string | null
}

export type Album = {
  album_id:             number
  name:                 string
  release_year?:        number
  album_type?:          string
  total_tracks_listed?: number
  language?:            string
  track_count?:         number
  avg_popularity?:      number
  imagen_url?:          string | null
}

export type Genre = {
  genre_id:       number
  name:           string
  mood?:          string
  parent_genre?:  string
  origin_decade?: number
  track_count?:   number
  avg_popularity?: number
  // S14-P1: portada del track más popular del género que ya tenga imagen
  // resuelta — null si ninguno la tiene aún (el frontend mantiene el color
  // plano en ese caso).
  imagen_url?:    string | null
}

export type TracksSearchParams = {
  q?:      string
  genre?:  string
  limit?:  number
  offset?: number
  // Filtros avanzados (S10 Día 3) — antes la búsqueda solo filtraba por
  // texto/género pese a que popularity/tempo/energy ya viajaban en cada Track.
  popularityMin?: number
  tempoMin?:      number
  tempoMax?:      number
  energyMin?:     number
}

// Forma reducida usada por favoritos/historial/tracks de playlist — estos
// endpoints hidratan desde ClickHouse pero no calculan las features de audio
// completas (no son necesarias para una fila de lista), así que no son un
// `Track` completo.
export type LibraryTrack = {
  fact_id:      number
  track_id:     string
  track_name:   string
  artist_name:  string
  duration_ms:  number
  genre_name:   string
  // S14-P1: antes ausente en este subconjunto (`TRACKS_BY_FACT_IDS`/
  // `FAVORITOS_ACTUALES`/`HISTORIAL_RECIENTE` no lo seleccionaban) — cierra
  // la brecha documentada en `LibraryTrackRow.tsx`.
  imagen_url?:  string | null
  es_featuring?:      boolean
  artista_principal?: string
  artistas_feat?:      string[]
  source_type?: 'real' | 'synthetic' | 'user_uploaded'
}

export type Favoritos = {
  data:       LibraryTrack[]
  total:      number
  plan:       string
  plan_limit: number | null
}

export type HistorialEntry = LibraryTrack & { event_timestamp: string }

export type Historial = {
  data:          HistorialEntry[]
  total:         number
  plan:          string
  limit_applied: number
}

export type Playlist = {
  playlist_id: string
  name:        string
  track_count: number
  es_publica:  boolean
  // S14-P1: hasta 4 portadas ya resueltas de sus primeras canciones (collage
  // 2x2) — vacío si ninguna tiene portada todavía, el frontend cae al
  // gradiente por playlist_id.
  portada_urls: string[]
}

export type Colaborador = {
  usuario_id: string
  nombre:     string
  email:      string
}

export type PlaylistDetail = {
  playlist_id:   string
  name:          string
  data:          LibraryTrack[]
  total:         number
  is_owner:      boolean
  colaboradores: Colaborador[]
  es_publica:    boolean
}

// ── Búsqueda unificada (change p2-descubrimiento-comunidad) ──────────────────

export type SearchTrack = {
  fact_id:     number
  track_id:    string
  track_name:  string
  artist_name: string
  imagen_url:  string | null
  genre_name:  string
  popularity:  number
  duration_ms: number
  es_featuring?:  boolean
  artistas_feat?: string[]
  source_type?:   'real' | 'synthetic' | 'user_uploaded'
}

export type SearchArtista = {
  artist_id:      number
  name:           string
  imagen_url:     string | null
  track_count:    number
  avg_popularity: number
}

export type SearchAlbum = {
  album_id:       number
  name:           string
  release_year:   number
  imagen_url:     string | null
  artist_name:    string
  track_count:    number
  avg_popularity: number
}

export type SearchPlaylist = {
  playlist_id: string
  name:        string
  es_publica:  boolean
  es_propia:   boolean
}

export type SearchAllResultado = {
  tracks:    SearchTrack[]
  artistas:  SearchArtista[]
  albumes:   SearchAlbum[]
  playlists: SearchPlaylist[]
}
