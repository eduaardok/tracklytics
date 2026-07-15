// Public API del paquete finanzas.
// Regla de aislamiento: otros paquetes solo pueden importar desde aquí.
// Nunca importar directamente de components/, pages/, o api/ internos.

export { FinanzasAdminPage } from './pages/FinanzasAdminPage'
export { finanzasApi } from './api/finanzas.api'
export type {
  GastoOperativo, GastoBody, CategoriaGasto, EstadoGasto,
  Reembolso, ReembolsoBody, TipoReembolso, EstadoReembolso,
  DashboardFinanciero, MetricasPeriodo,
  CuentasFinancieras, CuentasPorCobrar, CuentasPorPagar,
  PresupuestoCampana, IndicadoresFinancieros, GastoPorCategoria,
  AlertaFinanciera, AlertasFinancieras, TipoAlerta,
  ReporteFinanciero,
} from './types'
