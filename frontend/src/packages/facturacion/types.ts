export type MetodoPago = {
  metodo_pago_id:    string
  tipo:              string
  ultimos_4_digitos: string
  pais:              string
  creado_en:         string
}

export type Transaccion = {
  transaccion_id: string
  usuario_id:     string
  metodo_pago_id: string
  suscripcion_id: string
  monto:          number
  moneda:         string
  estado:         'pendiente' | 'exitosa' | 'fallida'
  fecha:          string
}

export type Invoice = {
  invoice_id:     string
  usuario_id:     string
  transaccion_id: string
  monto:          number
  iva:            number
  fecha_emision:  string
  estado:         string
}

export type RegistrarMetodoPagoBody = {
  tipo:              string
  ultimos_4_digitos: string
  pais?:             string
}

export type PagarSuscripcionBody = {
  metodo_pago_id: string
}

export type SuscripcionActiva = {
  tipo_plan: string
  monto:     number
  moneda:    string
}

export type MetodosPagoResponse = {
  data:        MetodoPago[]
  suscripcion: SuscripcionActiva | null
}

export type PagoResultado = {
  status:         string
  transaccion_id: string
  estado:         'pendiente' | 'exitosa' | 'fallida'
  invoice_id:     string | null
}
