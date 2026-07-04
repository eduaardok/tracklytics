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
