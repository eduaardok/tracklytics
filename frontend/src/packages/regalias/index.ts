// Public API del paquete regalias.
// Regla de aislamiento: otros paquetes solo pueden importar desde aquí.
// Nunca importar directamente de components/, pages/, o api/ internos.

export { MisGananciasPage }  from './pages/MisGananciasPage'
export { RegaliasAdminPage } from './pages/RegaliasAdminPage'
export { regaliasApi } from './api/regalias.api'
export type {
  Productor, Contrato, ContratoBody, CuentaSello,
  Ganancia, GananciasResponse, LiquidarBody, LiquidarResultado,
} from './types'
