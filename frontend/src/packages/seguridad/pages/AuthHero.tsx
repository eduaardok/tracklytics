import styles from './AuthPages.module.css'

const FEATURES = [
  { title: 'Catálogo completo', desc: 'Miles de canciones, artistas y géneros para explorar' },
  { title: 'Analítica avanzada', desc: 'Tendencias, popularidad y comparativa de artistas' },
  { title: 'Biblioteca personal', desc: 'Favoritos, historial y playlists propias, siempre a mano' },
  { title: 'Reproducción continua', desc: 'Cola de canciones y navegación fluida entre pistas' },
] as const

export function AuthHero() {
  return (
    <div className={styles.hero}>
      <div className={styles.brand}>
        <img src="/logo.png" alt="" className={styles.brandLogo} width={40} height={40} />
        <span className={styles.brandName}>Tracklytics</span>
      </div>
      <p className={styles.tagline}>// analiza. descubre. escucha.</p>

      <ul className={styles.features}>
        {FEATURES.map((f) => (
          <li key={f.title} className={styles.feature}>
            <span className={styles.featureTitle}>{f.title}</span>
            <span className={styles.featureDesc}>{f.desc}</span>
          </li>
        ))}
      </ul>

      <div className={styles.techs}>
        <span className={styles.techTag}>PocketBase</span>
        <span className={styles.techTag}>ClickHouse</span>
        <span className={styles.techTag}>FastAPI</span>
      </div>
    </div>
  )
}
