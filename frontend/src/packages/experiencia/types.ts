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
  genre_name:   string
  imagen_url:   string | null
  impresion_id: number
  algoritmo:    string
  // Motivo legible de la sugerencia (change p2-descubrimiento-comunidad).
  // Opcional por compatibilidad: una respuesta anterior al cambio no lo trae.
  motivo?:      string
}

// Radio basada en una canción (change p2-descubrimiento-comunidad).
export type TrackSimilar = {
  fact_id:     number
  track_id:    string
  track_name:  string
  artist_name: string
  genre_name:  string
  imagen_url:  string | null
  distancia:   number
}

export type RadioResultado = {
  semilla: { fact_id: number; track_name: string; artist_name: string | null }
  data:    TrackSimilar[]
  total:   number
}

// Mix diario: `personalizado=false` indica la degradación a populares para un
// usuario sin historial ni favoritos.
export type MixDiario = {
  fecha:         string
  personalizado: boolean
  data:          Recomendacion[]
  total:         number
}

// "Para ti" en secciones (S10 ronda 2): antes una sola lista genérica, ahora
// hasta 3 secciones independientes — ver api/paquetes/experiencia/router.py
// `obtener_recomendaciones` para el detalle de cuándo aparece cada una.
export type SeccionRecomendaciones = {
  id:     'hecho_para_ti' | 'novedades_seguidos' | 'redescubre'
  titulo: string
  data:   Recomendacion[]
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

// Autoservicio del titular premium (CU-O51/52/53, cambio 2026-07-09) — a
// diferencia de `MiembroFamilia`/`PlanFamiliar` (usados por el flujo admin
// arriba), estos traen nombre/email resueltos vía JOIN contra DIM_USUARIO.
export type MiembroFamiliaDetalle = {
  usuario_id:  string
  nombre?:     string
  email?:      string
  es_titular:  number
  fecha_union: string
}

export type MiFamilia = {
  data:           MiembroFamiliaDetalle[]
  total:          number
  limite:         number
  suscripcion_id: string | null
  es_titular:     boolean
}

export type DashboardExperiencia = {
  tickets_por_estado:     { estado: string; total: number }[]
  tickets_abiertos_total: number
}
