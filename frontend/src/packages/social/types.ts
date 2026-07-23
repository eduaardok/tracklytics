import type { LibraryTrack } from '@packages/catalogo'

export type EstadoModeracion = 'visible' | 'oculto' | 'eliminado'
export type DecisionModeracion = 'oculto' | 'eliminado'
export type Canal = 'x' | 'whatsapp' | 'copiar_enlace'
export type TipoInteraccionCompartir = 'compartir_track' | 'compartir_playlist' | 'compartir_perfil_artista'

export type ArtistaSeguido = {
  artista_id:   number
  nombre:       string
  fecha_inicio: string
}

export type Comentario = {
  fact_id:              number
  usuario_id:           string
  fact_id_track:        number
  tipo_interaccion_id:  number
  comentario_padre_id:  number | null
  contenido:            string
  fecha_creacion:       string
  estado_moderacion:    EstadoModeracion
  moderado_por:         string | null
  fecha_moderacion:     string | null
}

export type ComentarioBody = {
  fact_id_track:        number
  contenido:             string
  comentario_padre_id?: number | null
}

export type ComentarioResultado = {
  status:            string
  fact_id:           number
  estado_moderacion: EstadoModeracion
}

export type ModerarComentarioBody = {
  decision: DecisionModeracion
}

export type ModerarComentarioResultado = {
  status:            string
  fact_id:           number
  estado_moderacion: EstadoModeracion
}

export type SeguirResultado = {
  status:     string
  artista_id: number
}

export type ComparticionBody = {
  tipo_interaccion_id: TipoInteraccionCompartir
  canal:                Canal
  fact_id_track?:      number
  artista_id?:          number
  playlist_id?:         string
}

export type ComparticionResultado = {
  status:    string
  fact_id:   number
  contenido: string
}

export type DashboardSocial = {
  actividad_por_dia:     { dia: string; tipo: 'comentario' | 'comparticion'; total: number }[]
  artistas_mas_seguidos: { artista_id: number; nombre: string; seguidores: number }[]
}

export type FeedItem = {
  tipo:            'comentario' | 'comparticion'
  id:              number
  usuario_id:      string
  usuario_nombre:  string | null
  contenido:       string
  fecha:           string
  track_name:      string
  artista_id:      number
  artista_nombre:  string
}

export type TipoNotificacion =
  | 'nuevo_track_artista_seguido'
  | 'comentario_en_tu_contenido'
  | 'nuevo_colaborador_playlist'

export type ReferenciaNotificacion = 'track' | 'playlist' | 'comentario'

export type Notificacion = {
  fact_id:         number
  tipo:            TipoNotificacion
  referencia_tipo: ReferenciaNotificacion
  referencia_id:   string
  mensaje:         string
  leido:           boolean
  fecha_creacion:  string
  fecha_lectura:   string | null
}

export type NotificacionesResultado = {
  data:      Notificacion[]
  no_leidas: number
}

export type PlaylistPublica = {
  playlist_id: string
  name:        string
  data:        LibraryTrack[]
  total:       number
}

export type PerfilPublico = {
  usuario_id:      string
  nombre:          string
  perfil_publico:  boolean
  es_propio:       boolean
  playlists:       PlaylistPublica[]
}

// ── Denuncias de contenido (change p1-ciclos-vida) ───────────────────────────
export type TipoObjetoDenuncia = 'comentario' | 'track'
export type MotivoDenuncia = 'spam' | 'contenido_inapropiado' | 'derechos_de_autor' | 'otro'
export type EstadoDenuncia = 'revisada' | 'resuelta'

export type DenunciaBody = {
  tipo_objeto:  TipoObjetoDenuncia
  objeto_id:    string
  motivo:       MotivoDenuncia
  descripcion?: string
}

export type Denuncia = {
  denuncia_id:    number
  denunciante_id: string
  tipo_objeto:    TipoObjetoDenuncia
  objeto_id:      string
  motivo:         MotivoDenuncia
  descripcion:    string
  estado:         'pendiente' | 'revisada' | 'resuelta'
  created_at:     string
}

// Resolución de denuncia con strike opcional (change p2-descubrimiento-comunidad).
// `strike` solo viene si se pidió emitirlo; `emitido: false` significa que la
// denuncia sí se resolvió pero el autor del contenido no era resoluble.
export type StrikeEmitido = {
  emitido:           boolean
  detalle?:          string
  usuario_id?:       string
  strike_id?:        number
  strikes_activos?:  number
  cuenta_suspendida?: boolean
}

export type ActualizarDenunciaResultado = {
  status:      string
  denuncia_id: number
  estado:      string
  strike?:     StrikeEmitido
}

export type UsuarioBloqueado = {
  usuario_id: string
  nombre:     string
  created_at: string
}

// ── Reportes administrativos (S12) ──────────────────────────────────────────
// A diferencia de `Notificacion` (autoservicio de la propia bandeja), este
// listado es global y trae `destinatario_nombre` resuelto vía JOIN.
export type NotificacionAdmin = {
  fact_id:             number
  usuario_destino_id:  string
  destinatario_nombre: string | null
  tipo:                TipoNotificacion
  referencia_tipo:     ReferenciaNotificacion
  referencia_id:       string
  mensaje:             string
  leido:               number
  fecha_creacion:      string
}
