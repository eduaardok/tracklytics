import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Lock } from 'lucide-react'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { ErrorState } from '@shared/components/ErrorState'
// S16-P11: "Cargando perfil…" plano -> hero shimmer con la forma del subjectBar.
import { SkeletonLoader } from '@shared/components/SkeletonLoader'
import { UserAvatar } from '@shared/components/UserAvatar'
import { AlbumArt } from '@shared/components/AlbumArt'
import { ApiError } from '@shared/lib/api-client'
import { LibraryTrackRow } from '@packages/catalogo'
import { socialApi } from '../api/social.api'
import type { TopArtista, TrackConReproducciones } from '../types'
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
        <div className={styles.subjectBar}>
          <SkeletonLoader count={1} height={44} className={styles.skelCircle} />
          <div style={{ flex: 1 }}>
            <SkeletonLoader count={2} height={14} />
          </div>
        </div>
        <SkeletonLoader count={3} height={14} />
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
        <UserAvatar usuarioId={usuarioId!} nombre={data.nombre} size={56} />
        <div className={styles.subjectInfo}>
          <p className={styles.subjectName}>{data.nombre}</p>
          <p className={styles.subjectMeta}>
            {data.playlists.length} playlist{data.playlists.length !== 1 ? 's' : ''} pública{data.playlists.length !== 1 ? 's' : ''}
            {data.es_propio ? ' · Este es tu perfil público' : ''}
          </p>
        </div>
      </div>

      {(data.top_tracks.length > 0 || data.top_artistas.length > 0) && (
        <QueEscucha topTracks={data.top_tracks} topArtistas={data.top_artistas} />
      )}

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
            <p className={styles.sectionLabel}>{pl.name} · {pl.total} cancion{pl.total !== 1 ? 'es' : ''}</p>
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

// "Qué escucha" (S17, paridad con apps de música) — top 5 tracks / top 3
// artistas de los últimos 30 días. Reusa `LibraryTrackRow` (mismo componente
// que ya pinta las playlists de esta página, arriba) para las canciones;
// los artistas siguen el mismo patrón visual `followedList`/`followedRow`
// que ya usa `SeguidosSocialPage` para su lista de artistas seguidos.
function QueEscucha({ topTracks, topArtistas }: { topTracks: TrackConReproducciones[]; topArtistas: TopArtista[] }) {
  return (
    <div className={styles.panel} style={{ marginBottom: 'var(--space-lg)' }}>
      {topTracks.length > 0 && (
        <>
          <p className={styles.sectionLabel}>Top canciones · últimos 30 días</p>
          <ul className={styles.followedList} style={{ border: 'none', marginBottom: topArtistas.length > 0 ? 'var(--space-lg)' : 0 }}>
            {topTracks.map((t, i) => (
              <LibraryTrackRow key={t.fact_id} track={t} position={i + 1} queue={topTracks} />
            ))}
          </ul>
        </>
      )}

      {topArtistas.length > 0 && (
        <>
          <p className={styles.sectionLabel}>Top artistas · últimos 30 días</p>
          <ul className={styles.followedList}>
            {topArtistas.map((a) => (
              <Link key={a.artist_id} to={`/catalogo/artista/${a.artist_id}`} className={styles.followedRow}>
                <span className={styles.followedLeft}>
                  <AlbumArt src={a.imagen_url} alt="" size={40} genreSeed={String(a.artist_id)} />
                  <span className={styles.followedName}>{a.name}</span>
                </span>
                <span className={styles.followedMeta}>{a.reproducciones} reproducci{a.reproducciones === 1 ? 'ón' : 'ones'}</span>
              </Link>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
