export type Anunciante = {
  anunciante_id:  number
  nombre:         string
  sector:         string
  activo:         number
  fecha_registro: string
}

export type TipoAnuncio = 'audio' | 'display'
// Atributo comercial editable de una campaña (change p1-ciclos-vida) —
// distinto de `tipo_anuncio`, que gobierna el canal técnico de servido.
export type FormatoCampana = 'audio' | 'display' | 'banner'
export type EstadoManualCampana = '' | 'pausada' | 'finalizada'

export type Campana = {
  campana_id:        number
  anunciante_id:     number
  nombre:            string
  cpm:               number
  presupuesto_total: number
  fecha_inicio:      string
  fecha_fin:         string | null
  activa:            number
  tipo_anuncio:      TipoAnuncio
  formato:           FormatoCampana
  estado_manual:     EstadoManualCampana
  url_destino:       string
}

export type CampanaEditBody = {
  nombre?:            string
  presupuesto_total?: number
  fecha_inicio?:      string
  fecha_fin?:         string | null
  formato?:           FormatoCampana
}

export type CampanaBody = {
  anunciante_id:     number
  nombre:            string
  cpm:               number
  presupuesto_total: number
  fecha_inicio:      string
  fecha_fin?:        string | null
  tipo_anuncio?:     TipoAnuncio
  url_destino?:      string
}

export type ImpresionAsignada = {
  campana: { campana_id: number; cpm: number } | null
  impresion_id?: string
}

export type ImpresionDisplayAsignada = {
  campana: { campana_id: number; cpm: number; url_destino: string } | null
  impresion_id?: string
}

export type IngresoCampana = {
  campana_id:     number
  impresiones:    number
  ingreso_total:  number
}
