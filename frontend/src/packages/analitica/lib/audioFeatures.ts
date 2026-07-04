import type { ArtistAudioStats, GenreAudioProfile } from '../types'

// Los 7 atributos de audio (0-1) que arman cada radar — orden fijo, es el que
// define el orden de los ejes/spokes en todos los gráficos de esta capability.
export const AUDIO_FEATURES = [
  { key: 'danceability',     label: 'Danceability' },
  { key: 'energy',           label: 'Energy' },
  { key: 'speechiness',      label: 'Speechiness' },
  { key: 'acousticness',     label: 'Acousticness' },
  { key: 'instrumentalness', label: 'Instrumentalness' },
  { key: 'liveness',         label: 'Liveness' },
  { key: 'valence',          label: 'Valence' },
] as const

export type AudioFeatureKey = (typeof AUDIO_FEATURES)[number]['key']
export type AudioFeatureValues = Record<AudioFeatureKey, number>

// GenreAudioProfile no lleva prefijo avg_ en sus campos; ArtistAudioStats sí
// (avg_danceability, avg_energy, ...) — mismos 7 atributos, dos shapes de API
// distintos. Estas funciones son el único lugar que conoce ambos mapeos.
export function genreToAudioValues(g: GenreAudioProfile): AudioFeatureValues {
  return {
    danceability:     g.danceability,
    energy:           g.energy,
    speechiness:      g.speechiness,
    acousticness:     g.acousticness,
    instrumentalness: g.instrumentalness,
    liveness:         g.liveness,
    valence:          g.valence,
  }
}

export function artistToAudioValues(a: ArtistAudioStats): AudioFeatureValues {
  return {
    danceability:     a.avg_danceability,
    energy:           a.avg_energy,
    speechiness:      a.avg_speechiness,
    acousticness:     a.avg_acousticness,
    instrumentalness: a.avg_instrumentalness,
    liveness:         a.avg_liveness,
    valence:          a.avg_valence,
  }
}
