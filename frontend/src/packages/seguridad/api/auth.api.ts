import { apiClient } from '@shared/lib/api-client'
import { clearSession, getDeviceId, setSession, type SessionUser } from '@shared/lib/session'

type PbAuthResponse = {
  token:  string
  record: SessionUser & Record<string, unknown>
}

export const ROLES_AUTO_REGISTRABLES = ['user', 'analyst'] as const
export type RolAutoRegistrable = (typeof ROLES_AUTO_REGISTRABLES)[number]

export const authApi = {
  login: async (email: string, password: string): Promise<SessionUser> => {
    const resp = await apiClient.post<PbAuthResponse>('/seguridad/auth/login', {
      email, password, dispositivo_id: getDeviceId(), tipo: 'web', app_version: 'web-1.0',
    })
    setSession(resp.token, resp.record)
    return resp.record
  },

  registro: async (
    email: string, password: string, nombre: string, rol: RolAutoRegistrable, pais = '',
  ): Promise<SessionUser> => {
    await apiClient.post('/seguridad/auth/registro', { email, password, nombre, pais, rol })
    return authApi.login(email, password)
  },

  logout: async (): Promise<void> => {
    try {
      await apiClient.post('/seguridad/auth/logout', { dispositivo_id: getDeviceId() })
    } catch {
      // Fire-and-forget, igual que app/js/api.js::pbLogout — un fallo de red
      // no debe impedir que el usuario cierre sesión localmente.
    } finally {
      clearSession()
    }
  },
}
