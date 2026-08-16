import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { User, Lock } from 'lucide-react'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { ErrorState } from '@shared/components/ErrorState'
import { ApiError } from '@shared/lib/api-client'
import { LibraryTrackRow } from '@packages/catalogo'
import { socialApi } from '../api/social.api'
import styles from './SocialPages.module.css'

// Perfil público (S10 ronda 2, punto 2) — accesible sin sesión: el backend
// (`GET /social/usuarios/{id}/perfil`) ya resuelve la visibilidad (404 si es
// privado y el visitante no es el dueño), esta página solo renderiza lo que
// llega. Reusa LibraryTrackRow (mismo shape LibraryTrack que favoritos/
// historial/playlist propia) en vez de TrackCard — el endpoint no trae los
// atributos de audio completos que TrackCard exige.
export function PerfilPublicoPage() {
  const { usuarioId } = useParams<{ usuarioId: string }>()
  useDocumentTitle('Perfil')

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['social', 'perfil-publico', usuarioId],
    queryFn:  () => socialApi.perfilPublico(usuarioId!),
    enabled:  !!usuarioId,
    retry:    false,
  })

  if (isLoading) {
    return (
      <section className={styles.page}>
        <p className={styles.emptyBody}>Cargando perfil…</p>
      </section>
    )
  }

  if (isError || !data) {
    const esPrivado = error instanceof ApiError && error.status === 404
    return (
      <section className={styles.page}>
        <div className={styles.emptyState}>
          <Lock size={28} className={styles.icon} aria-hidden="true" />
          <span className={styles.emptyTitle}>
            {esPrivado ? 'Este perfil es privado' : 'No se pudo cargar este perfil'}
          </span>
          <span className={styles.emptyBody}>
            {esPrivado
              ? 'El dueño de este perfil no lo ha hecho público.'
              : 'Puede que el usuario no exista o haya un problema de red.'}
          </span>
        </div>
      </section>
    )
  }

  return (
    <section className={styles.page}>
      <div className={styles.subjectBar}>
        <User size={28} className={styles.icon} aria-hidden="true" />
        <div className={styles.subjectInfo}>
          <p className={styles.subjectName}>{data.nombre}</p>
          <p className={styles.subjectMeta}>
            {data.playlists.length} playlist{data.playlists.length !== 1 ? 's' : ''} pública{data.playlists.length !== 1 ? 's' : ''}
            {data.es_propio ? ' · Este es tu perfil público' : ''}
          </p>
        </div>
      </div>

      {data.playlists.length === 0 ? (
        <div className={styles.emptyState}>
          <span className={styles.emptyTitle}>Sin playlists públicas todavía</span>
          <span className={styles.emptyBody}>
            {data.es_propio
              ? 'Marca una playlist como pública desde Mi Biblioteca para que aparezca aquí.'
              : 'Este usuario no ha compartido ninguna playlist pública.'}
          </span>
        </div>
      ) : (
        data.playlists.map((pl) => (
          <div key={pl.playlist_id} className={styles.panel} style={{ marginBottom: 'var(--space-lg)' }}>
            <p className={styles.sectionLabel}>{pl.name} · {pl.total} canción{pl.total !== 1 ? 'es' : ''}</p>
            {pl.data.length === 0 ? (
              <ErrorState compact message="Esta playlist está vacía." />
            ) : (
              <ul className={styles.followedList} style={{ border: 'none' }}>
                {pl.data.map((t, i) => (
                  <LibraryTrackRow key={t.fact_id} track={t} position={i + 1} queue={pl.data} />
                ))}
              </ul>
            )}
          </div>
        ))
      )}
    </section>
  )
}
