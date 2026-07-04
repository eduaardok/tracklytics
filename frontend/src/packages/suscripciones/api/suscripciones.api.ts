import { apiClient } from '@shared/lib/api-client'
import type { ApiResponse } from '@shared/lib/api-client'
import type { ConfirmarSuscripcionBody, Plan, SuscripcionActiva } from '../types'

export const suscripcionesApi = {
  planes: () =>
    apiClient.get<ApiResponse<Plan>>('/suscripciones/planes'),

  activa: () =>
    apiClient.get<{ data: SuscripcionActiva | null }>('/suscripciones/activa'),

  confirmar: (body: ConfirmarSuscripcionBody) =>
    apiClient.post<{ data: SuscripcionActiva }>('/suscripciones', body),

  cancelar: (suscripcionId: string) =>
    apiClient.post<{ data: SuscripcionActiva }>(`/suscripciones/${suscripcionId}/cancelar`, undefined),
}

export type PostAuthDestino = {
  path:       string
  onboarding: boolean
}

// Orquestación post-login/post-registro (RF pendiente, docs/decisiones-refactorizacion.md
// sección 13): replica 1:1 la lógica de app/autenticacion/{login,register}.html —
// B2C (`role="user"`) sin plan activo se auto-asigna Free; B2B (`role="analyst"`)
// sin plan activo va a onboarding de selección de plan; `admin` y cualquier otro
// rol staff entra directo, sin noción de plan. Se reutiliza una sola función para
// login y registro (el legacy tenía dos variantes ligeramente distintas: registro
// asigna sin verificar por ser cuenta nueva, login reverifica en cada sesión) —
// aquí siempre se verifica primero porque una cuenta nueva nunca tiene plan
// activo, así que el resultado es idéntico y no hay lógica duplicada entre las
// dos páginas de `packages/seguridad`.
export async function resolverDestinoPostAuth(role: string): Promise<PostAuthDestino> {
  if (role === 'analyst') {
    try {
      const { data: activa } = await suscripcionesApi.activa()
      if (!activa) return { path: '/suscripciones', onboarding: true }
    } catch {
      // Fail-closed para B2B, igual que el legacy: si no se puede verificar,
      // manda a onboarding en vez de dejar pasar sin plan.
      return { path: '/suscripciones', onboarding: true }
    }
    return { path: '/', onboarding: false }
  }

  if (role === 'user') {
    try {
      const { data: activa } = await suscripcionesApi.activa()
      if (!activa) await suscripcionesApi.confirmar({ plan_id: 'free', metodo_pago: null })
    } catch {
      // Fail-open para B2C, igual que el legacy: un fallo de red no debe
      // impedir el login, el auto-assign se reintenta en la próxima sesión.
    }
    return { path: '/', onboarding: false }
  }

  // admin u otro rol staff: sin orquestación de planes.
  return { path: '/', onboarding: false }
}
