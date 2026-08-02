import { Music2 } from 'lucide-react'
import { AlbumArt } from '@shared/components/AlbumArt'
import { genreAccent } from '@shared/lib/genre-colors'
import styles from './ExploreRow.module.css'

type Props = {
  kind:   'genero' | 'artista' | 'playlist'
  name:   string
  metric: string
  imagenUrl?: string | null
  onClick: () => void
}

// Vista de lista de artistas/playlists(álbumes)/géneros (S13-P6) — mismo
// componente parametrizado por `kind` que ya usaba la card de grid
// (`ExploreGridCard`), análogo a TrackCard/TrackGridCard para tracks:
// un solo par de componentes cubre las 3 secciones en vez de 6 (Card+Row
// por cada una de las 3 entidades).
export function ExploreRow({ kind, name, metric, imagenUrl, onClick }: Props) {
  return (
    <div className={styles.row} onClick={onClick} onKeyDown={(e) => e.key === 'Enter' && onClick()} role="button" tabIndex={0}>
      {kind !== 'genero' ? (
        <AlbumArt src={imagenUrl} alt="" size={48} />
      ) : (
        <span
          className={styles.genreIcon}
          aria-hidden="true"
          style={{
            backgroundImage: imagenUrl
              ? `linear-gradient(${genreAccent(name, 0.65)}, ${genreAccent(name, 0.65)}), url(${imagenUrl})`
              : undefined,
            backgroundColor: imagenUrl ? undefined : genreAccent(name),
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          {!imagenUrl && <Music2 size={18} />}
        </span>
      )}
      <span className={styles.name}>{name}</span>
      <span className={styles.metric}>{metric}</span>
    </div>
  )
}
