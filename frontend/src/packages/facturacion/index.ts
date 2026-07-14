// Public API del paquete facturacion.
// Regla de aislamiento: otros paquetes solo pueden importar desde aquí.
// Nunca importar directamente de components/, pages/, o api/ internos.

export { FacturacionPage }          from './pages/FacturacionPage'
export { AuditoriaFacturacionPage } from './pages/AuditoriaFacturacionPage'
export { InvoiceDetailPage }        from './pages/InvoiceDetailPage'
export { EmpresaConfigPage }        from './pages/EmpresaConfigPage'
export { facturacionApi }           from './api/facturacion.api'
export type {
  MetodoPago, Transaccion, Invoice, InvoiceDetalle,
  SuscripcionActiva, MetodosPagoResponse, EmpresaInfo,
  RegistrarMetodoPagoBody, PagarSuscripcionBody, PagoResultado,
} from './types'
