// Almacenamiento de sesión — capa framework-agnostic que usa `api-client`
// (shared) sin depender de `packages/seguridad`, evitando un ciclo de
// importación (seguridad ya depende de shared, no al revés). La API de alto
// nivel (login/registro/logout, guards de React) vive en `packages/seguridad`.

const TOKEN_KEY  = 'pb_token'
const USER_KEY   = 'pb_user'
const DEVICE_KEY = 'dispositivo_id'

export type SessionUser = {
  id:    string
  email: string
  name?: string
  role:  string
  pais?: string
  // PocketBase ya manda este campo en el record de auth (login/registro) y
  // `setSession` guarda el objeto completo — solo faltaba declararlo en el
  // tipo para poder usarlo (ver ProfilePage, packages/seguridad).
  created?: string
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function getUser(): SessionUser | null {
  const raw = localStorage.getItem(USER_KEY)
  return raw ? JSON.parse(raw) : null
}

export function getRole(): string | null {
  return getUser()?.role ?? null
}

export function isAuthenticated(): boolean {
  return !!getToken()
}

export function setSession(token: string, user: SessionUser): void {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

// Id de dispositivo persistente por navegador — mismo esquema que
// app/js/api.js::getDeviceId, requerido por /seguridad/auth/login|logout
// para poblar DIM_DISPOSITIVO/FACT_SESION.
export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(DEVICE_KEY, id)
  }
  return id
}

export function getAuthHeaders(): Record<string, string> {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}
