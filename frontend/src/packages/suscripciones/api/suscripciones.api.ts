import { apiClient } from '@shared/lib/api-client'
import type { ApiResponse } from '@shared/lib/api-client'
import type {
  CambiarPlanResponse, ConfirmarSuscripcionBody, ConfirmarSuscripcionResponse, MotivoCancelacion,
  Plan, PrecioPlanAdmin, ProcesarCobroResponse, SuscripcionActiva,
} from '../types'

export const suscripcionesApi = {
  planes: () =>
    apiClient.get<ApiResponse<Plan>>('/suscripciones/planes'),

  activa: () =>
    apiClient.get<{ data: SuscripcionActiva | null }>('/suscripciones/activa'),

  confirmar: (body: ConfirmarSuscripcionBody) =>
    apiClient.post<ConfirmarSuscripcionResponse>('/suscripciones', body),

  // `motivo` (monetizacion-retencion-mejoras): opcional, el backend aplica
  // "otro" por defecto si no se especifica.
  cancelar: (suscripcionId: string, motivo?: MotivoCancelacion) =>
    apiClient.post<{ data: SuscripcionActiva }>(
      `/suscripciones/${suscripcionId}/cancelar${motivo ? `?motivo=${motivo}` : ''}`, undefined,
    ),

  // ── Cambio de plan con prorrateo (modelo-financiero-completar-huecos, CU-O94) ──
  cambiarPlan: (suscripcionId: string, nuevoPlanId: string, metodoPagoId?: string | null) =>
    apiClient.put<CambiarPlanResponse>(`/suscripciones/${suscripcionId}/plan`, {
      nuevo_plan_id: nuevoPlanId, metodo_pago_id: metodoPagoId ?? null,
    }),

  // ── Dunning: reintento de cobro fallido (CU-O95) ────────────────────────────
  procesarCobro: (suscripcionId: string, metodoPagoId?: string | null) =>
    apiClient.post<ProcesarCobroResponse>(`/suscripciones/${suscripcionId}/procesar-cobro`, {
      metodo_pago_id: metodoPagoId ?? null,
    }),

  // ── Precios de plan configurables (admin, CU-O98) ───────────────────────────
  preciosAdmin: () =>
    apiClient.get<{ data: PrecioPlanAdmin[] }>('/suscripciones/admin/planes'),

  actualizarPrecioPlan: (planId: string, precioUsd: number) =>
    apiClient.put<{ status: string; plan_id: string; precio_usd: number }>(
      `/suscripciones/admin/planes/${planId}/precio`, { precio_usd: precioUsd },
    ),

  // ── Administración de suscripciones individuales (change p1-ciclos-vida) ────
  adminListar: (params: { estado?: string; plan_id?: string; fecha_desde?: string; fecha_hasta?: string; page?: number; limit?: number }) => {
    const qs = new URLSearchParams()
    if (params.estado) qs.set('estado', params.estado)
    if (params.plan_id) qs.set('plan_id', params.plan_id)
    if (params.fecha_desde) qs.set('fecha_desde', params.fecha_desde)
    if (params.fecha_hasta) qs.set('fecha_hasta', params.fecha_hasta)
    qs.set('page', String(params.page ?? 1))
    qs.set('limit', String(params.limit ?? 20))
    return apiClient.get<SuscripcionesAdminResponse>(`/suscripciones/admin/suscripciones?${qs.toString()}`)
  },

  adminDetalle: (suscripcionId: string) =>
    apiClient.get<SuscripcionAdminDetalle>(`/suscripciones/admin/suscripciones/${suscripcionId}`),

  adminCancelar: (suscripcionId: string, motivo: string) =>
    apiClient.post<{ data: SuscripcionAdminRecord }>(`/suscripciones/admin/suscripciones/${suscripcionId}/cancelar`, { motivo }),

  adminExtender: (suscripcionId: string, dias: number, motivo: string) =>
    apiClient.post<{ data: SuscripcionAdminRecord; fecha_vencimiento: string }>(`/suscripciones/admin/suscripciones/${suscripcionId}/extender`, { dias, motivo }),

  // ── Comprobante de estudiante real (P2, S16) ────────────────────────────────
  subirComprobanteEstudiante: (emailInstitucional: string, archivo: File) => {
    const form = new FormData()
    form.set('archivo', archivo)
    return apiClient.postForm<{ data: SolicitudEstudiante }>(
      `/suscripciones/estudiante/comprobante?email_institucional=${encodeURIComponent(emailInstitucional)}`, form,
    )
  },

  miSolicitudEstudiante: () =>
    apiClient.get<{ data: SolicitudEstudiante | null }>('/suscripciones/estudiante/mi-solicitud'),

  solicitudesEstudianteAdmin: (estado?: 'pendiente' | 'aprobado' | 'rechazado') =>
    apiClient.get<{ data: SolicitudEstudiante[] }>(
      `/suscripciones/admin/estudiante/solicitudes${estado ? `?estado=${estado}` : ''}`,
    ),

  revisarSolicitudEstudiante: (solicitudId: string, estado: 'aprobado' | 'rechazado') =>
    apiClient.patch<{ status: string }>(`/suscripciones/admin/estudiante/solicitudes/${solicitudId}`, { estado }),
}

export type SolicitudEstudiante = {
  solicitud_id:        string
  usuario_id?:          string
  email_institucional:  string
  archivo_nombre?:      string
  estado:                'pendiente' | 'aprobado' | 'rechazado'
  creado_en:              string
  revisado_en?:           string | null
  revisado_por?:          string | null
}

export type SuscripcionAdminRecord = {
  id:                 string
  usuario_o_cliente:  string
  usuario_nombre?:    string
  usuario_email?:     string
  tipo_plan:          string
  monto:              number
  moneda:             string
  estado:             string
  created:            string
  fecha_vencimiento?: string
}
export type CobroSuscripcion = {
  transaccion_id: string
  monto:          number
  moneda:         string
  estado:         string
  concepto:       string
  fecha:          string
}
export type SuscripcionesAdminResponse = { data: SuscripcionAdminRecord[]; total: number; total_pages: number; page: number; limit: number }
export type SuscripcionAdminDetalle = { suscripcion: SuscripcionAdminRecord; cobros: CobroSuscripcion[] }

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
      if (!activa) await suscripcionesApi.confirmar({ plan_id: 'free', metodo_pago_id: null })
    } catch {
      // Fail-open para B2C, igual que el legacy: un fallo de red no debe
      // impedir el login, el auto-assign se reintenta en la próxima sesión.
    }
    return { path: '/', onboarding: false }
  }

  // admin u otro rol staff: sin orquestación de planes.
  return { path: '/', onboarding: false }
}
