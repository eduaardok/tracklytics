import { apiClient, type ApiResponse } from '@shared/lib/api-client'
import type {
  MetodoPago, Transaccion, Invoice,
  MetodosPagoResponse,
  RegistrarMetodoPagoBody, PagarSuscripcionBody, PagoResultado,
} from '../types'

// Estos endpoints requieren sesión — el header Authorization lo inyecta
// `apiClient` a partir de la sesión guardada por `seguridad` tras login.
export const facturacionApi = {
  metodosPago: () =>
    apiClient.get<MetodosPagoResponse>('/facturacion/metodos-pago'),

  registrarMetodoPago: (body: RegistrarMetodoPagoBody) =>
    apiClient.post<{ status: string; metodo_pago_id: string }>('/facturacion/metodos-pago', body),

  pagarSuscripcion: (body: PagarSuscripcionBody) =>
    apiClient.post<PagoResultado>('/facturacion/transacciones', body),

  transacciones: (usuarioId?: string) =>
    apiClient.get<ApiResponse<Transaccion>>(
      `/facturacion/transacciones${usuarioId ? `?usuario_id=${usuarioId}` : ''}`,
    ),

  invoices: (usuarioId?: string) =>
    apiClient.get<ApiResponse<Invoice>>(
      `/facturacion/invoices${usuarioId ? `?usuario_id=${usuarioId}` : ''}`,
    ),
}
