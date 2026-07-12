import { apiClient, type ApiResponse } from '@shared/lib/api-client'
import { clearSession, getDeviceId, setSession, updateSessionUser, type SessionUser } from '@shared/lib/session'

type PbAuthResponse = {
  token:  string
  record: SessionUser & Record<string, unknown>
}

export type SesionActiva = {
  sesion_id:      string
  dispositivo_id: string
  fecha_inicio:   string
  tipo:           string | null
  os:             string | null
}

export type MiPerfil = {
  usuario_id:     string
  nombre:         string
  email:          string
  pais:           string
  rol:            string
  perfil_publico: boolean
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

  actualizarPerfil: async (body: { nombre?: string; pais?: string; perfilPublico?: boolean }): Promise<void> => {
    const { nombre, pais, perfilPublico } = body
    await apiClient.patch('/seguridad/perfil', {
      nombre, pais,
      ...(perfilPublico !== undefined ? { perfil_publico: perfilPublico } : {}),
    })
    // Bug preexistente encontrado al tocar esta función (S10 ronda 2):
    // `updateSessionUser({ nombre, pais })` guardaba una clave `nombre` que
    // `SessionUser` no tiene (el campo real es `name`) — TS no lo marcaba
    // porque `Partial<SessionUser>` no hace excess-property-check contra una
    // variable tipada, así que compilaba pero el nombre cacheado en sesión
    // nunca se actualizaba de verdad tras editar el perfil. `perfil_publico`
    // tampoco vive en SessionUser (exclusivo de DIM_USUARIO, sin contraparte
    // en el registro de auth de PocketBase) — no se refleja en la sesión.
    updateSessionUser({
      ...(nombre !== undefined ? { name: nombre } : {}),
      ...(pais !== undefined ? { pais } : {}),
    })
  },

  // Mi Perfil (S10 ronda 2): trae `perfil_publico`, ausente de SessionUser.
  miPerfil: () => apiClient.get<MiPerfil>('/seguridad/perfil'),

  cambiarPassword: (body: { passwordActual: string; passwordNueva: string; passwordNuevaConfirmar: string }) =>
    apiClient.patch<{ status: string }>('/seguridad/password', {
      password_actual:          body.passwordActual,
      password_nueva:           body.passwordNueva,
      password_nueva_confirmar: body.passwordNuevaConfirmar,
    }),

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

  // Sesiones multi-dispositivo (S10 Día 3) — antes solo se podía cerrar la
  // sesión del propio dispositivo (logout).
  misSesiones: () =>
    apiClient.get<ApiResponse<SesionActiva>>('/seguridad/sesiones'),

  cerrarSesionRemota: (sesionId: string) =>
    apiClient.delete<{ status: string }>(`/seguridad/sesiones/${sesionId}`),

  miDispositivoId: getDeviceId,
}
