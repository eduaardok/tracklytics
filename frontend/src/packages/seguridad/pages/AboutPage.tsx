import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Headphones, Mic2, Building2, BarChart3, Radio } from 'lucide-react'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { useCountUp } from '@shared/hooks/useCountUp'
// Import directo, no vía el barrel `@packages/catalogo` (esta página es
// pública/eager, igual que LoginPage — evita depender de todo lo que ese
// barrel decida reexportar a futuro).
import { catalogoApi } from '@packages/catalogo/api/catalogo.api'
import styles from './AboutPage.module.css'

// Hub de marca + selector de persona (pública, sin sesión) — mismo nivel que
// PartnersLandingPage: standalone, sin AppShell, header propio. Rediseño
// completo (feedback: "se ve muy triste"): hero con identidad visual propia
// (glows en capas + ondas, el mismo motivo del login), banda de estadísticas
// EN VIVO del catálogo (un solo endpoint público `/catalog/stats`, números
// que suben con useCountUp) y las tres personas con icono y hover propio.
export function AboutPage() {
  useDocumentTitle('Acerca de Tracklytics')

  // Contadores reales del catálogo (tracks/artistas/géneros) — mismo
  // endpoint que usa el hero de CatalogPage. Si falla (p. ej. sesión
  // requerida), la banda se oculta entera: nunca números inventados.
  const statsQuery = useQuery({
    queryKey: ['catalogo', 'stats-publicos'],
    queryFn: () => catalogoApi.catalogStats(),
    staleTime: 5 * 60_000,
    retry: false,
  })
  const stats = statsQuery.data
  // Contadores animados — a nivel top SIEMPRE (regla de hooks); `useCountUp`
  // acepta undefined mientras carga y no arranca sin número real.
  const tracksShown  = useCountUp(stats?.tracks)
  const artistsShown = useCountUp(stats?.artists)
  const genresShown  = useCountUp(stats?.genres)

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link to="/" className={styles.brand}>
          <img src="/logo.png" alt="" width={32} height={32} />
          <span>Tracklytics</span>
        </Link>
        <Link to="/login" className={styles.btnOutline}>Ir a la app →</Link>
      </header>

      <div className={styles.hero}>
        <div className={styles.glowA} aria-hidden="true" />
        <div className={styles.glowB} aria-hidden="true" />
        {/* Ondas de marca (mismo motivo del fondo de login) — continuidad
            visual entre la puerta pública y la app. */}
        <svg className={styles.waves} aria-hidden="true" viewBox="0 0 320 90" preserveAspectRatio="xMidYMax slice">
          <g fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 62 Q 40 18 76 62 T 148 62 T 220 62 T 292 62" />
            <path d="M4 80 Q 50 48 96 80 T 188 80 T 280 80" />
          </g>
        </svg>

        <div className={styles.heroInner}>
          <span className={styles.heroEyebrow}>Plataforma de inteligencia musical</span>
          <h1>
            Música que <em>se entiende</em>, no solo se escucha
          </h1>
          <p>
            Un catálogo vivo para oyentes y la analítica detrás de cada reproducción para
            artistas, sellos y distribuidoras que necesitan decisiones basadas en datos
            reales, no en corazonadas.
          </p>

          {stats && (
            <dl className={styles.statsBand} aria-label="Catálogo en cifras">
              <div className={styles.stat}>
                <dt>Canciones</dt>
                <dd>{tracksShown.toLocaleString('es')}</dd>
              </div>
              <div className={styles.statDivider} aria-hidden="true" />
              <div className={styles.stat}>
                <dt>Artistas</dt>
                <dd>{artistsShown.toLocaleString('es')}</dd>
              </div>
              <div className={styles.statDivider} aria-hidden="true" />
              <div className={styles.stat}>
                <dt>Géneros</dt>
                <dd>{genresShown.toLocaleString('es')}</dd>
              </div>
            </dl>
          )}
        </div>
      </div>

      <section className={styles.section}>
        <h2>Elige tu camino</h2>
        <div className={styles.personaGrid}>
          <article className={styles.personaCard}>
            <span className={styles.personaIcon} data-accent="primary" aria-hidden="true"><Headphones size={20} /></span>
            <span className={styles.personaTag}>OYENTE</span>
            <h3>Escucha y descubre</h3>
            <p className={styles.personaDesc}>
              Catálogo completo, playlists, favoritos e historial. Crea tu cuenta y empieza a
              escuchar en minutos.
            </p>
            <Link to="/register" className={styles.btnPrimary}>Crear cuenta →</Link>
          </article>

          <article className={`${styles.personaCard} ${styles.personaFeatured}`}>
            <span className={styles.personaIcon} data-accent="accent" aria-hidden="true"><Mic2 size={20} /></span>
            <span className={styles.personaTag}>ARTISTA</span>
            <h3>Publica tu música</h3>
            <p className={styles.personaDesc}>
              Primero se crea una cuenta de oyente y después se reclama el perfil de artista
              para subir tracks y ver estadísticas — un administrador revisa cada solicitud.
            </p>
            <Link to="/register?tipo=artista" className={styles.btnPrimary}>Registrarme como artista →</Link>
          </article>

          <article className={styles.personaCard}>
            <span className={styles.personaIcon} data-accent="neutral" aria-hidden="true"><Building2 size={20} /></span>
            <span className={styles.personaTag}>SELLO · PRODUCTORA · DISTRIBUIDORA</span>
            <h3>Integra nuestro catálogo</h3>
            <p className={styles.personaDesc}>
              No hay autoregistro: trabajamos por relación de partner, con acceso al catálogo
              vía API key segmentada por tier.
            </p>
            <Link to="/partners" className={styles.btnOutlineWide}>Conocer el programa de Partners →</Link>
          </article>
        </div>
      </section>

      <section className={styles.pillarsSection}>
        <h2>Qué hay detrás</h2>
        <div className={styles.pillarGrid}>
          <div className={styles.pillar}>
            <BarChart3 size={16} aria-hidden="true" />
            <p>Cada reproducción alimenta métricas reales: popularidad, engagement y tendencias por género.</p>
          </div>
          <div className={styles.pillar}>
            <Radio size={16} aria-hidden="true" />
            <p>Recomendaciones y mezclas diarias construidas sobre tu historial, no sobre listados genéricos.</p>
          </div>
          <div className={styles.pillar}>
            <Headphones size={16} aria-hidden="true" />
            <p>Reproductor con cola, radio por track y favoritos sincronizados en tu biblioteca.</p>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <Link to="/register">Crear cuenta</Link>
        <span aria-hidden="true">·</span>
        <Link to="/login">Entrar</Link>
        <span aria-hidden="true">·</span>
        <Link to="/partners">Partners</Link>
      </footer>
    </div>
  )
}
