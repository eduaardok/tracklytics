// Public API del paquete creadores.
// Regla de aislamiento: otros paquetes solo pueden importar desde aquí.
// Nunca importar directamente de components/, pages/, o api/ internos.

export { CuentaArtistaPage }     from './pages/CuentaArtistaPage'
export { RevisionCreadoresPage } from './pages/RevisionCreadoresPage'
export { ArtistaHubTabs, type ArtistaHubVista } from './components/ArtistaHubTabs'
export { creadoresApi }          from './api/creadores.api'
export type {
  CuentaArtista, SubidaTrack, EstadoCuenta, EstadoRevision,
  SolicitudCuentaBody, SolicitudCuentaResultado,
  ResolverCuentaBody, ResolverCuentaResultado,
  SubidaTrackBody, SubidaTrackResultado,
  ResolverTrackBody, ResolverTrackResultado,
} from './types'
