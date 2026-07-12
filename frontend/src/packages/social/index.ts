// Public API del paquete social.
// Regla de aislamiento: otros paquetes solo pueden importar desde aquí.
// Nunca importar directamente de components/, pages/, o api/ internos.

export { SeguidosSocialPage }    from './pages/SeguidosSocialPage'
export { ArtistaSocialPage }     from './pages/ArtistaSocialPage'
export { TrackSocialPage }       from './pages/TrackSocialPage'
export { ModeracionSocialPage }  from './pages/ModeracionSocialPage'
export { PerfilPublicoPage }     from './pages/PerfilPublicoPage'
export { socialApi } from './api/social.api'
export type {
  ArtistaSeguido, Comentario, ComentarioBody, ComentarioResultado,
  ModerarComentarioBody, ModerarComentarioResultado,
  ComparticionBody, ComparticionResultado,
  Canal, TipoInteraccionCompartir, EstadoModeracion, DecisionModeracion,
  Notificacion, NotificacionesResultado, TipoNotificacion, ReferenciaNotificacion,
  PerfilPublico, PlaylistPublica,
} from './types'
