import { Link } from 'react-router-dom'
import styles from './ArtistaHubTabs.module.css'

export type ArtistaHubVista = 'musica' | 'analitica' | 'comentarios' | 'ganancias'

// F2 (auditoría de lógica y flujos): la experiencia del artista vivía
// repartida en tres módulos sin puentes — /creadores (subir/gestionar),
// los comentarios por track en /social/track/:factId y el dinero en
// /regalias/ganancias. Este hub no mueve backend ni duplica UI: agrupa las
// rutas que YA existían bajo una misma barra de pestañas, siguiendo el
// patrón de las pestañas artista/sello de MisGananciasPage.
// S16-P9 (R2): "Analítica" se suma como vista propia del hub — panel de
// engagement real sobre tracks promovidos (endpoint nuevo mi-analitica).
const TABS: { key: ArtistaHubVista; label: string; to: string }[] = [
  { key: 'musica',      label: 'Música',      to: '/creadores' },
  { key: 'analitica',   label: 'Analítica',   to: '/creadores?vista=analitica' },
  { key: 'comentarios', label: 'Comentarios', to: '/creadores?vista=comentarios' },
  { key: 'ganancias',   label: 'Ganancias',   to: '/regalias/ganancias' },
]

export function ArtistaHubTabs({ activa }: { activa: ArtistaHubVista }) {
  return (
    <div className={styles.tabBar} role="tablist" aria-label="Secciones de tu cuenta de artista">
      {TABS.map((t) => (
        <Link
          key={t.key}
          to={t.to}
          role="tab"
          aria-selected={activa === t.key}
          className={`${styles.tab} ${activa === t.key ? styles.tabActive : ''}`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  )
}
