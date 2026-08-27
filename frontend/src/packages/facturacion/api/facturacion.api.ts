import { apiClient, type ApiResponse } from '@shared/lib/api-client'
import type {
  MetodoPago, Transaccion, Invoice, InvoiceDetalle,
  MetodosPagoResponse, DashboardFacturacion, EmpresaInfo, NotificacionEmail,
  RegistrarMetodoPagoBody, PagarSuscripcionBody, PagoResultado, TransaccionReciente,
} from '../types'

// Estos endpoints requieren sesión — el header Authorization lo inyecta
// `apiClient` a partir de la sesión guardada por `seguridad` tras login.
export const facturacionApi = {
  metodosPago: () =>
    apiClient.get<MetodosPagoResponse>('/facturacion/metodos-pago'),

  registrarMetodoPago: (body: RegistrarMetodoPagoBody) =>
    apiClient.post<{ status: string; metodo_pago_id: string }>('/facturacion/metodos-pago', body),

  eliminarMetodoPago: (metodoPagoId: string) =>
    apiClient.delete<{ status: string }>(`/facturacion/metodos-pago/${metodoPagoId}`),

  pagarSuscripcion: (body: PagarSuscripcionBody) =>
    apiClient.post<PagoResultado>('/facturacion/transacciones', body),

  transacciones: (usuarioId?: string, page = 1, limit = 50) => {
    const p = new URLSearchParams()
    if (usuarioId) p.set('usuario_id', usuarioId)
    if (page > 1) p.set('page', String(page))
    if (limit !== 50) p.set('limit', String(limit))
    const qs = p.toString()
    return apiClient.get<ApiResponse<Transaccion>>(`/facturacion/transacciones${qs ? `?${qs}` : ''}`)
  },

  invoices: (usuarioId?: string) =>
    apiClient.get<ApiResponse<Invoice>>(
      `/facturacion/invoices${usuarioId ? `?usuario_id=${usuarioId}` : ''}`,
    ),

  // Vista imprimible de una invoice individual — antes solo existía en
  // app/facturacion/invoice.html (legacy).
  invoiceDetalle: (invoiceId: string) =>
    apiClient.get<InvoiceDetalle>(`/facturacion/invoices/${invoiceId}`),

  // `desde`/`hasta` opcionales (S17, date range customizable) — sin
  // parámetros, el backend usa su default de 14 días (compatibilidad hacia
  // atrás con el llamado original).
  dashboard: (desde?: string, hasta?: string) => {
    const qs = new URLSearchParams()
    if (desde) qs.set('desde', desde)
    if (hasta) qs.set('hasta', hasta)
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    return apiClient.get<DashboardFacturacion>(`/facturacion/admin/dashboard${suffix}`)
  },

  transaccionesRecientes: (page = 1, limit = 50) => {
    const p = new URLSearchParams()
    if (page > 1) p.set('page', String(page))
    if (limit !== 50) p.set('limit', String(limit))
    const qs = p.toString()
    return apiClient.get<ApiResponse<TransaccionReciente>>(
      `/facturacion/admin/transacciones-recientes${qs ? `?${qs}` : ''}`,
    )
  },

  empresa: () =>
    apiClient.get<EmpresaInfo>('/facturacion/empresa'),

  actualizarEmpresa: (body: EmpresaInfo) =>
    apiClient.put<{ status: string } & EmpresaInfo>('/facturacion/empresa', body),

  // Notificaciones simuladas de factura enviada por correo (CU-O99).
  notificaciones: (usuarioId?: string) =>
    apiClient.get<ApiResponse<NotificacionEmail>>(
      `/facturacion/notificaciones${usuarioId ? `?usuario_id=${usuarioId}` : ''}`,
    ),
}
