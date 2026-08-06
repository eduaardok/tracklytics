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

// S14-P4, Fase 5 — generación histórica bajo demanda con relleno de huecos.
export const DOMINIOS_BAJO_DEMANDA = [
  'usuarios', 'gasto_marketing', 'publicidad', 'engagement', 'regalias',
  'disponibilidad', 'api_partners', 'comunidad', 'denuncias_tickets', 'producto',
] as const

export type DominioBajoDemanda = typeof DOMINIOS_BAJO_DEMANDA[number]

export type GenerarHistoricoBody = {
  periodo_inicio: string
  periodo_fin:    string
  dominios?:      DominioBajoDemanda[]
}

export type GenerarHistoricoResultado = {
  status:         string
  ejecucion_id:   string
  dominios:       string[]
  periodo_inicio: string
  periodo_fin:    string
}

export type EstadoDominioNegocio = {
  checksum:       string
  ultima_corrida: string
  total_filas:    number
  corridas:       number
}

export type EstadoTablaGold = {
  tabla:          string
  granularidad:   string
  ultima_corrida: string
  ultimo_estado:  string
}

export type EstadoGeneracion = {
  dominios_negocio:  EstadoDominioNegocio[]
  tablas_gold:       EstadoTablaGold[]
  ejecucion_en_curso: boolean | null
}
