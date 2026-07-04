// Public API del paquete distribucion.
// Regla de aislamiento: otros paquetes solo pueden importar desde aquí.
// Nunca importar directamente de components/, pages/, o api/ internos.

export { DistribucionAdminPage } from './pages/DistribucionAdminPage'
export { DisponibilidadPage }    from './pages/DisponibilidadPage'
export { distribucionApi } from './api/distribucion.api'
export type {
  Sello, SelloBody, AsignarSelloBody,
  Pais, CanalDistribucion, TipoRestriccion,
  Licencia, LicenciaBody, EstadoLicencia,
  Restriccion, RestriccionBody,
  Disponibilidad,
} from './types'
