import { getUser } from '@shared/lib/session'
import styles from './ProfilePage.module.css'

function fmtDate(iso: string | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso.replace(' ', 'T'))
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })
}

const ROLE_LABEL: Record<string, string> = {
  user:    'Cliente B2C',
  analyst: 'Cliente B2B',
  admin:   'Staff interno',
}

// Vista mínima de cuenta — no existía ninguna página de perfil en React
// (UserMenu solo mostraba email/rol/logout). Alcance deliberadamente de solo
// lectura: el backend de seguridad (api/paquetes/seguridad/router.py) no
// expone ningún endpoint de cambio de contraseña hoy — no se inventa uno
// nuevo, se documenta la ausencia en vez de un botón que no haría nada.
export function ProfilePage() {
  const user = getUser()

  if (!user) return null

  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>Mi perfil</h1>
      <span className={styles.subtitle}>// datos de tu cuenta</span>

      <dl className={styles.kv}>
        <dt className={styles.kvLabel}>Email</dt>
        <dd className={styles.kvValue}>{user.email}</dd>

        <dt className={styles.kvLabel}>Tipo de cuenta</dt>
        <dd className={styles.kvValue}>{ROLE_LABEL[user.role] ?? user.role}</dd>

        <dt className={styles.kvLabel}>Miembro desde</dt>
        <dd className={styles.kvValue}>{fmtDate(user.created)}</dd>

        {user.pais && (
          <>
            <dt className={styles.kvLabel}>País</dt>
            <dd className={styles.kvValue}>{user.pais}</dd>
          </>
        )}
      </dl>

      <p className={styles.note}>
        El cambio de contraseña todavía no está disponible — el backend no expone ese endpoint.
      </p>
    </section>
  )
}
