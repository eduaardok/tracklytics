export type EstadoCuenta = 'pendiente' | 'aprobada' | 'rechazada'
export type EstadoRevision = 'pendiente' | 'aprobado' | 'rechazado' | 'retirado'

export type CuentaArtista = {
  cuenta_artista_id:  string
  usuario_id:         string
  nombre_artistico:   string
  estado_cuenta:      EstadoCuenta
  fecha_solicitud:    string
  fecha_resolucion:   string | null
  admin_resolutor_id: string | null
}

export type SubidaTrack = {
  subida_id:          string
  cuenta_artista_id:  string
  staging_id:         string
  estado_revision_id: number
  estado_nombre:      EstadoRevision
  fecha_subida:       string
  fecha_resolucion:   string | null
  admin_resolutor_id: string | null
  fact_id_promovido:  number | null
  track_name:         string
  album_name:         string
  // `genre_id` (primer género, compatibilidad) se conserva; `genre_ids` es
  // la fuente real desde S16 (multi-género).
  genre_id:           number
  genre_ids:          number[]
  descripcion:        string
  duration_ms:        number
  explicit:           number
}

// Edición de metadata de un track propio (change p1-ciclos-vida).
export type EditarTrackBody = {
  track_name?:  string
  album_name?:  string
  genre_ids?:   number[]
  descripcion?: string
}

export type SolicitudCuentaBody = {
  nombre_artistico: string
}

export type ResolverCuentaBody = {
  decision: 'aprobar' | 'rechazar'
}

export type SubidaTrackBody = {
  track_name:  string
  album_name?: string
  genre_ids:   number[]
  duration_ms: number
  explicit?:   boolean
}

export type ResolverTrackBody = {
  decision: 'aprobar' | 'rechazar'
}

export type SolicitudCuentaResultado = {
  status:            string
  cuenta_artista_id: string
  estado_cuenta:     EstadoCuenta
}

export type ResolverCuentaResultado = {
  status:            string
  cuenta_artista_id: string
  estado_cuenta:     EstadoCuenta
}

export type SubidaTrackResultado = {
  status:     string
  subida_id:  string
  estado:     EstadoRevision
}

export type ResolverTrackResultado = {
  status:             string
  subida_id:          string
  estado:             EstadoRevision
  fact_id_promovido:  number | null
}

export type DashboardCreadores = {
  subidas_por_estado:    { estado: string; total: number }[]
  cuentas_artista_total: number
}
