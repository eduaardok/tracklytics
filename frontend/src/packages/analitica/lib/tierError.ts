import { ApiError } from '@shared/lib/api-client'

export type TierInsuficienteInfo = {
  tierRequerido: string
  tierActual: string
}

const NOMBRE_TIER: Record<string, string> = {
  basico: 'Básico',
  pro: 'Pro',
  enterprise: 'Enterprise',
}

export function nombreTier(tier: string): string {
  return NOMBRE_TIER[tier] ?? tier
}

// Lee el 403 estructurado de `require_tier` (b2b-tier-access-analitica,
// api/paquetes/analitica/deps.py) sin adivinar por texto — distingue este
// caso de cualquier otro error (red, 404, sin suscripción activa) para
// mostrar el estado "disponible desde el plan X" en vez de un error genérico.
export function tierInsuficienteInfo(error: unknown): TierInsuficienteInfo | null {
  if (!(error instanceof ApiError) || error.status !== 403) return null
  const body = error.detailBody
  if (body?.error !== 'tier_insuficiente') return null
  return {
    tierRequerido: String(body.tier_requerido ?? ''),
    tierActual: String(body.tier_actual ?? ''),
  }
}
