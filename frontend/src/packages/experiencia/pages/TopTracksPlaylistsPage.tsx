import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRole } from '@shared/lib/session'
import { ErrorState } from '@shared/components/ErrorState'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { experienciaApi } from '../api/experiencia.api'
import type { TopTrackPlaylist } from '../types'
import styles from './ExperienciaPages.module.css'

// RF-EXP-006/007 (CU-O49/CU-O50): Cliente B2B (analyst) consulta los tracks
// más agregados a playlists de usuarios desde el reflejo analítico; admin
// puede además forzar una resincronización fuera del ciclo semanal — ambas
// acciones viven en una sola página táctica, mismo patrón que el resto de
// `/analitica` (design.md de `experiencia`, "frecuencia de sincronización").
export function TopTracksPlaylistsPage() {
  useDocumentTitle('Tracks más agregados a playlists')
  const queryClient = useQueryClient()
  const isAdmin = getRole() === 'admin'

  const topTracks = useQuery({
    queryKey: ['experiencia', 'playlists-top-tracks'],
    queryFn:  () => experienciaApi.topTracksPlaylists(20),
  })

  const sincronizar = useMutation({
    mutationFn: () => experienciaApi.sincronizarPlaylists(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['experiencia', 'playlists-top-tracks'] }),
  })

  const data: TopTrackPlaylist[] = topTracks.data?.data ?? []

  return (
    <section className={styles.page}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--space-md)' }}>
        <div>
          <h1 className={styles.heading}>Tracks más agregados a playlists</h1>
        </div>
        {isAdmin && (
          <button
            className={styles.btnGhost}
            disabled={sincronizar.isPending}
            onClick={() => sincronizar.mutate()}
            title="Forzar resincronización fuera del ciclo semanal"
          >
            {sincronizar.isPending ? 'Sincronizando…' : 'Resincronizar ahora'}
          </button>
        )}
      </div>
      {sincronizar.isSuccess && <div className={styles.bannerOk} role="status">Resincronización disparada correctamente.</div>}
      {sincronizar.isError && <ErrorState message="No se pudo disparar la resincronización." />}

      <div className={styles.tablePanel}>
        {topTracks.isError ? (
          <ErrorState message="No se pudo cargar el reflejo de playlists." style={{ margin: 'var(--space-md)' }} />
        ) : topTracks.isLoading ? (
          <div style={{ padding: 'var(--space-md)' }}><span className={styles.skel} style={{ width: '40%', height: 14 }} /></div>
        ) : data.length === 0 ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyTitle}>Sin datos todavía</span>
            <span className={styles.emptyBody}>
              El reflejo de playlists se puebla en la corrida semanal de ingesta{isAdmin ? ' — o resincronizando arriba' : ''}.
            </span>
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr><th>#</th><th>Track</th><th>Artista</th><th>Playlists</th></tr>
            </thead>
            <tbody>
              {data.map((t, i) => (
                <tr key={t.fact_id}>
                  <td>{i + 1}</td>
                  <td>{t.track_name}</td>
                  <td>{t.artist_name}</td>
                  <td>{t.playlists_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}
