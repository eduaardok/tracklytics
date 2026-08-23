import { clearSession, getAuthHeaders, getToken } from './session'
import { fieldErrorsFromItems, resumirErroresValidacion, type ValidationErrorItem } from './validationErrors'

const BASE_URL = import.meta.env.VITE_API_URL ?? '/app/v1'

export type ApiResponse<T> = {
  data: T[]
  total?: number
  limit?: number
  offset?: number
}

// Antes se descartaba el body y se lanzaba un `Error` genérico con solo
// status/statusText — ningún consumidor podía distinguir un 404 real de un
// 500, ni mostrar el `detail` específico que FastAPI ya devuelve (límite de
// favoritos, bloqueo geográfico, etc.). `.message` mantiene el mismo formato
// de antes por compatibilidad; `.status`/`.detail` son los campos nuevos.
export class ApiError extends Error {
  status: number
  detail: string
  // Cuerpo estructurado del `detail` cuando el backend manda un objeto en vez
  // de un string (ej. `require_tier`, b2b-tier-access-analitica: `{error:
  // "tier_insuficiente", tier_requerido, tier_actual}`) — permite a un
  // consumidor específico (TierInsuficiente.tsx) leer esos campos sin
  // parsear `.detail` como texto libre.
  detailBody?: Record<string, unknown>
  // Errores de validación de Pydantic crudos (422, `detail` como array de
  // `{loc, msg, type}`) — antes se descartaban por completo (auditoría S16):
  // ni `.detail` ni `.detailBody` los recogían de forma utilizable, así que
  // CUALQUIER 422 con validación por campo caía al `statusText` genérico
  // ("Unprocessable Entity") sin importar cuántos de los 39+ formularios del
  // proyecto ya usaran `apiErrorMessage`. Ahora quedan disponibles crudos acá
  // (para UI por campo, ver `validationErrors.ts`) y ya resumidos en
  // `.detail` (para que el toast/banner genérico de cualquier formulario
  // mejore gratis, sin tocar sus 39+ call sites uno por uno).
  validationErrors?: ValidationErrorItem[]
  // true solo cuando este 401 llegó con un token guardado (sesión que
  // expiró/fue revocada a mitad de uso) — false cuando nunca hubo sesión
  // (ej. credenciales inválidas en el propio login, o una acción anónima que
  // requiere cuenta). Permite distinguir "volvé a iniciar sesión" de
  // "credenciales inválidas" sin que cada formulario reimplemente la lógica.
  sessionWasActive: boolean

  constructor(
    status: number,
    statusText: string,
    detail?: string,
    detailBody?: Record<string, unknown>,
    validationErrors?: ValidationErrorItem[],
    sessionWasActive = false,
  ) {
    super(`API ${status}: ${statusText}`)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail ?? statusText
    this.detailBody = detailBody
    this.validationErrors = validationErrors
    this.sessionWasActive = sessionWasActive
  }
}

// Mensaje seguro para mostrar al usuario: usa el `detail` del backend cuando
// existe (ej. "Plan Free: límite de 20 favoritos alcanzado..."), o el
// fallback del llamador para errores de red/parseo que no son un ApiError.
export function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.detail : fallback
}

// Mapa campo -> mensaje en español, para formularios que muestran el error
// junto al input en vez de (o además de) un toast/banner genérico — `null`
// si el error no es un 422 de validación por campo.
export function fieldErrorsFromApiError(err: unknown): Record<string, string> | null {
  if (!(err instanceof ApiError) || !err.validationErrors || err.validationErrors.length === 0) return null
  return fieldErrorsFromItems(err.validationErrors)
}

// true si el error es un 401 de sesión expirada (había token, dejó de ser
// válido) — distinto de credenciales inválidas (nunca hubo sesión, ej. el
// propio login). `apiErrorMessage` ya devuelve el texto correcto en ambos
// casos; este helper es para cuando un componente necesita reaccionar
// distinto (ej. redirigir a login) en vez de solo mostrar el mensaje.
export function esSesionExpirada(err: unknown): boolean {
  return err instanceof ApiError && err.status === 401 && err.sessionWasActive
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // Capturado ANTES del fetch: si el 401 llega, `clearSession()` ya borró el
  // token — sin este snapshot previo no habría forma de saber si hubo sesión.
  const hadToken = Boolean(getToken())
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    ...init,
  })
  if (!res.ok) {
    // Token ausente/expirado — limpia la sesión local para que el próximo
    // guard (RequireAuth, RequireSuscripcionActiva) redirija a /login en vez
    // de reintentar con un token que el backend ya rechazó.
    if (res.status === 401) clearSession()

    const sessionWasActive = res.status === 401 && hadToken
    // Sesión que expiró a mitad de uso: mensaje fijo y accionable, siempre
    // más útil que cualquier `detail`/`statusText` que mande el backend para
    // un 401 (que no sabe si el cliente tenía token o no).
    if (sessionWasActive) {
      throw new ApiError(res.status, res.statusText, 'Tu sesión expiró — vuelve a iniciar sesión.', undefined, undefined, true)
    }

    let detail: string | undefined
    let detailBody: Record<string, unknown> | undefined
    let validationErrors: ValidationErrorItem[] | undefined
    try {
      const body = await res.clone().json()
      if (typeof body?.detail === 'string') {
        detail = body.detail
      } else if (Array.isArray(body?.detail)) {
        // 422 de FastAPI/Pydantic: `detail` es un array de errores por campo.
        validationErrors = body.detail as ValidationErrorItem[]
        detail = resumirErroresValidacion(validationErrors)
      } else if (body?.detail && typeof body.detail === 'object') {
        detailBody = body.detail
        if (typeof body.detail.mensaje === 'string') detail = body.detail.mensaje
      }
    } catch {
      // Body vacío o no-JSON (ej. 502 de un proxy) — se usa statusText.
    }
    throw new ApiError(res.status, res.statusText, detail, detailBody, validationErrors, false)
  }
  return res.json() as Promise<T>
}

// Subida de archivos (comprobante de estudiante, P2/S16): no puede reusar
// `request` porque esa fija `Content-Type: application/json` siempre — un
// `FormData` necesita que el navegador ponga su propio Content-Type con el
// boundary del multipart, así que este camino omite el header por completo.
async function requestForm<T>(path: string, form: FormData): Promise<T> {
  const hadToken = Boolean(getToken())
  const res = await fetch(`${BASE_URL}${path}`, { method: 'POST', headers: { ...getAuthHeaders() }, body: form })
  if (!res.ok) {
    if (res.status === 401) clearSession()
    const sessionWasActive = res.status === 401 && hadToken
    if (sessionWasActive) {
      throw new ApiError(res.status, res.statusText, 'Tu sesión expiró — vuelve a iniciar sesión.', undefined, undefined, true)
    }
    let detail: string | undefined
    try {
      const body = await res.clone().json()
      if (typeof body?.detail === 'string') detail = body.detail
    } catch {
      // Body vacío o no-JSON.
    }
    throw new ApiError(res.status, res.statusText, detail, undefined, undefined, false)
  }
  return res.json() as Promise<T>
}

export const apiClient = {
  get:     <T>(path: string)               => request<T>(path),
  post:    <T>(path: string, body: unknown) => request<T>(path, { method: 'POST',   body: JSON.stringify(body) }),
  put:     <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT',    body: JSON.stringify(body) }),
  patch:   <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH',  body: JSON.stringify(body) }),
  delete:  <T>(path: string)               => request<T>(path, { method: 'DELETE' }),
  postForm: <T>(path: string, form: FormData) => requestForm<T>(path, form),
}
