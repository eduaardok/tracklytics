// Public API del paquete ingesta.
// Regla de aislamiento: otros paquetes solo pueden importar desde aquí.
// Nunca importar directamente de components/, pages/, o api/ internos.

export { EtlPage }             from './pages/EtlPage'
export { CrudDimensionesPage } from './pages/CrudDimensionesPage'
export { DataQualityPage }     from './pages/DataQualityPage'
export type {
  SyntheticMode, EjecucionIngestaRequest, EjecucionTrigger, EjecucionEstado,
  CargaLog, CargasHistorial, DataQuality, DimTableKey, DimRow, DimListResponse,
  FactTrackRow, FactsListResponse,
} from './types'
