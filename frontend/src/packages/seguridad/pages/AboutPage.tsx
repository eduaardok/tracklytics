import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
// Import directo, no vía el barrel `@packages/catalogo` (esta página es
// pública/eager, igual que LoginPage — evita depender de todo lo que ese
// barrel decida reexportar a futuro).
import { catalogoApi } from '@packages/catalogo/api/catalogo.api'
import styles from './AboutPage.module.css'

// Hub de marca + selector de persona (pública, sin sesión) — mismo nivel que
// PartnersLandingPage: standalone, sin AppShell, header propio. Antes el
// único punto de entrada público era `/register`, que ya distinguía
// Personal/Empresarial pero no decía nada de artistas ni sellos/
// productoras — invisibles fuera de quien ya conociera la URL de
// `/creadores` o `/partners` de memoria. Modelo de registro por tipo de
// cuenta calcado de Spotify real: un oyente se registra normal, un artista
// reclama/gestiona su perfil desde un flujo separado ligado a su cuenta de
// oyente, y un sello/distribuidora no se autoregistra — entra por una
// relación de partner. Ninguna de las tres rutas es nueva, esta página solo
// las conecta y las explica.
export function AboutPage() {
  useDocumentTitle('Acerca de Tracklytics')

  // Total real del catálogo, no un número fijo en el copy — `tracks/search`
  // sin filtros es público (sin Depends de auth) y ya devuelve `total`,
  // mismo endpoint que usa CatalogPage.
  const tracksQuery = useQuery({
    queryKey: ['catalogo', 'tracks-total'],
    queryFn:  () => catalogoApi.tracksSearch({ limit: 1 }),
    staleTime: 5 * 60_000,
  })
  const totalTracks = tracksQuery.data?.total

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
        <div className={styles.glow} aria-hidden="true" />
        <div className={styles.heroInner}>
          <h1>Música que se entiende, no solo se escucha</h1>
          <p>
            Tracklytics es una plataforma de inteligencia musical: un catálogo{' '}
            {totalTracks != null ? `de ${totalTracks.toLocaleString('es')} tracks` : 'en expansión constante'} para
            oyentes, y la analítica detrás de cada reproducción para artistas, sellos y distribuidoras
            que necesitan decisiones basadas en datos reales, no en corazonadas.
          </p>
        </div>
      </div>

      <section className={styles.section}>
        <h2>Elige tu camino</h2>
        <div className={styles.personaGrid}>
          <div className={styles.personaCard}>
            <span className={styles.personaTag}>OYENTE</span>
            <h3>Escucha y descubre</h3>
            <p className={styles.personaDesc}>
              Catálogo completo, playlists, favoritos e historial. Crea tu cuenta y empieza a
              escuchar en minutos.
            </p>
            <Link to="/register" className={styles.btnPrimary}>Crear cuenta →</Link>
          </div>
          <div className={`${styles.personaCard} ${styles.personaFeatured}`}>
            <span className={styles.personaTag}>ARTISTA</span>
            <h3>Publica tu música</h3>
            <p className={styles.personaDesc}>
              Primero se crea una cuenta de oyente y después se reclama el perfil de artista
              para subir tracks y ver estadísticas — un administrador revisa cada solicitud.
            </p>
            <Link to="/register?tipo=artista" className={styles.btnPrimary}>Registrarme como artista →</Link>
          </div>
          <div className={styles.personaCard}>
            <span className={styles.personaTag}>SELLO · PRODUCTORA · DISTRIBUIDORA</span>
            <h3>Integra nuestro catálogo</h3>
            <p className={styles.personaDesc}>
              No hay autoregistro: trabajamos por relación de partner, con acceso al catálogo
              vía API key segmentada por tier.
            </p>
            <Link to="/partners" className={styles.btnOutlineWide}>Conocer el programa de Partners →</Link>
          </div>
        </div>
      </section>
    </div>
  )
}
