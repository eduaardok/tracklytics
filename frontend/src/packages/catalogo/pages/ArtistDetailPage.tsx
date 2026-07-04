import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { catalogoApi } from '../api/catalogo.api'
import { TrackCard } from '../components/TrackCard'
import { ErrorState } from '@shared/components/ErrorState'
import { ApiError } from '@shared/lib/api-client'
import type { Track } from '../types'
import styles from './DetailPages.module.css'

export function ArtistDetailPage() {
  const { artistaId } = useParams<{ artistaId: string }>()
  const id = Number(artistaId)

  const { data: artist, isLoading: loadingArtist, isError: errorArtist, error: artistError } = useQuery({
    queryKey: ['catalogo', 'artist-detail', id],
    queryFn:  () => catalogoApi.artistDetail(id),
    enabled:  Number.isFinite(id),
  })

  const { data: tracksRes, isLoading: loadingTracks } = useQuery({
    queryKey: ['catalogo', 'tracks-by-artist', id],
    queryFn:  () => catalogoApi.tracksByArtist(id, 20),
    enabled:  Number.isFinite(id),
  })

  if (loadingArtist) return <p className={styles.loading}>// cargando…</p>

  if (errorArtist || !artist) {
    const notFound = artistError instanceof ApiError && artistError.status === 404
    return (
      <ErrorState
        title={notFound ? 'Artista no encontrado' : undefined}
        message={
          notFound
            ? 'Este artista no existe o fue eliminado.'
            : 'No se pudo cargar este artista. Puede que la API no esté disponible.'
        }
      />
    )
  }

  const tracks = tracksRes?.data ?? []

  return (
    <section>
      <div className={styles.hero}>
        <span className={styles.art} aria-hidden="true">
          {artist.imagen_url ? <img src={artist.imagen_url} alt="" className={styles.artImg} /> : '🎤'}
        </span>
        <div className={styles.heroMeta}>
          <span className={styles.heroType}>Artista</span>
          <h1 className={styles.heroName}>{artist.name}</h1>
          <div className={styles.heroSub}>
            <span>{artist.track_count ?? tracks.length} canciones</span>
            {artist.country && <span>· {artist.country}</span>}
            {artist.record_label && <span>· {artist.record_label}</span>}
          </div>
        </div>
      </div>

      <div className={styles.attrGrid}>
        <div className={styles.attrCard}>
          <div className={styles.attrLabel}>Popularidad</div>
          <div className={styles.attrValue}>{artist.avg_popularity ?? '—'}</div>
        </div>
        <div className={styles.attrCard}>
          <div className={styles.attrLabel}>Energía</div>
          <div className={styles.attrValue}>{artist.avg_energy ?? '—'}</div>
        </div>
        <div className={styles.attrCard}>
          <div className={styles.attrLabel}>Baile</div>
          <div className={styles.attrValue}>{artist.avg_danceability ?? '—'}</div>
        </div>
        <div className={styles.attrCard}>
          <div className={styles.attrLabel}>Valencia</div>
          <div className={styles.attrValue}>{artist.avg_valence ?? '—'}</div>
        </div>
      </div>

      <h2 className={styles.sectionTitle}>Canciones populares</h2>
      {loadingTracks ? (
        <p className={styles.loading}>// cargando…</p>
      ) : tracks.length === 0 ? (
        <p className={styles.empty}>Sin canciones registradas para este artista.</p>
      ) : (
        <ul className={styles.trackList} aria-label="Canciones del artista">
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
