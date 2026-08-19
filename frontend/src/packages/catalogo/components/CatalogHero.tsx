import { useQuery } from '@tanstack/react-query'
import { Disc3, Mic2, Tags } from 'lucide-react'
import { KPICard } from '@shared/components/KPICard'
import { useInView } from '@shared/hooks/useInView'
import { catalogoApi } from '../api/catalogo.api'
import styles from './CatalogHero.module.css'

const COVERS_COUNT = 10

// Hero de bienvenida de CatalogPage (S16 Fase 3, feria) — lo primero que ve
// cualquier visitante en `/`. Los números y las portadas son reales: KPIs
// desde `GET /catalog/stats` (S16 Fase 3 — endpoint público con conteos
// globales del catálogo) y el collage de portadas desde `tracksTop`, el
// mismo endpoint que ya usa la pestaña Canciones. No se agregó framer-motion
// (ver AuthHero.tsx para el mismo hallazgo en el hero de login): la entrada
// usa CSS puro (`@keyframes` + `prefers-reduced-motion` ya global en
// index.css). S16 Fase 6 (recorte de feria): se retiró el bloque inferior
// "Escucha ahora" (4 TrackGridCard reproducibles) — quedaba redundante con
// la propia pestaña Canciones justo debajo del hero, y competía con los
// KPIs por atención. El collage de fondo NO se toca: sigue viniendo de la
// misma query `covers`.
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

  const tracks        = covers.data?.data ?? []
  const collageTracks = tracks.filter((t) => !!t.imagen_url).slice(0, COVERS_COUNT)

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
    </div>
  )
}
