import { apiClient, type ApiResponse } from '@shared/lib/api-client'
import type {
  Contrato, ContratoBody, CuentaSello, GananciasResponse,
  LiquidacionContrato, LiquidarBody, LiquidarResultado, Productor, Retiro,
  ResumenContrato, SaldoResponse,
} from '../types'

export const regaliasApi = {
  productores: () =>
    apiClient.get<ApiResponse<Productor>>('/regalias/productores'),

  crearProductor: (nombre: string) =>
    apiClient.post<{ status: string; productor_id: number; nombre: string }>('/regalias/admin/productores', { nombre }),

  asignarProductor: (productorId: number, factId: number) =>
    apiClient.post<{ status: string }>(`/regalias/admin/productores/${productorId}/tracks/${factId}`, undefined),

  contratos: () =>
    apiClient.get<ApiResponse<Contrato>>('/regalias/admin/contratos'),

  crearContrato: (body: ContratoBody) =>
    apiClient.post<{ status: string; contrato_id: string }>('/regalias/admin/contratos', body),

  liquidacionesContrato: (contratoId: string) =>
    apiClient.get<ApiResponse<LiquidacionContrato>>(`/regalias/admin/contratos/${contratoId}/liquidaciones`),

  resumenContrato: (contratoId: string) =>
    apiClient.get<ResumenContrato>(`/regalias/admin/contratos/${contratoId}/resumen`),

  crearCuentaSello: (usuarioId: string, selloId: number) =>
    apiClient.post<{ status: string; cuenta_sello_id: string }>('/regalias/admin/cuentas-sello', { usuario_id: usuarioId, sello_id: selloId }),

  miCuentaSello: () =>
    apiClient.get<CuentaSello>('/regalias/sello/mi-cuenta'),

  liquidar: (body: LiquidarBody) =>
    apiClient.post<LiquidarResultado>('/regalias/admin/liquidar', body),

  misGananciasArtista: () =>
    apiClient.get<GananciasResponse>('/regalias/artista/mis-ganancias'),

  misGananciasSello: () =>
    apiClient.get<GananciasResponse>('/regalias/sello/mis-ganancias'),

  // ── Retiro de ganancias (modelo-financiero-simulacion) ─────────────────────
  saldoArtista: () =>
    apiClient.get<SaldoResponse>('/regalias/artista/saldo'),

  solicitarRetiroArtista: (monto: number) =>
    apiClient.post<{ status: string; retiro_id: string; monto: number; estado: string }>(
      '/regalias/artista/retiros', { monto },
    ),

  saldoSello: () =>
    apiClient.get<SaldoResponse>('/regalias/sello/saldo'),

  solicitarRetiroSello: (monto: number) =>
    apiClient.post<{ status: string; retiro_id: string; monto: number; estado: string }>(
      '/regalias/sello/retiros', { monto },
    ),

  retirosAdmin: (estado?: string) =>
    apiClient.get<ApiResponse<Retiro>>(`/regalias/admin/retiros${estado ? `?estado=${estado}` : ''}`),

  procesarRetiro: (retiroId: string) =>
    apiClient.post<{ status: string; retiro_id: string; estado: string }>(
      `/regalias/admin/retiros/${retiroId}/procesar`, undefined,
    ),

  rechazarRetiro: (retiroId: string) =>
    apiClient.post<{ status: string; retiro_id: string; estado: string }>(
      `/regalias/admin/retiros/${retiroId}/rechazar`, undefined,
    ),
}
