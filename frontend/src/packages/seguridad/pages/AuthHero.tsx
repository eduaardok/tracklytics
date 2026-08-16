import { useQuery } from '@tanstack/react-query'
import { LayoutGrid, BarChart3, Library, ListMusic, Disc3, Layers } from 'lucide-react'
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

function fmtDecimal(n: number): string {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
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

  // Segunda visualización real (S15-P07, FASE 3): `/genres` es público (sin
  // auth) y ya trae `avg_popularity` real por género — no existe ningún
  // endpoint público de crecimiento/tendencia agregada en este backend (se
  // confirmó inspeccionando `queries.py`/`router.py` antes de escribir esto),
  // así que el segundo módulo es "popularidad por género" en vez de un
  // sparkline de tendencia inventado. También alimenta el conteo real de
  // géneros del bloque de estadísticas (ver `stats` abajo) — sin `/artists`
  // con total real ni endpoint de variación semanal, esos dos quedan fuera
  // del bloque de estadísticas en vez de mockearse.
  const genresQuery = useQuery({
    queryKey: ['catalogo', 'genres-hero'],
    queryFn:  () => catalogoApi.genresList(),
    staleTime: 5 * 60_000,
    retry: 1,
  })
  const allGenres   = genresQuery.data?.data ?? []
  const totalGenres = genresQuery.data ? allGenres.length : undefined
  const topGenres   = [...allGenres]
    .sort((a, b) => (b.avg_popularity ?? 0) - (a.avg_popularity ?? 0))
    .slice(0, 5)
  const maxGenrePop = topGenres.reduce((max, g) => Math.max(max, g.avg_popularity ?? 0), 0)

  const stats = [
    totalTracks != null && { key: 'tracks', Icon: Disc3, number: totalTracks.toLocaleString('es'), caption: 'tracks reales, analizados en tiempo real' },
    totalGenres != null && { key: 'genres', Icon: Layers, number: totalGenres.toLocaleString('es'), caption: 'géneros catalogados' },
  ].filter((s): s is { key: string; Icon: typeof Disc3; number: string; caption: string } => s !== false)

  return (
    <div className={styles.hero}>
      <div className={styles.heroGlow} aria-hidden="true" />
      {/* Elemento visual sutil de audio (S15-P07, FASE 6) — nodos conectados
          en muy baja opacidad, puramente decorativo, extiende `.heroGlow` en
          la esquina que antes quedaba vacía sin competir con los módulos de
          datos reales de arriba. */}
      <svg className={styles.heroAmbient} aria-hidden="true" viewBox="0 0 320 220" preserveAspectRatio="xMinYMax meet">
        <g fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M4 190 Q 40 120 76 190 T 148 190 T 220 190 T 292 190" />
          <path d="M4 210 Q 50 160 96 210 T 188 210 T 280 210" />
        </g>
        <g fill="currentColor">
          <circle cx="76" cy="190" r="3.5" />
          <circle cx="148" cy="190" r="3.5" />
          <circle cx="220" cy="190" r="3.5" />
          <circle cx="96" cy="210" r="3" />
          <circle cx="188" cy="210" r="3" />
        </g>
      </svg>
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

        {/* Grilla de módulos de tamaños distintos (S15-P07, FASE 1) — Top
            Tracks es el módulo grande (izquierda, más contenido), géneros es
            el módulo pequeño que rompe la verticalidad, y stats/features
            comparten la fila de soporte. Cada módulo se omite por completo
            si su fuente de datos no cargó, nunca se rellena con placeholders. */}
        <div className={styles.dashboardGrid}>
          {topTracks.length > 0 && (
            <div className={`${styles.module} ${styles.moduleTopTracks}`}>
              <span className={styles.moduleLabel}>Top tracks del catálogo</span>
              <ul className={styles.topTracksList}>
                {topTracks.map((t) => (
                  <li key={t.fact_id} className={styles.topTrackRow}>
                    <AlbumArt src={t.imagen_url} alt="" size={36} genreSeed={t.genre_name} className={styles.topTrackArt} />
                    <span className={styles.topTrackInfo}>
                      <span className={styles.topTrackName}>{t.track_name}</span>
                      <span className={styles.topTrackArtist}>{t.artist_name}</span>
                    </span>
                    <span className={styles.topTrackMeta}>
                      <span className={styles.topTrackPop}>★ {fmtPop(t.popularity)}</span>
                      <span className={styles.miniBarTrack} aria-hidden="true">
                        <span className={styles.barFill} style={{ width: `${t.popularity}%` }} />
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {topGenres.length > 0 && (
            <div className={`${styles.module} ${styles.moduleGenres}`}>
              <span className={styles.moduleLabel}>Popularidad por género</span>
              <ul className={styles.genreBarList}>
                {topGenres.map((g) => (
                  <li key={g.genre_id} className={styles.genreBarRow}>
                    <span className={styles.genreBarName}>{g.name}</span>
                    <span className={styles.genreBarTrack} aria-hidden="true">
                      <span
                        className={styles.barFill}
                        style={{ width: `${maxGenrePop > 0 ? ((g.avg_popularity ?? 0) / maxGenrePop) * 100 : 0}%` }}
                      />
                    </span>
                    <span className={styles.genreBarValue}>{fmtDecimal(g.avg_popularity ?? 0)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <ul className={`${styles.module} ${styles.moduleFeatures}`}>
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

          {stats.length > 0 && (
            <div className={`${styles.module} ${styles.moduleStats}`}>
              {stats.map((s) => (
                <div key={s.key} className={styles.statItem}>
                  <span className={styles.statIcon} aria-hidden="true"><s.Icon size={18} /></span>
                  <span className={styles.statBody}>
                    <span className={styles.statNumber}>{s.number}</span>
                    <span className={styles.statCaption}>{s.caption}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles.techs}>
          <span className={styles.techTag}>Para sellos y productoras</span>
          <span className={styles.techTag}>Para curadores y artistas</span>
        </div>
      </div>
    </div>
  )
}
