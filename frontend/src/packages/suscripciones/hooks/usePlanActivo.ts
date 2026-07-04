import { useQuery } from '@tanstack/react-query'
import { isAuthenticated } from '@shared/lib/session'
import { suscripcionesApi } from '../api/suscripciones.api'

export const PLAN_ACTIVO_QUERY_KEY = ['suscripciones', 'activa']

// Hook compartido para cualquier paquete que necesite reaccionar al plan
// activo del usuario sin reimplementar la regla de negocio en el cliente —
// consume GET /app/v1/suscripciones/activa (misma fuente de verdad que
// `require_b2b_panel_access`/`require_active_subscription` en el backend,
// PocketBase vía `pb_client.list_activas`). No es un guard de ruta como
// `RequireSuscripcionActiva` (analitica): ese redirige la página completa
// contra un endpoint ya gateado; este expone el estado para gating parcial
// de contenido dentro de una página (ej. paywall de audio features en
// TrackDetailPage), donde bloquear toda la ruta no aplica.
export function usePlanActivo() {
  const sinSesion = !isAuthenticated()

  const { data, isLoading } = useQuery({
    queryKey:  PLAN_ACTIVO_QUERY_KEY,
    queryFn:   () => suscripcionesApi.activa(),
    enabled:   !sinSesion,
    staleTime: 30_000,
  })

  const activa   = data?.data ?? null
  const tipoPlan = activa?.tipo_plan ?? 'free'

  return {
    isLoading: sinSesion ? false : isLoading,
    activa,
    tipoPlan,
    // Mismo criterio que app/catalogo/track.html (getPlanTier() !== 'free'):
    // cualquier plan activo distinto de "free" desbloquea contenido premium,
    // sin distinguir B2C/B2B — el legacy nunca verificó el literal 'premium'.
    esPremium: !sinSesion && tipoPlan !== 'free',
  }
}
