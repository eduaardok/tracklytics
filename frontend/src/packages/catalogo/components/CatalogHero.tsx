import { useQuery } from '@tanstack/react-query'
import { Disc3, Mic2, Tags } from 'lucide-react'
import { KPICard } from '@shared/components/KPICard'
import { useInView } from '@shared/hooks/useInView'
import { catalogoApi } from '../api/catalogo.api'
import { TrackGridCard } from './TrackGridCard'
import styles from './CatalogHero.module.css'

const COVERS_COUNT   = 10
const FEATURED_COUNT = 4

// Hero de bienvenida de CatalogPage (S16 Fase 3, feria) — lo primero que ve
// cualquier visitante en `/`. Los números y las portadas son reales: KPIs
// desde `GET /catalog/stats` (nuevo, S16 — no existía un endpoint público
// con conteos globales del catálogo hasta ahora) y las portadas/tracks
// destacados desde `tracksTop`, el mismo endpoint que ya usa la pestaña
// Canciones. No se agregó framer-motion (el prompt asumía que ya era
// dependencia del proyecto por `PageTransition.tsx` — falso: ese archivo
// documenta que framer-motion se probó y se REVIRTIÓ por costar +43kB gzip
// en el bundle principal, y `CatalogPage` es import eager, no lazy, así que
// pagaría exactamente ese mismo costo). La entrada usa CSS puro
// (`@keyframes` + `prefers-reduced-motion` ya global en index.css).
export function CatalogHero({ onExplore }: { onExplore: () => void }) {
  const { ref, inView } = useInView<HTMLDivElement>()

  const stats = useQuery({
    queryKey: ['catalog', 'stats'],
    queryFn:  () => catalogoApi.catalogStats(),
    staleTime: 5 * 60_000,
  })

  const covers = useQuery({
    queryKey: ['tracks', 'top', COVERS_COUNT],
    queryFn:  () => catalogoApi.tracksTop(COVERS_COUNT),
    staleTime: 5 * 60_000,
  })

  const tracks       = covers.data?.data ?? []
  const collageTracks = tracks.filter((t) => !!t.imagen_url).slice(0, COVERS_COUNT)
  const featured       = tracks.slice(0, FEATURED_COUNT)

  return (
    <div ref={ref} className={styles.wrap}>
      <section className={styles.hero}>
        <div className={styles.collage} aria-hidden="true">
          {collageTracks.map((t, i) => (
            <img
              key={`${t.fact_id}-${i}`}
              src={t.imagen_url ?? undefined}
              alt=""
              loading="eager"
              className={styles.collageImg}
            />
          ))}
        </div>
        <div className={styles.scrim} />

        <div className={styles.content}>
          <h1 className={styles.headline}>Escucha, descubre y sigue a tus artistas favoritos</h1>
          <p className={styles.sub}>Un catálogo real de más de un millón de canciones — sin límites, sin necesidad de crear cuenta.</p>
          <button type="button" className={styles.cta} onClick={onExplore}>
            Empieza a escuchar
          </button>

          <div className={`${styles.kpiRow} ${inView ? styles.kpiRowIn : ''}`}>
            <KPICard
              title="Canciones"
              value={stats.data?.tracks ?? 0}
              animate={!!stats.data}
              icon={Disc3}
              formatValue={(n) => n.toLocaleString('es')}
            />
            <KPICard
              title="Artistas"
              value={stats.data?.artists ?? 0}
              animate={!!stats.data}
              icon={Mic2}
              formatValue={(n) => n.toLocaleString('es')}
            />
            <KPICard
              title="Géneros"
              value={stats.data?.genres ?? 0}
              animate={!!stats.data}
              icon={Tags}
              formatValue={(n) => n.toLocaleString('es')}
            />
          </div>
        </div>
      </section>

      {featured.length > 0 && (
        <div className={`${styles.featured} ${inView ? styles.featuredIn : ''}`}>
          <span className={styles.featuredLabel}>Escucha ahora</span>
          <div className={styles.featuredGrid}>
            {featured.map((t, i) => (
              <TrackGridCard key={`${t.fact_id}-${t.track_id}`} track={t} queue={featured} index={i} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
