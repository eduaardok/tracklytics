import { useQuery } from '@tanstack/react-query'
import { catalogoApi } from '../api/catalogo.api'
import { genreGradient } from '@shared/lib/genre-colors'
import { AlbumArt } from '@shared/components/AlbumArt'
import styles from './PlaylistCollage.module.css'

type Props = {
  albumId: number
  // Nombre de la playlist — semilla del gradiente determinista para las
  // celdas que quedan vacías (mismo criterio que el fallback de AlbumArt).
  seed: string
  size: number
}

// Collage 2×2 con las portadas de los tracks de la playlist (feedback de
// usuario: playlists sin portada propia se veían vacías — solo el icono ♪).
// Solo se usa cuando NO hay imagen a nivel playlist; la query por card es
// liviana (limit 4, índice por álbum) y queda cacheada con staleTime alto
// porque las portadas no cambian en caliente.
export function PlaylistCollage({ albumId, seed, size }: Props) {
  const { data } = useQuery({
    queryKey: ['album', albumId, 'collage'],
    queryFn: () => catalogoApi.tracksByAlbum(albumId, 4),
    staleTime: 30 * 60_000,
  })

  const covers = (data?.data ?? [])
    .map((t) => t.imagen_url)
    .filter((src): src is string => !!src)

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
