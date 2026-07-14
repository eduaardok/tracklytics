import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { isAuthenticated } from '@shared/lib/session'
import { analiticaApi } from '../api/analitica.api'

type Props = { children: ReactNode }

// RN-ANA-003 (spec.md, "Acceso a paneles analíticos condicionado a suscripción
// activa"): el backend gatea /app/v1/analitica/* completo vía
// `require_b2b_panel_access` (api/paquetes/analitica/deps.py) — admin bypassa,
// Cliente B2B (role=analyst) requiere una suscripción activa verificada contra
// PocketBase, cualquier otro rol recibe 403 directo. Este guard reacciona al
// código de estado real de una llamada gateada (ahora con el token real
// inyectado por `apiClient`/`getAuthHeaders`, ver auth.api.ts) en vez de
// reimplementar la regla de negocio en el cliente.
export function RequireSuscripcionActiva({ children }: Props) {
  // Sin sesión: no vale la pena golpear el backend, evita el parpadeo del
  // probe y distingue explícitamente "sin sesión" de "sesión sin acceso".
  const sinSesion = !isAuthenticated()

  const { data: status, isLoading } = useQuery({
    queryKey:  ['analitica', 'access-check'],
    queryFn:   analiticaApi.checkAccesoAnalitica,
    enabled:   !sinSesion,
    retry:     false,
    staleTime: 60_000,
  })

  if (sinSesion) return <Navigate to="/login" replace />

  // Evita el parpadeo de redirigir antes de conocer el estado real.
  if (isLoading) return null

  // 401: el token guardado ya no es válido (expiró/revocado) -> a login.
  if (status === 401) return <Navigate to="/login" replace />

  // 403: sesión válida pero sin acceso (rol sin permiso, o analyst sin
  // suscripción activa) -> pantalla de upsell/onboarding real (selección de
  // plan). Antes apuntaba a /analitica/suscripciones, pero esa ruta pasó a
  // ser el dashboard de churn (monetizacion-retencion-mejoras, admin-only,
  // require_staff) — redirigir ahí a un analyst sin suscripción lo dejaba
  // rebotando contra una página que tampoco puede ver.
  if (status === 403) return <Navigate to="/suscripciones" replace />

  // Cualquier otro caso (200, o un error de red que no resolvió `status`)
  // deja pasar — un fallo de infraestructura no debe bloquear el acceso,
  // ese caso ya lo maneja el error banner propio de cada página.
  return <>{children}</>
}
