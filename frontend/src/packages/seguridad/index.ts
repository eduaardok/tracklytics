// Public API del paquete seguridad.
// Regla de aislamiento: otros paquetes solo pueden importar desde aquí.
// Nunca importar directamente de components/, pages/, o api/ internos.

export { PermisosPage }  from './pages/PermisosPage'
export { UsuariosAdminPage } from './pages/UsuariosAdminPage'
export { AuditoriaPage } from './pages/AuditoriaPage'
export { ErroresPage }   from './pages/ErroresPage'
export { LoginPage }     from './pages/LoginPage'
export { RegisterPage }  from './pages/RegisterPage'
export { ProfilePage }   from './pages/ProfilePage'
export { seguridadApi }  from './api/seguridad.api'
export { authApi }       from './api/auth.api'
export { RequireAuth }   from './components/RequireAuth'
export { UserMenu }      from './components/UserMenu'
export type { Permiso, AuditLogEntry, ErrorSistemaEntry, AsignarPermisoBody } from './types'
export type { RolAutoRegistrable } from './api/auth.api'
