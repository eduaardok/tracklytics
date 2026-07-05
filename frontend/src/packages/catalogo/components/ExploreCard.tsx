import { Music2 } from 'lucide-react'
import { AlbumArt } from '@shared/components/AlbumArt'
import styles from './ExploreCard.module.css'

type Props = {
  kind:   'genero' | 'artista' | 'playlist'
  name:   string
  metric: string
  imagenUrl?: string | null
  onClick: () => void
}

// Card visual de descubrimiento — un solo componente para género, artista y
// playlist (álbum) en vez de tres casi idénticos.
export function ExploreCard({ kind, name, metric, imagenUrl, onClick }: Props) {
  return (
    <button type="button" className={styles.card} onClick={onClick}>
      {kind !== 'genero' ? (
        <AlbumArt src={imagenUrl} alt="" size={44} />
      ) : (
        <span className={styles.genreIcon} aria-hidden="true">
          <Music2 size={20} />
        </span>
      )}
      <span className={styles.meta}>
        <span className={styles.name}>{name}</span>
        <span className={styles.metric}>{metric}</span>
      </span>
    </button>
  )
}
