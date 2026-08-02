import { Music2 } from 'lucide-react'
import { AlbumArt } from '@shared/components/AlbumArt'
import { genreAccent } from '@shared/lib/genre-colors'
import styles from './ExploreGridCard.module.css'

type Props = {
  kind:   'genero' | 'artista' | 'playlist'
  name:   string
  metric: string
  imagenUrl?: string | null
  onClick: () => void
}

// Vista de grid de artistas/playlists(álbumes)/géneros (S13-P6) — portada
// prominente arriba, nombre/métrica debajo, mismo patrón visual que
// TrackGridCard (catálogo de canciones). Antes Artistas/Playlists/Géneros
// solo tenían la card compacta de `ExploreRow` (icono de 44px + texto) sin
// alternativa de grid — la auditoría la calificó de "presentación inferior".
export function ExploreGridCard({ kind, name, metric, imagenUrl, onClick }: Props) {
  return (
    <div className={styles.card} onClick={onClick} onKeyDown={(e) => e.key === 'Enter' && onClick()} role="button" tabIndex={0}>
      <div className={styles.artWrap}>
        {kind !== 'genero' ? (
          <AlbumArt src={imagenUrl} alt="" size={160} className={styles.art} />
        ) : (
          <span
            className={styles.genreArt}
            aria-hidden="true"
            style={{
              backgroundImage: imagenUrl
                ? `linear-gradient(${genreAccent(name, 0.65)}, ${genreAccent(name, 0.65)}), url(${imagenUrl})`
                : undefined,
              backgroundColor: imagenUrl ? undefined : genreAccent(name),
            }}
          >
            {!imagenUrl && <Music2 size={32} />}
          </span>
        )}
      </div>
      <div className={styles.info}>
        <p className={styles.name} title={name}>{name}</p>
        <p className={styles.metric} title={metric}>{metric}</p>
      </div>
    </div>
  )
}
