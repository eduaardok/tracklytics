import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { catalogoApi } from '../api/catalogo.api'
import { TrackCard } from '../components/TrackCard'
import { ErrorState } from '@shared/components/ErrorState'
import { ApiError } from '@shared/lib/api-client'
import type { Track } from '../types'
import styles from './DetailPages.module.css'

// Página mínima de detalle de álbum — no la pidió explícitamente el prompt
// como página propia, pero item 2 (detalle de track) pide navegación cruzada
// a "artista/álbum/género" y el endpoint/tipo ya existían en catalogo.api.ts.
export function AlbumDetailPage() {
  const { albumId } = useParams<{ albumId: string }>()
  const id = Number(albumId)

  const { data: album, isLoading: loadingAlbum, isError: errorAlbum, error: albumError } = useQuery({
    queryKey: ['catalogo', 'album-detail', id],
    queryFn:  () => catalogoApi.albumDetail(id),
    enabled:  Number.isFinite(id),
  })

  const { data: tracksRes, isLoading: loadingTracks } = useQuery({
    queryKey: ['catalogo', 'tracks-by-album', id],
    queryFn:  () => catalogoApi.tracksByAlbum(id, 50),
    enabled:  Number.isFinite(id),
  })

  if (loadingAlbum) return <p className={styles.loading}>// cargando…</p>

  if (errorAlbum || !album) {
    const notFound = albumError instanceof ApiError && albumError.status === 404
    return (
      <ErrorState
        title={notFound ? 'Álbum no encontrado' : undefined}
        message={
          notFound
            ? 'Este álbum no existe o fue eliminado.'
            : 'No se pudo cargar este álbum. Puede que la API no esté disponible.'
        }
      />
    )
  }

  const tracks = tracksRes?.data ?? []

  return (
    <section>
      <div className={styles.hero}>
        <span className={styles.art} aria-hidden="true">
          {album.imagen_url ? <img src={album.imagen_url} alt="" className={styles.artImg} /> : '💿'}
        </span>
        <div className={styles.heroMeta}>
          <span className={styles.heroType}>Álbum</span>
          <h1 className={styles.heroName}>{album.name}</h1>
          <div className={styles.heroSub}>
            {album.release_year && <span>{album.release_year}</span>}
            <span>· {album.track_count ?? tracks.length} canciones</span>
          </div>
        </div>
      </div>

      <div className={styles.attrGrid}>
        <div className={styles.attrCard}>
          <div className={styles.attrLabel}>Año</div>
          <div className={styles.attrValue}>{album.release_year ?? '—'}</div>
        </div>
        <div className={styles.attrCard}>
          <div className={styles.attrLabel}>Tipo</div>
          <div className={styles.attrValue}>{album.album_type ?? '—'}</div>
        </div>
        <div className={styles.attrCard}>
          <div className={styles.attrLabel}>Canciones</div>
          <div className={styles.attrValue}>{album.track_count ?? '—'}</div>
        </div>
        <div className={styles.attrCard}>
          <div className={styles.attrLabel}>Popularidad</div>
          <div className={styles.attrValue}>{album.avg_popularity ?? '—'}</div>
        </div>
      </div>

      <h2 className={styles.sectionTitle}>Canciones</h2>
      {loadingTracks ? (
        <p className={styles.loading}>// cargando…</p>
      ) : tracks.length === 0 ? (
        <p className={styles.empty}>Sin canciones registradas para este álbum.</p>
      ) : (
        <ul className={styles.trackList} aria-label="Canciones del álbum">
          {tracks.map((track: Track, i: number) => (
            <li key={`${track.fact_id}-${track.track_id}`}>
              <TrackCard track={track} position={i + 1} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
