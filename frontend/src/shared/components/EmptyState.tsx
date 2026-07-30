import type { ReactNode } from 'react'
import styles from './EmptyState.module.css'

type Props = {
  icon:         ReactNode
  title:        string
  body?:        ReactNode
  // Acción opcional (S13 polish visual) — ej. "Limpiar filtros" en una
  // búsqueda sin resultados o "Crear el primero" en un listado vacío.
  actionLabel?: string
  onAction?:    () => void
}

// Mismo patrón "icono + título + cuerpo (+ acción opcional)" que ya usaban
// HistorialTab/FavoritosTab/PlaylistsTab (catalogo), TrackSocialPage,
// TicketsAdminPage, etc. — consolidado en un solo componente en vez de
// repetir el mismo layout en cada `.module.css`.
export function EmptyState({ icon, title, body, actionLabel, onAction }: Props) {
  return (
    <div className={styles.empty}>
      <span className={styles.icon} aria-hidden="true">{icon}</span>
      <p className={styles.title}>{title}</p>
      {body && <p className={styles.body}>{body}</p>}
      {actionLabel && onAction && (
        <button type="button" className={styles.action} onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  )
}
