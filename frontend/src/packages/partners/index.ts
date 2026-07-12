// Public API del paquete partners.
// Regla de aislamiento: otros paquetes solo pueden importar desde aquí.
// Nunca importar directamente de components/, pages/, o api/ internos.

export { PartnersConsolePage } from './pages/PartnersConsolePage'
export { PartnersMetricasPage } from './pages/PartnersMetricasPage'
export { PartnersLandingPage } from './pages/PartnersLandingPage'
export type { PartnerTier, PartnerEndpoint, PartnerProbeResult, PartnerMetrica, PartnerMetricaTier } from './types'
