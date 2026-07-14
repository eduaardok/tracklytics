export type GenerarActividadBody = {
  n_streams?:       number
  n_suscripciones?: number
  n_impresiones?:   number
}

export type LiquidacionResumen = {
  status:              string
  liquidaciones:       number
  pool_total?:         number
  pool_rightsholders?: number
  total_streams?:      number
}

export type GenerarActividadResultado = {
  status:                          string
  streams_generados:               number
  ingreso_suscripciones_generado:  number
  ingreso_publicitario_generado:   number
  liquidacion:                     LiquidacionResumen
}
