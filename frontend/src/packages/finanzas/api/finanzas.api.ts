import { apiClient, type ApiResponse } from '@shared/lib/api-client'
import type {
  GastoOperativo, GastoBody,
  Reembolso, ReembolsoBody,
  DashboardFinanciero, CuentasFinancieras,
  PresupuestoCampana, IndicadoresFinancieros,
  AlertasFinancieras, ReporteFinanciero,
} from '../types'

export const finanzasApi = {
  // ── Gastos operativos ────────────────────────────────────────────────────
  gastos: (params: { categoria?: string; desde?: string; hasta?: string; estado?: string } = {}) => {
    const qs = new URLSearchParams()
    if (params.categoria) qs.set('categoria', params.categoria)
    if (params.desde)     qs.set('desde', params.desde)
    if (params.hasta)     qs.set('hasta', params.hasta)
    if (params.estado)    qs.set('estado', params.estado)
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    return apiClient.get<ApiResponse<GastoOperativo>>(`/finanzas/gastos${suffix}`)
  },
  crearGasto: (body: GastoBody) =>
    apiClient.post<{ status: string; gasto_id: string }>('/finanzas/gastos', body),
  editarGasto: (gastoId: string, body: GastoBody) =>
    apiClient.put<{ status: string; gasto_id: string }>(`/finanzas/gastos/${gastoId}`, body),
  anularGasto: (gastoId: string) =>
    apiClient.post<{ status: string; gasto_id: string; estado: string }>(`/finanzas/gastos/${gastoId}/anular`, {}),

  // ── Reembolsos ────────────────────────────────────────────────────────────
  procesarReembolso: (body: ReembolsoBody) =>
    apiClient.post<{ status: string; reembolso_id: string }>('/finanzas/reembolsos', body),
  historialReembolsosPorTransaccion: (transaccionId: string) =>
    apiClient.get<ApiResponse<Reembolso>>(`/finanzas/reembolsos?transaccion_id=${encodeURIComponent(transaccionId)}`),
  historialReembolsosPorRango: (desde: string, hasta: string) =>
    apiClient.get<ApiResponse<Reembolso>>(`/finanzas/reembolsos?desde=${desde}&hasta=${hasta}`),

  // ── Dashboard ─────────────────────────────────────────────────────────────
  dashboard: (params: { desde: string; hasta: string; desdeComparacion?: string; hastaComparacion?: string }) => {
    const qs = new URLSearchParams({ desde: params.desde, hasta: params.hasta })
    if (params.desdeComparacion) qs.set('desde_comparacion', params.desdeComparacion)
    if (params.hastaComparacion) qs.set('hasta_comparacion', params.hastaComparacion)
    return apiClient.get<DashboardFinanciero>(`/finanzas/dashboard?${qs.toString()}`)
  },

  // ── Cuentas por cobrar / pagar ────────────────────────────────────────────
  cuentas: () => apiClient.get<CuentasFinancieras>('/finanzas/cuentas'),

  // ── Presupuesto de campañas ───────────────────────────────────────────────
  presupuestoCampanas: () => apiClient.get<ApiResponse<PresupuestoCampana>>('/finanzas/campanas/presupuesto'),

  // ── Indicadores ───────────────────────────────────────────────────────────
  indicadores: (desde: string, hasta: string) =>
    apiClient.get<IndicadoresFinancieros>(`/finanzas/indicadores?desde=${desde}&hasta=${hasta}`),

  // ── Alertas ───────────────────────────────────────────────────────────────
  alertas: (desde?: string, hasta?: string) => {
    const qs = new URLSearchParams()
    if (desde) qs.set('desde', desde)
    if (hasta) qs.set('hasta', hasta)
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    return apiClient.get<AlertasFinancieras>(`/finanzas/alertas${suffix}`)
  },

  // ── Reporte ───────────────────────────────────────────────────────────────
  reporte: (desde: string, hasta: string) =>
    apiClient.get<ReporteFinanciero>(`/finanzas/reporte?desde=${desde}&hasta=${hasta}`),
}
