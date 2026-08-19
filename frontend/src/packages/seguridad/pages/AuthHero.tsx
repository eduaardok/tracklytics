import { useQuery } from '@tanstack/react-query'
// Import directo, no vía el barrel `@packages/catalogo` — AuthHero es pública/
// eager igual que LoginPage, evita depender de todo lo que ese barrel decida
// reexportar a futuro (mismo criterio ya documentado en AboutPage.tsx).
import { catalogoApi } from '@packages/catalogo/api/catalogo.api'
import styles from './AuthPages.module.css'

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

// Hero de login/register (S16 Fase 5 — recorte de feria): reemplaza el
// mini-dashboard de 4 módulos (top tracks, popularidad por género, features,
// stats) por un solo dato real fuerte, protagonista, y la marca. El
// mini-dashboard anterior competía con el headline por atención y tardaba
// más de 2-3s en "leerse" — regla de esta pasada: quitar cosas y hacer más
// grande lo que sí importa. `totalTracks` es el único query que sobrevive
// (mismo endpoint público que ya usaba, `tracks/search` sin filtros trae el
// conteo real del catálogo) — se omite el bloque entero si todavía no
// resolvió, nunca se fuerza un placeholder.
export function AuthHero() {
  const tracksQuery = useQuery({
    queryKey: ['catalogo', 'tracks-total'],
    queryFn:  () => catalogoApi.tracksSearch({ limit: 1 }),
    staleTime: 5 * 60_000,
  })
  const totalTracks = tracksQuery.data?.total

  return (
    <div className={styles.hero}>
      <div className={styles.heroGlow} aria-hidden="true" />
      {/* Elemento visual sutil de audio (S15-P07, FASE 6) — nodos conectados
          en muy baja opacidad, puramente decorativo. Con el hero ya
          simplificado, sigue extendiendo el ambiente de marca sin competir
          con el contenido (que ahora es aún más liviano que antes). */}
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
          <span className={styles.brandLogoRing}>
            <img src="/logo.png" alt="" className={styles.brandLogo} width={56} height={56} />
          </span>
          <span className={styles.brandName}>Tracklytics</span>
          <MiniEqualizer />
        </div>

        <div>
          <p className={styles.tagline}>// analiza. descubre. escucha.</p>
          <h1 className={styles.headline}>Entiende la música detrás de los números</h1>
        </div>

        <div className={styles.techs}>
          <span className={styles.techTag}>Para sellos y productoras</span>
          <span className={styles.techTag}>Para curadores y artistas</span>
        </div>

        {totalTracks != null && (
          <div className={styles.heroStat}>
            <span className={styles.heroStatNumber}>{totalTracks.toLocaleString('es')}</span>
            <span className={styles.heroStatCaption}>tracks reales, analizados en tiempo real</span>
          </div>
        )}
      </div>
    </div>
  )
}
