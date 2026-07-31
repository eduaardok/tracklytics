import { genreGradient } from '@shared/lib/genre-colors'
import styles from './PlaylistCollage.module.css'

type Props = {
  playlistId:   string
  portadaUrls:  string[]
  size?:        number
}

// Portada compuesta de playlist de usuario (S14-P1): las playlists no tienen
// artista/álbum fijo, así que no hay una portada "real" que buscar en
// iTunes/Deezer para ellas — se arma un collage 2x2 con hasta 4 portadas YA
// resueltas de sus primeras canciones (sin requests nuevos, `portada_urls`
// viene calculado del backend a partir de `FACT_TRACKS.imagen_url`). Con
// menos de 4 (o ninguna), gradiente determinista por `playlist_id` — mismo
// hash genérico que ya usa el catálogo para género/artista, solo con una
// semilla distinta.
export function PlaylistCollage({ playlistId, portadaUrls, size = 160 }: Props) {
  if (portadaUrls.length === 0) {
    return (
      <span
        className={`${styles.collage} ${styles.gradient}`}
        style={{ width: size, height: size, background: genreGradient(playlistId) }}
        aria-hidden="true"
      >
        <span className={styles.gradientIcon}>♪</span>
      </span>
    )
  }

  return (
    <span className={styles.collage} style={{ width: size, height: size }} aria-hidden="true">
      {portadaUrls.slice(0, 4).map((url, i) => (
        <img key={i} src={url} alt="" className={styles.cell} loading="lazy" />
      ))}
    </span>
  )
}
