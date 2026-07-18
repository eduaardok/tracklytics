// Public API del paquete suscripciones.
// Regla de aislamiento: otros paquetes solo pueden importar desde aquí.
// Nunca importar directamente de components/, pages/, o api/ internos.

export { PlanesPage } from './pages/PlanesPage'
export { AdminSuscripcionesPage } from './pages/AdminSuscripcionesPage'
export { suscripcionesApi, resolverDestinoPostAuth } from './api/suscripciones.api'
export { usePlanActivo, PLAN_ACTIVO_QUERY_KEY } from './hooks/usePlanActivo'
export type { Plan, SuscripcionActiva, ConfirmarSuscripcionBody, TipoActor, MotivoCancelacion } from './types'
export type { PostAuthDestino } from './api/suscripciones.api'
