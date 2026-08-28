import { genreGradient } from '@shared/lib/genre-colors'
import { AlbumArt } from '@shared/components/AlbumArt'
import styles from './PlaylistCollage.module.css'

type Props = {
  // Hasta 4 portadas YA resueltas por el backend (`Album.portada_urls`,
  // `/albums/search` — ver `ALBUM_COVERS_BATCH`). Nunca dispara un request
  // propio: antes esta card pedía su propia `GET /tracks/by-album/:id` al
  // montar y, con ~12 cards en la rail "Playlists" a la vez, eso saturaba
  // las conexiones concurrentes del navegador (bug real, confirmado
  // navegando: dejaba en cola cualquier otro request en vuelo, incluido un
  // logout). Mismo contrato que `@shared/components/PlaylistCollage`
  // (playlists propias del usuario), que ya resolvía esto server-side.
  portadaUrls: string[]
  // Nombre de la playlist — semilla del gradiente determinista para las
  // celdas que quedan vacías (mismo criterio que el fallback de AlbumArt).
  seed: string
  size: number
}

// Collage 2×2 con las portadas de los tracks de la playlist (feedback de
// usuario: playlists sin portada propia se veían vacías — solo el icono ♪).
// Solo se usa cuando NO hay imagen a nivel playlist.
export function PlaylistCollage({ portadaUrls, seed, size }: Props) {
  const covers = portadaUrls.slice(0, 4)
  const cells = [0, 1, 2, 3]

  return (
    <div className={styles.collage} style={{ width: size, height: size }} aria-hidden="true">
      {covers.length === 0 ? (
        <span className={`${styles.empty} ${styles.cell}`} style={{ background: genreGradient(seed) }}>
          ♪
        </span>
      ) : (
        cells.map((i) =>
          covers[i] ? (
            <AlbumArt key={i} src={covers[i]} alt="" size={Math.ceil(size / 2)} className={styles.cell} />
          ) : (
            <span key={i} className={`${styles.tint} ${styles.cell}`} style={{ background: genreGradient(seed) }} />
          )
        )
      )}
    </div>
  )
}
