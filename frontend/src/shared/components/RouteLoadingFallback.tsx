import { SkeletonLoader } from './SkeletonLoader'
import styles from './RouteLoadingFallback.module.css'

// Fallback de Suspense para rutas con React.lazy (ver /analitica y /seguridad
// en router.tsx) — antes solo mostraba el texto "// cargando…"; con
// SkeletonLoader (S13 polish visual) se percibe la forma de la página que
// está por llegar en vez de un placeholder de texto plano.
export function RouteLoadingFallback() {
  return (
    <div className={styles.loading}>
      <SkeletonLoader count={4} height={16} />
    </div>
  )
}
