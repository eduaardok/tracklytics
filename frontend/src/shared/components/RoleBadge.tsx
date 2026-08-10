import { rolesDeUsuario, ROL_LABELS, ROL_COLORS } from '@shared/lib/roles'
import type { SessionUser } from '@shared/lib/session'
import styles from './RoleBadge.module.css'

// Badge de rol (Fase 4.3, S14-FINAL) — un color por rol para que un
// evaluador vea de un vistazo, en el header/sidebar, cuál de las 7 cuentas
// demo tiene activa. Prioriza el primer rol administrativo de área/
// superadmin; cae a `role` crudo de PocketBase (analyst/user) si no hay
// ninguno — mismo orden que `landingPostLogin`.
export function RoleBadge({ user }: { user: SessionUser | null }) {
  if (!user) return null
  const roles = rolesDeUsuario(user)
  const rol = roles[0] ?? user.role
  const label = ROL_LABELS[rol] ?? rol
  const color = ROL_COLORS[rol] ?? 'var(--color-muted)'

  return (
    <span className={styles.badge} style={{ color, borderColor: color }}>
      {label}
    </span>
  )
}
