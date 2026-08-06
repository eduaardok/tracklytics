import { apiClient } from '@shared/lib/api-client'
import type {
  EstadoGeneracion, GenerarActividadBody, GenerarActividadResultado,
  GenerarHistoricoBody, GenerarHistoricoResultado,
} from '../types'

export const simulacionApi = {
  generarActividad: (body: GenerarActividadBody) =>
    apiClient.post<GenerarActividadResultado>('/simulacion/generar-actividad', body),
  generarHistorico: (body: GenerarHistoricoBody) =>
    apiClient.post<GenerarHistoricoResultado>('/simulacion/generar-historico', body),
  estado: () =>
    apiClient.get<EstadoGeneracion>('/simulacion/estado'),
}
