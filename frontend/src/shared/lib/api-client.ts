import { clearSession, getAuthHeaders } from './session'

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

  constructor(status: number, statusText: string, detail?: string) {
    super(`API ${status}: ${statusText}`)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail ?? statusText
  }
}

// Mensaje seguro para mostrar al usuario: usa el `detail` del backend cuando
// existe (ej. "Plan Free: límite de 20 favoritos alcanzado..."), o el
// fallback del llamador para errores de red/parseo que no son un ApiError.
export function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.detail : fallback
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    ...init,
  })
  if (!res.ok) {
    // Token ausente/expirado — limpia la sesión local para que el próximo
    // guard (RequireAuth, RequireSuscripcionActiva) redirija a /login en vez
    // de reintentar con un token que el backend ya rechazó.
    if (res.status === 401) clearSession()
    let detail: string | undefined
    try {
      const body = await res.clone().json()
      // El 422 de FastAPI manda `detail` como array de objetos de validación,
      // no string — se ignora ese caso y cae al fallback de statusText.
      if (typeof body?.detail === 'string') detail = body.detail
    } catch {
      // Body vacío o no-JSON (ej. 502 de un proxy) — se usa statusText.
    }
    throw new ApiError(res.status, res.statusText, detail)
  }
  return res.json() as Promise<T>
}

export const apiClient = {
  get:    <T>(path: string)               => request<T>(path),
  post:   <T>(path: string, body: unknown) => request<T>(path, { method: 'POST',   body: JSON.stringify(body) }),
  put:    <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT',    body: JSON.stringify(body) }),
  patch:  <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH',  body: JSON.stringify(body) }),
  delete: <T>(path: string)               => request<T>(path, { method: 'DELETE' }),
}
