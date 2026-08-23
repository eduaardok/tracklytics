import { useQuery } from '@tanstack/react-query'
import { Heart } from 'lucide-react'
import { EmptyState } from '@shared/components/EmptyState'
import { ErrorState } from '@shared/components/ErrorState'
import { SkeletonLoader } from '@shared/components/SkeletonLoader'
import { bibliotecaApi } from '../api/biblioteca.api'
import { LibraryTrackRow } from './LibraryTrackRow'
import styles from '../pages/BibliotecaPage.module.css'

export function FavoritosTab() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['biblioteca', 'favoritos'],
    queryFn:  () => bibliotecaApi.favoritos(),
  })

  if (isLoading) return <SkeletonLoader count={6} height={14} />
  if (isError) return <ErrorState message="No se pudieron cargar los favoritos." />

  const tracks = data?.data ?? []

  if (tracks.length === 0) {
    return (
      <EmptyState
        icon={<Heart size={22} aria-hidden="true" />}
        title="Sin favoritos aún."
        body="Marca una canción como favorita para guardarla aquí."
      />
    )
  }

  return (
    <>
      {data?.plan === 'free' && data.plan_limit != null && (
        <p className={styles.playlistCountLabel} style={{ marginBottom: 'var(--space-md)' }}>
          Plan Free: {tracks.length}/{data.plan_limit} favoritos
        </p>
      )}
      <ul className={styles.trackList} aria-label="Favoritos">
        {tracks.map((t, i) => (
          <li key={t.fact_id}><LibraryTrackRow track={t} position={i + 1} queue={tracks} /></li>
        ))}
      </ul>
    </>
  )
}
