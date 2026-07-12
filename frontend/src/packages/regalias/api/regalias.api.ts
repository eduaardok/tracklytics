import { apiClient, type ApiResponse } from '@shared/lib/api-client'
import type {
  Contrato, ContratoBody, CuentaSello, GananciasResponse,
  LiquidarBody, LiquidarResultado, Productor,
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
}
