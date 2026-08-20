import { useQuery } from '@tanstack/react-query'
import { catalogoApi } from '../api/catalogo.api'
import styles from './CatalogHero.module.css'

// Hero de bienvenida de CatalogPage (rediseño "centro de descubrimiento
// musical"): antes ocupaba ~260px con un mosaico de 10 portadas de fondo +
// 3 KPICard grandes — más protagonista que el propio catálogo. El objetivo
// ahora es lo opuesto: introducir la página en un vistazo y dejar paso
// inmediato al contenido musical real (`DiscoveryHome`, justo debajo). Los
// KPIs reales sobreviven como una sola línea de metadata compacta en vez de
// 3 tarjetas — mismo endpoint (`GET /catalog/stats`), ningún dato inventado.
export function CatalogHero({ onExplore }: { onExplore: () => void }) {
  const stats = useQuery({
    queryKey: ['catalog', 'stats'],
    queryFn:  () => catalogoApi.catalogStats(),
    staleTime: 5 * 60_000,
  })

  const s = stats.data

  return (
    <section className={styles.hero}>
      <svg className={styles.ambient} aria-hidden="true" viewBox="0 0 400 120" preserveAspectRatio="xMaxYMid slice">
        <g fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M0 90 Q 30 40 60 90 T 120 90 T 180 90 T 240 90 T 300 90 T 360 90 T 420 90" />
        </g>
        <g fill="currentColor">
          <circle cx="60" cy="90" r="3" />
          <circle cx="180" cy="90" r="3" />
          <circle cx="300" cy="90" r="3" />
        </g>
      </svg>

      <div className={styles.content}>
        <div className={styles.text}>
          <h1 className={styles.headline}>Descubre música. Entiende sus datos.</h1>
          <p className={styles.sub}>Explora canciones, artistas, géneros y playlists de Tracklytics.</p>
        </div>

        {s && (
          <p className={styles.stats}>
            {s.tracks.toLocaleString('es')}+ canciones · {s.artists.toLocaleString('es')}+ artistas · {s.genres.toLocaleString('es')} géneros
          </p>
        )}

        <button type="button" className={styles.cta} onClick={onExplore}>
          Empieza a escuchar
        </button>
      </div>
    </section>
  )
}
