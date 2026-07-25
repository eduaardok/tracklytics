import { Link } from 'react-router-dom'
import { EmptyState } from './EmptyState'
import styles from './NotFoundPage.module.css'

// Catch-all (`path: '*'`) del router raíz. Antes de esto no existía ningún
// `path: '*'` ni `errorElement` en el árbol de rutas — cualquier URL sin
// match (typo, enlace viejo, etc.) caía en el error boundary por defecto de
// react-router-dom en vez de una página real.
export function NotFoundPage() {
  return (
    <div className={styles.page}>
      <EmptyState
        icon="404"
        title="Página no encontrada"
        body="La URL no coincide con ninguna ruta de la aplicación."
      />
      <Link to="/" className={styles.link}>Volver al inicio</Link>
    </div>
  )
}
