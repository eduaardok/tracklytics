// ── Entity search ────────────────────────────────────────────────────────────
export type ArtistSearchResult = {
  artist_id: number
  name: string
}

export type TrackSearchResult = {
  fact_id: number
  track_id: string
  track_name: string
  artist_name: string
  genre_name: string
  popularity: number
}

// ── Engagement ────────────────────────────────────────────────────────────────
export type EngagementData = {
  reproducciones: number
  favoritos: number
  raw_score: number
  max_raw_score: number
  engagement_score: number
}

export type EngagementByArtist = EngagementData & { artist_id: number }
export type EngagementByFact   = EngagementData & { fact_id: number }

export type DesempenoRelativo =
  | { fact_id: number; suficiente: false; mensaje: string }
  | {
      fact_id: number
      track_name: string
      artist_name: string
      suficiente: true
      popularity: number
      engagement_score: number
      indice_desempeno: number | null
    }

// ── Perfil de audio por género (GENRE_AUDIO_PROFILE_V1) ────────────────────────
export type GenreAudioProfile = {
  genre_id:         number
  name:             string
  danceability:     number
  energy:           number
  speechiness:      number
  acousticness:     number
  instrumentalness: number
  liveness:         number
  valence:          number
  avg_tempo:        number
  track_count:      number
}

// ── Audio stats de artista (ARTIST_AUDIO_STATS_V1) ──────────────────────────────
export type ArtistAudioStats = {
  artist_id:             number
  name:                  string
  track_count:           number
  avg_popularity:        number
  avg_danceability:      number
  avg_energy:            number
  avg_speechiness:       number
  avg_acousticness:      number
  avg_instrumentalness:  number
  avg_liveness:          number
  avg_valence:           number
  explicit_count:        number
}

export type ArtistasComparacion = {
  artista_a: ArtistAudioStats
  artista_b: ArtistAudioStats
}

// genero_benchmark reusa GENRE_AUDIO_PROFILE_V1 tal cual — los nombres de campo
// NO llevan prefijo avg_ (a diferencia de ArtistAudioStats), hay que mapearlos
// con cuidado al armar el radar (ver lib/audioFeatures.ts).
export type ArtistaBenchmark = {
  artista:          ArtistAudioStats
  genero_benchmark: GenreAudioProfile
}

// ── Tendencias semanales (TENDENCIAS_LOAD_WEEK) ─────────────────────────────────
// Ojo: no incluye avg_danceability ni period_label — esos campos existen en la
// query legacy huérfana TRENDS_WEEKLY, no en la v1 real que consume este cliente.
export type TendenciaSemana = {
  load_week:     number
  track_count:   number
  avg_popularity: number
  avg_energy:    number
}

// ── Adquisición por canal (completar-modelo-base, CU-O54) ──────────────────────
export type AdquisicionCanal = {
  semana:          string
  canal:           string
  usuarios_nuevos: number
}

// ── Disponibilidad por componente (completar-modelo-base, CU-O55) ──────────────
// No confundir con la restricción geográfica de reproducción de `distribucion`.
export type DisponibilidadComponente = {
  semana:              string
  componente:          string
  disponibilidad_pct:  number
}

// ── Reporte diario operativo (RF-ANA-008, solo staff/admin) ─────────────────────
export type ReporteDiario = {
  fecha: string
  ingestas: {
    corridas:         number
    records_read:     number
    records_inserted: number
    records_rejected: number
    statuses:         string[]
  }
  engagement_por_tipo: Array<{ event_type: string; total: number }>
  suscripciones:  null
  adquisiciones:  null
  nota:           string
}

// ── Churn mensual (monetizacion-retencion-mejoras, solo staff/admin) ───────────
export type ChurnMes = {
  mes:               string
  cancelaciones:     number
  activas_al_inicio: number
  tasa_churn:        number | null
  por_motivo?:       Record<string, number>
}

export type ChurnMensual = {
  data: ChurnMes[]
  nota: string
}

