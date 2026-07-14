// Public API del paquete simulacion.
// Regla de aislamiento: otros paquetes solo pueden importar desde aquí.
// Nunca importar directamente de pages/ o api/ internos.

export { SimulacionPage } from './pages/SimulacionPage'
export { simulacionApi } from './api/simulacion.api'
export type { GenerarActividadBody, GenerarActividadResultado, LiquidacionResumen } from './types'
