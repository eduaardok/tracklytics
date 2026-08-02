import { useQuery } from '@tanstack/react-query'
import { LayoutGrid, BarChart3, Library, ListMusic } from 'lucide-react'
// Import directo, no vía el barrel `@packages/catalogo` — AuthHero es pública/
// eager igual que LoginPage, evita depender de todo lo que ese barrel decida
// reexportar a futuro (mismo criterio ya documentado en AboutPage.tsx).
import { catalogoApi } from '@packages/catalogo/api/catalogo.api'
import styles from './AuthPages.module.css'

const FEATURES = [
  { icon: LayoutGrid, title: 'Catálogo completo',    desc: 'Miles de canciones, artistas y géneros para explorar' },
  { icon: BarChart3,  title: 'Analítica avanzada',   desc: 'Tendencias, popularidad y comparativa de artistas' },
  { icon: Library,    title: 'Biblioteca personal',  desc: 'Favoritos, historial y playlists propias, siempre a mano' },
  { icon: ListMusic,  title: 'Reproducción continua', desc: 'Cola de canciones y navegación fluida entre pistas' },
] as const

// Barras de ecualizador puramente decorativas (mismo motivo visual que
// PlayerBar.module.css `.eq`/`.eqBar`, no extraído a componente compartido
// porque este es el único uso fuera del reproductor real) — señal ambiente
// de "esto es música, esto está vivo" junto a la marca, en vez de un logo
// estático flotando solo en el panel.
function MiniEqualizer() {
  return (
    <span className={styles.miniEq} aria-hidden="true">
      <span className={styles.miniEqBar} />
      <span className={styles.miniEqBar} />
      <span className={styles.miniEqBar} />
      <span className={styles.miniEqBar} />
    </span>
  )
}

export function AuthHero() {
  // Total real del catálogo, no un número fijo en el copy — mismo patrón
  // que AboutPage.tsx (`tracks/search` sin filtros es público, ya devuelve
  // `total`). Sin esto el panel de marca era solo logo + tagline + lista de
  // features, con mucho espacio vacío alrededor en viewports altos.
  const tracksQuery = useQuery({
    queryKey: ['catalogo', 'tracks-total'],
    queryFn:  () => catalogoApi.tracksSearch({ limit: 1 }),
    staleTime: 5 * 60_000,
  })
  const totalTracks = tracksQuery.data?.total

  return (
    <div className={styles.hero}>
      <div className={styles.heroGlow} aria-hidden="true" />
      <div className={styles.heroInner}>
        <div className={styles.brand}>
          <img src="/logo.png" alt="" className={styles.brandLogo} width={40} height={40} />
          <span className={styles.brandName}>Tracklytics</span>
          <MiniEqualizer />
        </div>
        <p className={styles.tagline}>// analiza. descubre. escucha.</p>
        <p className={styles.statLine}>
          {totalTracks != null
            ? <><span className={styles.statNumber}>{totalTracks.toLocaleString('es')}</span> tracks reales, analizados en tiempo real.</>
            : 'Un catálogo en expansión constante, analizado en tiempo real.'}
        </p>

        <ul className={styles.features}>
          {FEATURES.map((f) => (
            <li key={f.title} className={styles.feature}>
              <span className={styles.featureIcon} aria-hidden="true">
                <f.icon size={18} />
              </span>
              <span className={styles.featureText}>
                <span className={styles.featureTitle}>{f.title}</span>
                <span className={styles.featureDesc}>{f.desc}</span>
              </span>
            </li>
          ))}
        </ul>

        <div className={styles.techs}>
          <span className={styles.techTag}>Para sellos y productoras</span>
          <span className={styles.techTag}>Para curadores y artistas</span>
        </div>
      </div>
    </div>
  )
}
