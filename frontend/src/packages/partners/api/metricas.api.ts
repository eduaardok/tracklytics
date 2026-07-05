import { apiClient, type ApiResponse } from '@shared/lib/api-client'
import type { PartnerMetrica } from '../types'

// A diferencia de `partners.api.ts` (que llama a `/partners/v1/*` con la API
// key del partner, sin sesión), esto es una vista interna de staff sobre
// `/app/v1/partners/metricas` — usa el cliente autenticado por sesión
// (`shared/lib/api-client.ts`), igual que el resto de `seguridad`/`analitica`.
export const metricasApi = {
  porPartner: () => apiClient.get<ApiResponse<PartnerMetrica>>('/partners/metricas'),
}
