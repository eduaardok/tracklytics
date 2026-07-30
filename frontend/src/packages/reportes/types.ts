// Tipos de los 30 informes compuestos (S13-P3b) — la forma es la MISMA para
// los 30 endpoints (`armar_respuesta`, api/paquetes/reportes/schemas.py),
// solo cambia la forma de cada fila de `datos` (por eso `Record<string, unknown>`
// en vez de un tipo por informe: 30 tipos distintos no aportarían nada que
// el config de cada informe no maneje ya con sus propios accessors).
export type FilaInforme = Record<string, unknown> & {
  periodo?: string
  es_estimado?: number
  updated_at?: string
}

export type CompoundReportResponse = {
  informe:        string
  objetivo:       string
  titulo:         string
  departamento:   string
  periodo_inicio: string | null
  periodo_fin:    string | null
  datos:          FilaInforme[]
  resumen:        Record<string, unknown>
}
