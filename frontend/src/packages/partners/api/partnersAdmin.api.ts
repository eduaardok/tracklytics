import { apiClient, type ApiResponse } from '@shared/lib/api-client'
import type { PartnerTier } from '../types'

// CRUD administrativo de partners + gestión de API keys (change p1-ciclos-vida).
// Router interno de staff `/app/v1/partners/admin`, bajo `require_partner_admin`
// (rol admin_comercial). Usa el cliente autenticado por sesión — NO la API key
// de partner (eso es `partners.api.ts`, la consola de prueba externa).
export type Partner = {
  id:               string
  nombre:           string
  tier:             PartnerTier
  estado:           string
  email_contacto:   string
  fecha_expiracion: string | null
  created:          string
}

export type CrearPartnerBody = {
  nombre:          string
  tier:            PartnerTier
  email_contacto?: string
}

type PartnerConKey = { status: string; partner: Partner; api_key: string }

export const partnersAdminApi = {
  listar: () => apiClient.get<ApiResponse<Partner>>('/partners/admin'),

  crear: (body: CrearPartnerBody) =>
    apiClient.post<PartnerConKey>('/partners/admin', body),

  rotarKey: (partnerId: string) =>
    apiClient.post<PartnerConKey>(`/partners/admin/${partnerId}/rotar-key`, undefined),

  desactivar: (partnerId: string) =>
    apiClient.post<{ status: string; partner: Partner }>(`/partners/admin/${partnerId}/desactivar`, undefined),
}
