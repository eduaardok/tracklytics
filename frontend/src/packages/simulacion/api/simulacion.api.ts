import { apiClient } from '@shared/lib/api-client'
import type { GenerarActividadBody, GenerarActividadResultado } from '../types'

export const simulacionApi = {
  generarActividad: (body: GenerarActividadBody) =>
    apiClient.post<GenerarActividadResultado>('/simulacion/generar-actividad', body),
}
