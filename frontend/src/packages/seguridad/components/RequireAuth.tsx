import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { getUser, isAuthenticated } from '@shared/lib/session'

type Props = {
  children: ReactNode
  // Si se define, además de requerir sesión exige que el rol esté en esta lista.
  roles?: string[]
}

// `roles={['admin']}` (único valor usado en todo el proyecto, ver
// router.tsx) SIEMPRE significa "es alguna clase de administrador" —
// superadmin O cualquiera de los 6 roles de área en
// BRIDGE_USUARIO_ROL_ADMIN — nunca literalmente `record.role === 'admin'`
// de PocketBase (eso solo es cierto para la cuenta superadmin bootstrap).
// Antes de este fix (S14, hallazgo de verificación con Playwright — un
// curl con Bearer token nunca pasa por este guard, así que ninguna
// verificación anterior por curl lo había detectado) las 6 cuentas admin_*
// de demo, con rol asignado solo por BRIDGE, quedaban redirigidas a "/" al
// intentar entrar a /seguridad o /reportes desde el navegador. `esAdmin` se
// resuelve una vez en `authApi.login` (ver session.ts) y viaja en la sesión.
export function RequireAuth({ children, roles }: Props) {
  const location = useLocation()

  if (!isAuthenticated()) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (roles) {
    const user = getUser()
    const tieneAcceso = roles.includes('admin')
      ? user?.role === 'admin' || Boolean(user?.esAdmin)
      : roles.includes(user?.role ?? '')
    if (!tieneAcceso) return <Navigate to="/" replace />
  }

  return <>{children}</>
}
