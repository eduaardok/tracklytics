// ── ETL / cargas (OpenSpec `ingesta` v1, /app/v1/ingesta/*) ─────────────────────
export type SyntheticMode = 'uniform' | 'normal' | 'empirical'

export type EjecucionIngestaRequest = {
  week_number:    number
  forzar_recarga: boolean
  synthetic_mode: SyntheticMode
}

export type EjecucionTrigger = {
  ejecucion_id:    string
  week_number:     number
  forzado:         boolean
  synthetic_mode:  SyntheticMode
  airflow:         unknown
}

export type EtapaPipeline = 'extraccion' | 'transformacion_staging' | 'carga_clickhouse' | 'auditoria'

export type EtapaEstado = {
  task_id: string
  etapa:   string // EtapaPipeline en el caso feliz; el backend hace fallback al task_id crudo si no lo reconoce
  estado:  string | null // estado de Airflow: queued/running/success/failed/...
}

export type EjecucionEstado = {
  ejecucion_id: string
  estado:       string | null
  etapas:       EtapaEstado[]
}

// CARGAS_HISTORIAL/CARGAS_ULTIMA (queries.py) — mismo shape para una fila del
// historial y para `ultima_carga`.
export type CargaLog = {
  log_id:             string
  run_timestamp:      string
  week_number:        number
  status:             string
  records_read:       number
  records_inserted:   number
  records_rejected:   number
  duration_seconds:   number
  tasa_rechazo_pct:   number | null
  requiere_revision:  boolean
}

export type CargasHistorial = {
  data:         CargaLog[]
  page:         number
  limit:        number
  total:        number
  ultima_carga: CargaLog | null
}

// ── Data quality (root-mounted GET /data-quality) ───────────────────────────────
export type DataQuality = {
  total_records:         number
  real_records:          number
  synthetic_records:     number
  user_uploaded_records: number
  real_pct:              number
  synthetic_pct:         number
  user_uploaded_pct:     number
  last_load: {
    week_number:       number
    status:             string
    run_timestamp:      string
    records_inserted:   number
  } | null
  rejection_rate: number | null
}

// ── Dimensiones editables (root-mounted /dim/{table}) ────────────────────────────
// Mismas 11 keys que `DIM_TABLES` en api/core/config.py — espejo exacto, no
// inventado. El backend resuelve `{table}` contra este diccionario; cualquier
// otro valor devuelve 404.
export const DIM_TABLE_OPTIONS = [
  { key: 'artists',          label: 'Artistas' },
  { key: 'albums',           label: 'Álbumes' },
  { key: 'genres',           label: 'Géneros' },
  { key: 'date',             label: 'Fechas' },
  { key: 'musical_key',      label: 'Tonalidad musical' },
  { key: 'mode',             label: 'Modo' },
  { key: 'time_signature',   label: 'Compás' },
  { key: 'explicit_type',    label: 'Tipo explícito' },
  { key: 'popularity_range', label: 'Rango de popularidad' },
  { key: 'tempo_range',      label: 'Rango de tempo' },
  { key: 'energy_level',     label: 'Nivel de energía' },
] as const

export type DimTableKey = (typeof DIM_TABLE_OPTIONS)[number]['key']

// Fila de dimensión: shape heterogéneo por tabla (11 esquemas distintos) — se
// tipa como registro abierto a propósito, el formulario se genera dinámicamente
// a partir de las keys reales que devuelve el backend (ver CrudDimensionesPage).
export type DimRow = Record<string, string | number | boolean | null>

export type DimListResponse = {
  data:  DimRow[]
  page:  number
  limit: number
  total: number
}

// FACT_TRACKS de solo lectura (root-mounted GET /facts) — vista de consulta
// dentro de CrudDimensionesPage, nunca editable (RN: "la tabla de hechos nunca
// se edita directamente desde la interfaz").
export type FactTrackRow = {
  fact_id:           number
  track_id:          string
  track_name:        string
  artist_id:         number
  album_id:          number
  genre_id:          number
  popularity:        number
  duration_ms:       number
  danceability:      number
  energy:             number
  loudness:           number
  speechiness:        number
  acousticness:       number
  instrumentalness:   number
  liveness:           number
  valence:            number
  tempo:              number
  load_week:          number
  source_type:        string
  inserted_at:        string
}

export type FactsListResponse = {
  data:  FactTrackRow[]
  page:  number
  limit: number
  total: number
}