// ── Funnel de conversión free → premium (monetizacion-retencion-mejoras) ───────
export type FunnelConversion = {
  free_activos:     number
  vieron_anuncio:   number
  se_suscribieron:  number
}

// ── P&L consolidado (monetizacion-retencion-mejoras) ────────────────────────────
export type PnlConsolidado = {
  ingreso_suscripciones: number
  ingreso_publicitario:  number
  regalias_pagadas:      number
  margen_neto:           number
}

// ── MRR/ARR (modelo-financiero-simulacion) ──────────────────────────────────────
export type MrrArr = {
  mrr: number
  arr: number
  tendencia_mensual: Array<{ mes: string; ingreso: number }>
  nota: string
}

// ── Balanced Scorecard estratégico (S14-FINAL, Fase 6) ──────────────────────
export type BscKpi = {
  indicador:      string
  valor_actual:   number
  unidad:         string
  meta:           string
  porcentaje_meta: number
  semaforo:       'verde' | 'amarillo' | 'rojo'
  tendencia:      number[]
  es_estimado:    boolean
}
export type BscPerspectiva = { nombre: string; kpis: BscKpi[] }
export type BscResumen = { perspectivas: BscPerspectiva[] }

// ── Paneles predictivos Enterprise (b2b-tier-access-analitica, CU-O92/CU-O93) ──
// `tipo: "proyeccion_estadistica"` es deliberado: nunca se presenta como
// predicción de IA (ver design.md, decisión 3).
export type ProyeccionSerie =
  | { suficiente: false; mensaje: string }
  | {
      suficiente: true
      tipo: 'proyeccion_estadistica'
      pendiente_semanal: number
      horizonte_semanas: number[]
      valores_proyectados: number[]
      alerta: boolean
    }

export type SemanaHistorica = { load_week: number; track_count: number; avg_popularity: number }

export type ProyeccionGenero = {
  genero_id: number
  serie_historica: SemanaHistorica[]
} & ProyeccionSerie

export type ProyeccionArtista = {
  artist_id: number
  genero_id: number
  serie_historica: SemanaHistorica[]
  proyeccion_artista: ProyeccionSerie
  proyeccion_genero: ProyeccionSerie
  trayectoria: 'ganando_terreno' | 'perdiendo_terreno' | 'estable' | null
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export type DashboardData = {
  totals: { tracks: number; artists: number; genres: number }
  audio_averages: {
    avg_popularity:   number
    avg_energy:       number
    avg_danceability: number
    avg_valence:      number
    avg_tempo:        number
  }
  top_genres:  Array<{ name: string; track_count: number }>
  top_artists: Array<{ name: string; track_count: number; avg_popularity: number }>
  last_etl: {
    status:            string
    run_timestamp:     string
    records_inserted:  number
  } | null
  explicit_distribution: Array<{ explicit_label: string; track_count: number }>
  // ── Charts de negocio (auditoría "numbers-only" 2026-07-14) ────────────────
  // Serie diaria (no semanal: el rango real de datos es de ~12 días, ver
  // api/paquetes/analitica/queries.py) de ingresos por suscripciones/
  // publicidad vs. regalías pagadas (salida de dinero, no ingreso).
  ingresos_vs_regalias: Array<{
    dia:                     string
    ingresos_suscripciones:  number
    ingresos_publicidad:     number
    regalias_pagadas:        number
  }>
  // Altas de suscripción por semana, agrupadas en 3 series de negocio (free /
  // b2c de pago / b2b) — 6 planes individuales sobre ~66 suscripciones
  // totales serían demasiado ruidosos para una serie legible.
  altas_por_plan_semana: Array<{
    semana:    string
    free:      number
    b2c_pago:  number
    b2b:       number
  }>
  // Top géneros por engagement real (mismo raw_score que /analitica/engagement).
  engagement_por_genero: Array<{ name: string; value: number }>
  // Ranking de reproducciones bloqueadas por país (RESTRICCIONES_POR_PAIS,
  // reusada verbatim desde `distribucion`).
  reproducciones_bloqueadas_por_pais: Array<{ pais: string; total: number }>
}
