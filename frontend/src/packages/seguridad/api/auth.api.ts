import { apiClient, type ApiResponse } from '@shared/lib/api-client'
import { clearSession, getDeviceId, getUser, setSession, updateSessionUser, type SessionUser } from '@shared/lib/session'
import type { MisDatos } from '../types'

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
  rol:              string
  perfil_publico:   boolean
  email_verificado: boolean
  roles_admin:      string[]
}

export const ROLES_AUTO_REGISTRABLES = ['user', 'analyst'] as const
export type RolAutoRegistrable = (typeof ROLES_AUTO_REGISTRABLES)[number]

export const authApi = {
  login: async (email: string, password: string): Promise<SessionUser> => {
    const resp = await apiClient.post<PbAuthResponse>('/seguridad/auth/login', {
      email, password, dispositivo_id: getDeviceId(), tipo: 'web', app_version: 'web-1.0',
    })
    setSession(resp.token, resp.record)
    // roles_admin (BRIDGE_USUARIO_ROL_ADMIN) no viaja en la respuesta de
    // login de PocketBase — solo el `role` crudo. Se resuelve con una
    // llamada de más al perfil propio (autoservicio, siempre autorizada)
    // para que `RequireAuth`/`SeguridadShell` sepan de entrada si esta
    // cuenta es admin por BRIDGE aunque `record.role` sea "user" (las 6
    // cuentas admin_* de área, no solo el superadmin bootstrap).
    try {
      const perfil = await authApi.miPerfil()
      updateSessionUser({
        rolesAdmin: perfil.roles_admin,
        esAdmin:    resp.record.role === 'admin' || perfil.roles_admin.length > 0,
      })
    } catch {
      // Best-effort: si falla, esAdmin queda undefined y los guards caen al
      // chequeo literal de `role` (comportamiento previo a este fix).
    }
    return getUser() ?? resp.record
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

  // Recuperación de contraseña simulada (change roles-gestion-usuarios): el
  // backend responde siempre genérico, sin revelar si el correo existe.
  recuperarPassword: (email: string) =>
    apiClient.post<{ status: string; mensaje: string }>('/seguridad/auth/recuperar', { email }),

  restablecerPassword: (token: string, nuevaPassword: string) =>
    apiClient.post<{ status: string }>('/seguridad/auth/restablecer', {
      token, nueva_password: nuevaPassword,
    }),

  // Verificación de correo simulada (change p2-descubrimiento-comunidad): el
  // token viaja en la respuesta porque no hay envío real de correo — mismo
  // patrón que la recuperación de contraseña.
  verificarEmail: (token: string) =>
    apiClient.post<{ status: string; email_verificado: boolean }>(
      '/seguridad/auth/verificar-email', { token },
    ),

  reenviarVerificacion: (email: string) =>
    apiClient.post<{ status: string; mensaje: string; token_verificacion?: string }>(
      '/seguridad/auth/reenviar-verificacion', { email },
    ),

  // Exportación de datos personales: devuelve el documento completo para que el
  // navegador lo descargue como archivo.
  misDatos: () =>
    apiClient.get<MisDatos>('/seguridad/perfil/mis-datos'),

  // Baja de cuenta propia: irreversible — invalida sesiones y cancela la
  // suscripción activa. Tras la respuesta, se limpia la sesión local.
  bajaCuenta: async (): Promise<void> => {
    await apiClient.post('/seguridad/perfil/baja', {})
    clearSession()
  },

  miDispositivoId: getDeviceId,
}
