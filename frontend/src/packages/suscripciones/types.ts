export type TipoActor = 'b2c' | 'b2b'

export type Plan = {
  id:          string
  tipo_actor:  TipoActor
  nombre:      string
  precio:      number
  moneda:      string
  descripcion: string
}

// Registro de PocketBase (colección `suscripciones`) devuelto tal cual por
// GET /app/v1/suscripciones/activa — trae más campos (collectionId, etc.)
// que PocketBase agrega automáticamente, pero solo tipamos los que se usan.
export type SuscripcionActiva = {
  id:                string
  usuario_o_cliente: string
  tipo_plan:         string
  monto:             number
  moneda:            string
  estado:            string
  created?:          string
}

export type ConfirmarSuscripcionBody = {
  plan_id:         string
  metodo_pago_id?: string | null
}

export type PagoResultado = {
  status:         string
  transaccion_id: string
  estado:         'pendiente' | 'exitosa' | 'fallida'
  invoice_id:     string | null
}

export type ConfirmarSuscripcionResponse = {
  data: SuscripcionActiva
  pago: PagoResultado | null
}
