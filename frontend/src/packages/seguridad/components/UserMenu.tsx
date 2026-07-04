import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getUser, isAuthenticated } from '@shared/lib/session'
import { authApi } from '../api/auth.api'
import styles from './UserMenu.module.css'

// Único punto de entrada de logout en la UI — sin esto, un usuario autenticado
// no tiene forma de cerrar sesión salvo borrando localStorage a mano.
export function UserMenu() {
  const navigate = useNavigate()
  const [loggingOut, setLoggingOut] = useState(false)
  const user = getUser()

  if (!isAuthenticated() || !user) {
    return (
      <div className={styles.guest}>
        <Link to="/login" className={styles.link}>Iniciar sesión</Link>
        <Link to="/register" className={`${styles.link} ${styles.linkPrimary}`}>Regístrate</Link>
      </div>
    )
  }

  async function handleLogout() {
    setLoggingOut(true)
    await authApi.logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className={styles.wrap}>
      <Link to="/perfil" className={styles.identity}>
        <span className={styles.email}>{user.email}</span>
        <span className={styles.roleTag}>{user.role}</span>
      </Link>
      <button type="button" className={styles.logoutBtn} onClick={handleLogout} disabled={loggingOut}>
        {loggingOut ? 'Saliendo…' : 'Salir'}
      </button>
    </div>
  )
}
