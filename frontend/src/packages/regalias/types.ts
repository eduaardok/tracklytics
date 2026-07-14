export type Productor = {
  productor_id:   number
  nombre:         string
  fecha_registro: string
}

export type Contrato = {
  contrato_id:            string
  fact_id_track:          number
  sello_id:               number | null
  cuenta_artista_id:      string | null
  productor_id:           number | null
  pct_master_sello:       number
  pct_master_artista:     number
  pct_master_productor:   number
  pct_publishing_sello:   number
  pct_publishing_artista: number
  vigente_desde:          string
  vigente_hasta:          string | null
  activo:                 number
}

export type ContratoBody = {
  fact_id_track:           number
  sello_id?:                number | null
  cuenta_artista_id?:       string | null
  productor_id?:            number | null
  pct_master_sello?:        number
  pct_master_artista?:      number
  pct_master_productor?:    number
  pct_publishing_sello?:    number
  pct_publishing_artista?:  number
  vigente_desde:            string
  vigente_hasta?:           string | null
}

export type CuentaSello = {
  cuenta_sello_id: string
  usuario_id:      string
  sello_id:        number
  activo:          number
  fecha_creacion:  string
  nombre_sello:    string
}

export type Ganancia = {
  liquidacion_id:  string
  fact_id_track:   number
  track_name:      string
  periodo_inicio:  string
  periodo_fin:     string
  streams_periodo: number
  monto:           number
  moneda:          string
  fecha_calculo:   string
}

export type GananciasResponse = {
  data:  Ganancia[]
  total: number
}

export type LiquidarBody = {
  periodo_inicio: string
  periodo_fin:    string
}

export type LiquidarResultado = {
  status:              string
  liquidaciones:       number
  pool_total?:         number
  pool_rightsholders?: number
  total_streams?:      number
}

// ── Retiro de ganancias (modelo-financiero-simulacion) ──────────────────────
export type EstadoRetiro = 'pendiente' | 'procesado' | 'rechazado'

export type Retiro = {
  retiro_id:        string
  tipo_rightsholder: 'artista' | 'sello'
  rightsholder_id:  string
  monto:            number
  estado:           EstadoRetiro
  fecha_solicitud:  string
  fecha_procesado:  string | null
}

export type SaldoResponse = {
  saldo_disponible: number
  retiros:          Retiro[]
}
