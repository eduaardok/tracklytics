import { useQuery } from '@tanstack/react-query'
import { EmptyState } from '@shared/components/EmptyState'
import { bibliotecaApi } from '../api/biblioteca.api'
import { LibraryTrackRow } from './LibraryTrackRow'
import styles from '../pages/BibliotecaPage.module.css'

export function FavoritosTab() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['biblioteca', 'favoritos'],
    queryFn:  () => bibliotecaApi.favoritos(),
  })

  if (isLoading) return <p className={styles.loading}>// cargando…</p>
  if (isError) return <div className={styles.blocked} role="alert">No se pudieron cargar los favoritos.</div>

  const tracks = data?.data ?? []

  if (tracks.length === 0) {
    return (
      <EmptyState
        icon="♥"
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
