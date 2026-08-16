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

// FASE 4 (Prompt 10): ranking paginado por defecto de EngagementPage
// (GET /analitica/engagement/ranking) — mismo scoring que EngagementData,
// enriquecido con el nombre de track/artista para listar sin necesidad de
// buscar primero.
export type EngagementRankingRow = EngagementData & {
  fact_id: number
  track_name: string
  artist_name: string
}

export type EngagementRankingResponse = {
  data:  EngagementRankingRow[]
  total: number
  page:  number
  limit: number
}

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
// Los `avg_*` son `avgIf(..., source_type != 'user_uploaded')` — un artista
// cuyo catálogo es 100% contenido subido por usuarios (existe al menos uno
// real: "YASERSX", artist_id 29864) no tiene ninguna fila que promediar,
// así que ClickHouse devuelve NULL, no 0. Bug real encontrado en S16
// Prompt 05: el tipo anterior los declaraba `number` sin más, y
// ComparacionPage llamaba `.toFixed()` directo sobre esos campos — con un
// artista así, esto tiraba abajo la página completa (React Router
// "Unexpected Application Error!"). Nullable a propósito para forzar el
// manejo explícito en cada consumidor (ComparacionPage, audioFeatures.ts).
export type ArtistAudioStats = {
  artist_id:             number
  name:                  string
  track_count:           number
  avg_popularity:        number
  avg_danceability:      number | null
  avg_energy:            number | null
  avg_speechiness:       number | null
  avg_acousticness:      number | null
  avg_instrumentalness:  number | null
  avg_liveness:          number | null
  avg_valence:           number | null
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
export type BscSemaforo = 'verde' | 'amarillo' | 'rojo' | 'sin_datos'

export type BscKpi = {
  indicador:        string
  valor_actual:     number | null
  unidad:           string
  meta:             string
  meta_valor:       number | null
  invertido:        boolean
  porcentaje_meta:  number | null
  semaforo:         BscSemaforo
  tendencia:        number[]
  es_estimado:      boolean
  nota:             string | null
  desglose_regional?: Array<{ region: string; registros_nuevos: number }>
}
export type BscPerspectiva = { nombre: string; kpis: BscKpi[] }
export type BscResumen = { perspectivas: BscPerspectiva[] }

// ── Vista Asistida — motor 100% algorítmico (S16, Prompt 05) ───────────────
// `metodologia` se muestra tal cual en pantalla (evidencia de defendibilidad
// académica: regresión + anomalías + reglas de correlación, cero IA/LLM).
export type BscAnomalia = { indice: number; valor: number; z_score: number }

export type BscDiagnostico = {
  indicador:            string
  semaforo:             BscSemaforo
  valor_actual?:         number
  meta?:                 string
  desviacion_pct:        number | null
  proyeccion:            number | null
  proyeccion_horizonte?: number[]
  anomalias:             BscAnomalia[]
  nota:                  string | null
}

export type BscCorrelacion = {
  regla:              string
  mensaje:            string
  kpis_involucrados:  string[]
}

export type BscIndiceDesempeno = {
  indicador:    string
  valor_actual: number
  tendencia:    number[]
  nota:         string
}

export type BscAnalisisInteligente = {
  diagnosticos:              BscDiagnostico[]
  correlaciones:             BscCorrelacion[]
  indice_desempeno_relativo: BscIndiceDesempeno | null
  metodologia:               string
}

// ── Benchmark SQL directo vs. Gold (S16-P2, solo staff/admin) ──────────────
// No confundir con `/analitica/benchmark` (ArtistaBenchmarkPage, comparación
// de artistas) — esto es rendimiento de infraestructura, no un informe de
// negocio.
export type BenchmarkInforme = {
  informe_id:   string
  nombre:       string
  informe_gold: string
  tabla_gold:   string
}

export type BenchmarkMedicion = {
  query:             string
  tiempos_s:         number[]
  tiempo_promedio_s: number
  filas_leidas:      number
  resultado:         unknown[]
}

export type BenchmarkResultado = {
  informe_id:    string
  nombre:        string
  informe_gold:  string
  tabla_gold:    string
  repeticiones:  number
  sql_directo:   BenchmarkMedicion
  sql_gold:      BenchmarkMedicion
  factor_mejora: number | null
  coinciden:     boolean
}

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
