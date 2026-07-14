import { LayoutGrid, BarChart3, Library, ListMusic } from 'lucide-react'
import styles from './AuthPages.module.css'

const FEATURES = [
  { icon: LayoutGrid, title: 'Catálogo completo',    desc: 'Miles de canciones, artistas y géneros para explorar' },
  { icon: BarChart3,  title: 'Analítica avanzada',   desc: 'Tendencias, popularidad y comparativa de artistas' },
  { icon: Library,    title: 'Biblioteca personal',  desc: 'Favoritos, historial y playlists propias, siempre a mano' },
  { icon: ListMusic,  title: 'Reproducción continua', desc: 'Cola de canciones y navegación fluida entre pistas' },
] as const

export function AuthHero() {
  return (
    <div className={styles.hero}>
      <div className={styles.heroGlow} aria-hidden="true" />
      <div className={styles.heroInner}>
        <div className={styles.brand}>
          <img src="/logo.png" alt="" className={styles.brandLogo} width={40} height={40} />
          <span className={styles.brandName}>Tracklytics</span>
        </div>
        <p className={styles.tagline}>// analiza. descubre. escucha.</p>

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
