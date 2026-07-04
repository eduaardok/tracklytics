import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { getRole, isAuthenticated } from '@shared/lib/session'

type Props = {
  children: ReactNode
  // Si se define, además de requerir sesión exige que el rol esté en esta lista.
  roles?: string[]
}

export function RequireAuth({ children, roles }: Props) {
  const location = useLocation()

  if (!isAuthenticated()) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (roles && !roles.includes(getRole() ?? '')) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
