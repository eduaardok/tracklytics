export type Anunciante = {
  anunciante_id:  number
  nombre:         string
  sector:         string
  fecha_registro: string
}

export type Campana = {
  campana_id:        number
  anunciante_id:     number
  nombre:            string
  cpm:               number
  presupuesto_total: number
  fecha_inicio:      string
  fecha_fin:         string | null
  activa:            number
}

export type CampanaBody = {
  anunciante_id:     number
  nombre:            string
  cpm:               number
  presupuesto_total: number
  fecha_inicio:      string
  fecha_fin?:        string | null
}

export type ImpresionAsignada = {
  campana: { campana_id: number; cpm: number } | null
  impresion_id?: string
}

export type IngresoCampana = {
  campana_id:     number
  impresiones:    number
  ingreso_total:  number
}
