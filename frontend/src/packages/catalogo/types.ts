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
}

export type TrackDetail = Track & {
  loudness:         number
  speechiness:      number
  acousticness:     number
  instrumentalness: number
  liveness:         number
  tempo:            number
  artist_id:        number
  album_name:       string
  album_id:         number
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
}

export type TracksSearchParams = {
  q?:      string
  genre?:  string
  limit?:  number
  offset?: number
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
}

export type PlaylistDetail = {
  playlist_id: string
  name:        string
  data:        LibraryTrack[]
  total:       number
}
