export type MetodoPago = {
  metodo_pago_id:    string
  tipo:              string
  ultimos_4_digitos: string
  pais:              string
  nombre_titular:    string
  direccion:         string
  ciudad:            string
  codigo_postal:     string
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
  // Puede venir `null` si la transacción asociada no se encuentra (LEFT
  // JOIN) — el fallback de moneda vive en el formateo, no acá.
  moneda:         string | null
}

export type RegistrarMetodoPagoBody = {
  tipo:              string
  ultimos_4_digitos: string
  pais?:             string
  nombre_titular?:   string
  direccion?:        string
  ciudad?:           string
  codigo_postal?:    string
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

// GET /invoices/{invoice_id} — vista imprimible (antes solo existía en
// app/facturacion/invoice.html, legacy). JOIN contra DIM_USUARIO/
// FACT_TRANSACCION_PAGO/DIM_METODO_PAGO, ver INVOICE_DETALLE (backend).
export type InvoiceDetalle = {
  invoice_id:      string
  usuario_id:      string
  transaccion_id:  string
  monto:           number
  iva:             number
  fecha_emision:   string
  estado:          string
  usuario_nombre:  string | null
  usuario_email:   string | null
  metodo_pago_id:  string | null
  moneda:          string | null
  suscripcion_id:  string | null
  metodo_tipo:     string | null
  metodo_ultimos_4: string | null
  metodo_nombre_titular: string | null
  metodo_pais:     string | null
  plan_nombre:     string
}

export type DashboardFacturacion = {
  ingreso_por_dia:          { dia: string; total: number }[]
  transacciones_24h:        number
  ingreso_total_historico:  number
}

// GET /admin/transacciones-recientes (S12) — últimas 20 transacciones
// globales, para que la página muestre contenido sin tener que buscar un
// usuario primero. `usuario_nombre`/`metodo_pago` pueden venir `null`
// (LEFT JOIN sobre DIM_USUARIO/DIM_METODO_PAGO).
export type TransaccionReciente = {
  transaccion_id: string
  usuario_id:     string
  usuario_nombre: string | null
  usuario_email:  string | null
  monto:          number
  moneda:         string
  estado:         'pendiente' | 'exitosa' | 'fallida'
  metodo_pago:    string | null
  fecha:          string
}

// GET/PUT /empresa (CU-O81) — identidad de la empresa emisora que aparece en
// el encabezado de cada factura, editable solo por admin.
export type EmpresaInfo = {
  razon_social: string
  ruc:          string
  direccion:    string
  // IVA/retención global (modelo-financiero-completar-huecos, CU-O96/CU-O99)
  // — un país con tasa propia en DIM_PAIS la sobreescribe.
  iva_tasa_global?: number
  retencion_fiscal_pct_global?: number
}

// Notificación simulada de factura enviada por correo (CU-O99) — nunca sale
// a un proveedor real, solo queda registrada y visible en pantalla.
export type NotificacionEmail = {
  notificacion_id: string
  tipo:            'factura'
  referencia_id:   string
  destinatario:    string
  asunto:          string
  cuerpo:          string
  estado:          'enviado'
  fecha_envio:     string
}
