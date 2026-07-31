import { Music2 } from 'lucide-react'
import { AlbumArt } from '@shared/components/AlbumArt'
import { genreAccent } from '@shared/lib/genre-colors'
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
        // S14-P1: color por género (genreAccent) — antes este ícono era un
        // gradiente de marca fijo, igual para los 114 géneros; el color por
        // género ya existía en el sistema (chips de filtro de CatalogPage),
        // solo no había llegado a esta card. Si hay portada representativa
        // (track más popular del género ya resuelto), se muestra de fondo
        // con el color encima al 65% — se mantiene la identidad visual por
        // color sin perderla detrás de la imagen.
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
          {!imagenUrl && <Music2 size={20} />}
        </span>
      )}
      <span className={styles.meta}>
        <span className={styles.name}>{name}</span>
        <span className={styles.metric}>{metric}</span>
      </span>
    </button>
  )
}
