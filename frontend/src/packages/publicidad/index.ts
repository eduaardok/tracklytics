// Public API del paquete publicidad.
// Regla de aislamiento: otros paquetes solo pueden importar desde aquí.
// Nunca importar directamente de components/, pages/, context/, o api/ internos.

export { PublicidadAdminPage } from './pages/PublicidadAdminPage'
export { AdProvider, useAd } from './context/AdContext'
export { publicidadApi } from './api/publicidad.api'
export type { Anunciante, Campana, CampanaBody, ImpresionAsignada, IngresoCampana } from './types'
