export type EstadoLicencia = 'activa' | 'vencida' | 'suspendida'

export type Sello = {
  sello_id: number
  nombre:   string
}

export type Pais = {
  pais_id:    number
  nombre:     string
  codigo_iso: string
}

export type CanalDistribucion = {
  canal_id: number
  nombre:   string
}

export type TipoRestriccion = {
  tipo_restriccion_id: number
  nombre:               string
  descripcion:          string
}

export type Licencia = {
  licencia_id:  number
  sello_id:     number
  sello_nombre: string
  pais_id:      number
  pais_nombre:  string
  fecha_inicio: string
  fecha_fin:    string | null
  estado:       EstadoLicencia
}

export type Restriccion = {
  fact_id_track:            number
  pais_id:                  number
  pais_nombre:               string
  canal_id:                 number
  canal_nombre:              string
  tipo_restriccion_id:      number
  tipo_restriccion_nombre:  string
  fecha_inicio:              string
  activo:                    number
}

export type SelloBody = {
  nombre: string
}

export type AsignarSelloBody = {
  sello_id: number
}

export type LicenciaBody = {
  sello_id:     number
  pais_id:      number
  fecha_inicio: string
  fecha_fin?:   string | null
}

export type RestriccionBody = {
  fact_id_track:        number
  pais_id:               number
  canal_id:               number
  tipo_restriccion_id:   number
}

export type Disponibilidad = {
  disponible:       boolean
  tipo_restriccion: string | null
}

export type EstadoDisponibilidadFiltro = 'todos' | 'disponible' | 'bloqueado'

export type DisponibilidadListaRow = {
  fact_id_track:    number
  track_name:       string
  artist_name:      string
  disponible:       boolean
  tipo_restriccion: string | null
}

export type DisponibilidadListaResponse = {
  data:    DisponibilidadListaRow[]
  page:    number
  limit:   number
  total:   number
  pais_id: number | null
}

export type DashboardDistribucion = {
  restricciones_por_pais:  { pais: string; total: number }[]
  licencias_activas_total: number
}

// ── Solicitudes de licencia ──────────────────────────────────────────────────
export type EstadoSolicitudLicencia = 'pendiente' | 'aprobada' | 'rechazada'

export type SolicitudLicencia = {
  solicitud_id:           string
  sello_id:               number
  paises_solicitados:     number[]
  canales_solicitados:    number[]
  fecha_inicio_propuesta: string
  fecha_fin_propuesta:    string | null
  estado:                 EstadoSolicitudLicencia
  motivo_rechazo:         string | null
  fecha_solicitud:        string
  fecha_resolucion:       string | null
  admin_resolutor_id:     string | null
}

export type SolicitudLicenciaBody = {
  sello_id:               number
  paises_solicitados:     number[]
  canales_solicitados:    number[]
  fecha_inicio_propuesta: string
  fecha_fin_propuesta?:   string | null
}

export type RechazarSolicitudBody = {
  motivo: string
}
