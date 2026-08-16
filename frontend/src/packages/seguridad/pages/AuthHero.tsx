import { useQuery } from '@tanstack/react-query'
import { LayoutGrid, BarChart3, Library, ListMusic, Disc3 } from 'lucide-react'
// Import directo, no vía el barrel `@packages/catalogo` — AuthHero es pública/
// eager igual que LoginPage, evita depender de todo lo que ese barrel decida
// reexportar a futuro (mismo criterio ya documentado en AboutPage.tsx).
import { catalogoApi } from '@packages/catalogo/api/catalogo.api'
import { AlbumArt } from '@shared/components/AlbumArt'
import styles from './AuthPages.module.css'

const FEATURES = [
  { icon: LayoutGrid, title: 'Catálogo completo',    desc: 'Miles de canciones, artistas y géneros' },
  { icon: BarChart3,  title: 'Analítica avanzada',   desc: 'Tendencias y comparativa de artistas' },
  { icon: Library,    title: 'Biblioteca personal',  desc: 'Favoritos, historial y playlists propias' },
  { icon: ListMusic,  title: 'Reproducción continua', desc: 'Cola y navegación fluida entre pistas' },
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

function fmtPop(n: number): string {
  return n.toLocaleString('es-ES', { maximumFractionDigits: 0 })
}

export function AuthHero() {
  // Total real del catálogo, no un número fijo en el copy — mismo patrón
  // que AboutPage.tsx (`tracks/search` sin filtros es público, ya devuelve
  // `total`).
  const tracksQuery = useQuery({
    queryKey: ['catalogo', 'tracks-total'],
    queryFn:  () => catalogoApi.tracksSearch({ limit: 1 }),
    staleTime: 5 * 60_000,
  })
  const totalTracks = tracksQuery.data?.total

  // Mini-dashboard de datos reales (S16 Fase 4, auditoría §5.4 P4 — la
  // mejora de mayor impacto): reemplaza el collage puramente decorativo por
  // "Top tracks" con portada + nombre + popularidad real, mismo endpoint
  // público que ya usa el catálogo (`/tracks/top`, sin auth — el login es
  // público). Si la API falla, esta sección se omite por completo en vez de
  // inventar filas — el resto del hero (marca, headline, features) es
  // contenido estático que nunca depende de la red, así que el panel nunca
  // queda vacío aunque este bloque puntual no cargue.
  const topTracksQuery = useQuery({
    queryKey: ['catalogo', 'tracks-top-hero'],
    queryFn:  () => catalogoApi.tracksTop(5),
    staleTime: 5 * 60_000,
    retry: 1,
  })
  const topTracks = topTracksQuery.data?.data ?? []

  return (
    <div className={styles.hero}>
      <div className={styles.heroGlow} aria-hidden="true" />
      <div className={styles.heroInner}>
        <div className={styles.brand}>
          <img src="/logo.png" alt="" className={styles.brandLogo} width={48} height={48} />
          <span className={styles.brandName}>Tracklytics</span>
          <MiniEqualizer />
        </div>

        <div>
          <p className={styles.tagline}>// analiza. descubre. escucha.</p>
          <h1 className={styles.headline}>Entiende la música detrás de los números</h1>
        </div>

        {topTracks.length > 0 && (
          <div className={styles.miniDashboard}>
            <span className={styles.miniDashboardLabel}>Top tracks del catálogo</span>
            <ul className={styles.topTracksList}>
              {topTracks.map((t) => (
                <li key={t.fact_id} className={styles.topTrackRow}>
                  <AlbumArt src={t.imagen_url} alt="" size={36} genreSeed={t.genre_name} className={styles.topTrackArt} />
                  <span className={styles.topTrackInfo}>
                    <span className={styles.topTrackName}>{t.track_name}</span>
                    <span className={styles.topTrackArtist}>{t.artist_name}</span>
                  </span>
                  <span className={styles.topTrackPop}>★ {fmtPop(t.popularity)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {totalTracks != null && (
          <div className={styles.statCard}>
            <span className={styles.statIcon} aria-hidden="true"><Disc3 size={22} /></span>
            <span className={styles.statBody}>
              <span className={styles.statNumber}>{totalTracks.toLocaleString('es')}</span>
              <span className={styles.statCaption}>tracks reales, analizados en tiempo real</span>
            </span>
          </div>
        )}

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
