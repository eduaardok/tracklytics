import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { MonitorX } from 'lucide-react'
import { getUser, isAuthenticated } from '@shared/lib/session'
import { usePlayer } from '@shared/context/PlayerContext'
import { useToast } from '@shared/context/ToastContext'
import { apiErrorMessage } from '@shared/lib/api-client'
import { RoleBadge } from '@shared/components/RoleBadge'
import { authApi } from '../api/auth.api'
import styles from './UserMenu.module.css'

// Único punto de entrada de logout en la UI — sin esto, un usuario autenticado
// no tiene forma de cerrar sesión salvo borrando localStorage a mano.
export function UserMenu() {
  const navigate = useNavigate()
  const { stop } = usePlayer()
  const toast = useToast()
  const [loggingOut, setLoggingOut] = useState(false)
  const [cerrandoOtras, setCerrandoOtras] = useState(false)
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
    // Antes de invalidar la sesión: si algo está sonando (real o el tono
    // simulado), cortarlo — de lo contrario sigue de fondo tras el logout, y
    // si la cola avanza intenta reproducir el siguiente track con un token
    // que el backend ya rechazó.
    stop()
    await authApi.logout()
    navigate('/login', { replace: true })
  }

  // FASE 2 (Prompt 10): acceso rápido, sin pasar por Perfil — confirmación
  // simple (window.confirm) en vez de un modal, mismo criterio que pide el
  // prompt para esta acción puntual.
  async function handleCerrarOtras() {
    if (!window.confirm('¿Cerrar tu sesión en todos los demás dispositivos? Este dispositivo no se verá afectado.')) return
    setCerrandoOtras(true)
    try {
      const res = await authApi.cerrarOtrasSesiones()
      toast.success(res.sesiones_cerradas > 0 ? `${res.sesiones_cerradas} sesión(es) cerrada(s)` : 'No había otras sesiones abiertas')
    } catch (err) {
      toast.error(apiErrorMessage(err, 'No se pudieron cerrar las demás sesiones.'))
    } finally {
      setCerrandoOtras(false)
    }
  }

  return (
    <div className={styles.wrap}>
      <Link to="/perfil" className={styles.identity}>
        <span className={styles.email}>{user.email}</span>
        <RoleBadge user={user} />
      </Link>
      <button
        type="button"
        className={styles.logoutBtn}
        onClick={handleCerrarOtras}
        disabled={cerrandoOtras}
        title="Cerrar sesión en otros dispositivos"
      >
        <MonitorX size={14} aria-hidden="true" />
      </button>
      <button type="button" className={styles.logoutBtn} onClick={handleLogout} disabled={loggingOut}>
        {loggingOut ? 'Saliendo…' : 'Salir'}
      </button>
    </div>
  )
}
