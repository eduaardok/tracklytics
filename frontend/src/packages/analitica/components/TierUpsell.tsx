import { Link } from 'react-router-dom'
import { nombreTier } from '../lib/tierError'
import styles from './TierUpsell.module.css'

type Props = { tierRequerido: string; tierActual: string }

// Reemplaza el 403 genérico cuando el motivo es tier insuficiente (no falta
// de suscripción): el cliente ya tiene un plan activo, así que se le informa
// qué panel desbloquea el upgrade, sin un redirect forzado (a diferencia de
// RequireSuscripcionActiva, que sí redirige cuando no hay ninguna
// suscripción activa — ver design.md, decisión 4).
export function TierUpsell({ tierRequerido, tierActual }: Props) {
  return (
    <div className={styles.card}>
      <span className={styles.badge}>Plan {nombreTier(tierActual)}</span>
      <p className={styles.message}>
        Este panel está disponible desde el plan <strong>{nombreTier(tierRequerido)}</strong>.
      </p>
      <p className={styles.sub}>Actualiza tu suscripción para desbloquearlo.</p>
      <Link to="/suscripciones" className={styles.cta}>Ver planes</Link>
    </div>
  )
}
