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
  // Foto de perfil de artista (DIM_ARTISTS.imagen_url, resuelta por
  // nombre_artistico) — `null` mientras el artista no tenga fila propia en
  // DIM_ARTISTS todavía (se crea con su primer track aprobado).
  imagen_url:         string | null
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
  // Portada del track por URL (pedido directo) — `null` cae al degradado
  // por género de AlbumArt, igual que cualquier otro track sin portada.
  imagen_url:         string | null
}

// Edición de metadata de un track propio (change p1-ciclos-vida).
export type EditarTrackBody = {
  track_name?:  string
  album_name?:  string
  genre_ids?:   number[]
  descripcion?: string
  // "" limpia la portada; `undefined` (omitido) no la toca.
  imagen_url?:  string
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
  imagen_url?: string
}

// Foto de perfil de artista (pedido directo) — "" limpia la foto.
export type ActualizarImagenArtistaBody = {
  imagen_url: string
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

// ── Analítica propia del artista (R2, S16-P9) ────────────────────────────────
// Engagement real sobre SOLO los tracks promovidos propios — el gap que el
// panel tenía documentado desde F2 ("no existe endpoint de likes/plays por
// track propio"). Fuente: GET /app/v1/creadores/mi-analitica.

export type MetricasTrack = {
  fact_id:    number
  track_name: string
  plays:      number
  likes:      number
  favoritos:  number
  oyentes:    number
}

export type PuntoSeriePlays = {
  dia:   string // YYYY-MM-DD
  plays: number
}

export type AnaliticaArtista = {
  totales: { plays: number; likes: number; favoritos: number; oyentes: number }
  serie:   PuntoSeriePlays[]
  tracks:  MetricasTrack[]
}
