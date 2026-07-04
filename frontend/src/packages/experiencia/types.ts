export type EstadoTicket = 'abierto' | 'en_proceso' | 'resuelto' | 'cerrado'

export type Ticket = {
  fact_id:          number
  usuario_id?:      string
  asunto:           string
  descripcion:      string
  estado:           EstadoTicket
  fecha_creacion:   string
  fecha_resolucion: string | null
}

export type TicketBody = {
  asunto:      string
  descripcion: string
}

export type TopTrackPlaylist = {
  fact_id:          number
  track_name:       string
  artist_name:      string
  playlists_count:  number
}

export type SincronizacionResultado = {
  status:     string
  dag_run_id: string
}

export type Recomendacion = {
  fact_id:      number
  track_id:     string
  track_name:   string
  artist_name:  string
  genre_id:     number
  impresion_id: number
  algoritmo:    string
}

export type MiembroFamilia = {
  usuario_id:  string
  es_titular:  number
  fecha_union: string
}

export type PlanFamiliar = {
  data:   MiembroFamilia[]
  total:  number
  limite: number
}
