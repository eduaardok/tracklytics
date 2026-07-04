// Public API del paquete experiencia.
// Regla de aislamiento: otros paquetes solo pueden importar desde aquí.
// Nunca importar directamente de components/, pages/, o api/ internos.

export { SoportePage }            from './pages/SoportePage'
export { TicketsAdminPage }       from './pages/TicketsAdminPage'
export { FamiliaAdminPage }       from './pages/FamiliaAdminPage'
export { TopTracksPlaylistsPage } from './pages/TopTracksPlaylistsPage'
export { experienciaApi } from './api/experiencia.api'
export type {
  EstadoTicket, Ticket, TicketBody,
  TopTrackPlaylist, SincronizacionResultado,
  Recomendacion, MiembroFamilia, PlanFamiliar,
} from './types'
