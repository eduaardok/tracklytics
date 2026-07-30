import type { ReactNode } from 'react'
import type { FilaInforme } from '../types'

export type InformeConfig = {
  departamento: string   // slug de ruta, ej. 'comercial'
  informe:      string   // slug de ruta, ej. 'adquisicion'
  codigo:       string   // 'C01'
  labelCorto:   string   // label del enlace del sidebar (antes de cargar datos)
  render:       (datos: FilaInforme[], resumen: Record<string, unknown>) => ReactNode
}

export type DepartamentoConfig = {
  slug:     string
  label:    string
  informes: InformeConfig[]
}
