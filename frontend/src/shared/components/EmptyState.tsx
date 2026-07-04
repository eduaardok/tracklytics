import type { ReactNode } from 'react'
import styles from './EmptyState.module.css'

type Props = {
  icon:  ReactNode
  title: string
  body?: ReactNode
}

// Mismo patrón "icono + título + cuerpo" que ya usaban HistorialTab/
// FavoritosTab/PlaylistsTab (catalogo), TrackSocialPage, TicketsAdminPage,
// etc. — consolidado en un solo componente en vez de repetir el mismo layout
// en cada `.module.css`.
export function EmptyState({ icon, title, body }: Props) {
  return (
    <div className={styles.empty}>
      <span className={styles.icon} aria-hidden="true">{icon}</span>
      <p className={styles.title}>{title}</p>
      {body && <p className={styles.body}>{body}</p>}
    </div>
  )
}
