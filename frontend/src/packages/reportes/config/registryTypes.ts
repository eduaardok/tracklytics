import type { ReactNode } from 'react'
import type { FilaInforme } from '../types'

export type InformeConfig = {
  departamento: string   // slug de ruta, ej. 'comercial'
  informe:      string   // slug de ruta, ej. 'adquisicion'
  codigo:       string   // 'C01'
  labelCorto:   string   // label del enlace del sidebar (antes de cargar datos)
  render:       (datos: FilaInforme[], resumen: Record<string, unknown>) => ReactNode
  // Granularidad con la que este informe carga la PRIMERA vez (default global:
  // 'mes', ver useCompoundReport). Solo hace falta declararla cuando el dato de
  // Gold que consume el informe no existe en 'mes' — ej. C17 (proyección):
  // `prediccion_4sem` solo se calcula a nivel semanal, así que con el default
  // global el informe cargaba "Sin datos" siempre hasta que alguien cambiaba
  // el selector a mano (bug real, auditoría S16 Fase 2).
  granularidadDefault?: string
}

export type DepartamentoConfig = {
  slug:     string
  label:    string
  informes: InformeConfig[]
}
