import { apiClient } from '@shared/lib/api-client'
import type { CompoundReportResponse } from '../types'

// Los 30 informes compuestos (S13-P3a/P3b) comparten UN SOLO shape de
// respuesta y una sola convención de ruta
// (`/reportes/compuestos/<departamento>/<informe>`) — un solo método
// parametrizado en vez de 30 funciones idénticas salvo por la URL.
export const reportesApi = {
  compuesto: (departamento: string, informe: string, params?: { periodoInicio?: string; periodoFin?: string }) => {
    const qs = new URLSearchParams()
    if (params?.periodoInicio) qs.set('periodo_inicio', params.periodoInicio)
    if (params?.periodoFin) qs.set('periodo_fin', params.periodoFin)
    const query = qs.toString()
    return apiClient.get<CompoundReportResponse>(
      `/reportes/compuestos/${departamento}/${informe}${query ? `?${query}` : ''}`,
    )
  },
}
