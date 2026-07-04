import styles from './RouteLoadingFallback.module.css'

// Fallback de Suspense para rutas con React.lazy (ver /analitica en router.tsx).
// Mismo patrón visual "// cargando…" ya establecido en las páginas
// (CatalogPage, FavoritosTab, EngagementPage, etc.) — no introduce estilo nuevo.
export function RouteLoadingFallback() {
  return <p className={styles.loading}>// cargando…</p>
}
