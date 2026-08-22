import { useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Music2, UserCheck, UserPlus } from 'lucide-react'
import { catalogoApi } from '../api/catalogo.api'
import { TrackCard } from '../components/TrackCard'
import { AlbumArt } from '@shared/components/AlbumArt'
import { ErrorState } from '@shared/components/ErrorState'
import { EmptyState } from '@shared/components/EmptyState'
import { SkeletonLoader } from '@shared/components/SkeletonLoader'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { apiErrorMessage, ApiError } from '@shared/lib/api-client'
import { isAuthenticated } from '@shared/lib/session'
import { useToast } from '@shared/context/ToastContext'
import { socialApi } from '@packages/social'
import type { Canal } from '@packages/social'
import { creadoresApi } from '@packages/creadores'
import type { Track } from '../types'
import styles from './DetailPages.module.css'

// F8: menú de compartir portado de la antigua /social/artista/:id (página
// eliminada por duplicar el follow) — el único aporte real que tenía sobre
// esta página era justo este botón.
const CANALES: { canal: Canal; label: string }[] = [
  { canal: 'x', label: 'Compartir en X' },
  { canal: 'whatsapp', label: 'Compartir en WhatsApp' },
  { canal: 'copiar_enlace', label: 'Copiar enlace' },
]

function ShareIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="11" cy="3" r="1.6" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="3" cy="7" r="1.6" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="11" cy="11" r="1.6" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4.4 6.2l5.2-2.4M4.4 7.8l5.2 2.4" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}

export function ArtistDetailPage() {
  const { artistaId } = useParams<{ artistaId: string }>()
  const navigate = useNavigate()
  const id = Number(artistaId)
  const authed = isAuthenticated()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [shareOpen, setShareOpen] = useState(false)
  const [shareResult, setShareResult] = useState<string | null>(null)

  const { data: artist, isLoading: loadingArtist, isError: errorArtist, error: artistError } = useQuery({
    queryKey: ['catalogo', 'artist-detail', id],
    queryFn:  () => catalogoApi.artistDetail(id),
    enabled:  Number.isFinite(id),
  })

  // Seguir artista (S16 prompt 09): antes solo se podía seguir navegando a
  // mano a `/social/artista/:id` — sin ningún enlace visible desde el perfil
  // real del catálogo (`SeguidosSocialPage` se limitaba a describir la ruta
  // en texto). Este botón es el punto de entrada real.
  const seguidos = useQuery({
    queryKey: ['social', 'seguimiento'],
    queryFn:  () => socialApi.misSeguidos(),
    enabled:  authed,
  })
  const siguiendo = (seguidos.data?.data ?? []).some((a) => a.artista_id === id)

  const seguir = useMutation({
    mutationFn: () => socialApi.seguirArtista(id),
    onSuccess:  () => {
      queryClient.invalidateQueries({ queryKey: ['social', 'seguimiento'] })
      toast.success('Ahora sigues a este artista')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo seguir al artista.')),
  })

  const dejarDeSeguir = useMutation({
    mutationFn: () => socialApi.dejarDeSeguir(id),
    onSuccess:  () => {
      queryClient.invalidateQueries({ queryKey: ['social', 'seguimiento'] })
      toast.success('Dejaste de seguir al artista')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo dejar de seguir al artista.')),
  })

  // F2 (hub de artista): puente de vuelta catálogo→hub cuando el visitante
  // es el dueño de esta cuenta de artista. No hay FK DIM_ARTISTS↔
  // DIM_CUENTA_ARTISTA — el backend mismo resuelve la autoría por el "soft
  // join" nombre_artistico = name (ver promocion.py::_resolver_artist_id y
  // AUTOR_TRACK_POR_FACT_ID en social/queries.py); acá se replica esa misma
  // heurística ya aceptada en el proyecto, con la cuenta aprobada.
  const miCuenta = useQuery({
    queryKey: ['creadores', 'cuenta'],
    queryFn:  () => creadoresApi.miCuenta(),
    enabled:  authed,
    retry:    false,
  })

  // F8: compartir perfil de artista (mismo endpoint que usaba la página
  // social eliminada).
  const compartir = useMutation({
    mutationFn: (canal: Canal) =>
      socialApi.compartir({ tipo_interaccion_id: 'compartir_perfil_artista', canal, artista_id: id }),
    onSuccess: (res) => {
      setShareResult(res.contenido); setShareOpen(false)
      toast.success('Enlace generado para compartir')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo generar el enlace para compartir.')),
  })

  const { data: tracksRes, isLoading: loadingTracks } = useQuery({
    queryKey: ['catalogo', 'tracks-by-artist', id],
    queryFn:  () => catalogoApi.tracksByArtist(id, 20),
    enabled:  Number.isFinite(id),
  })

  useDocumentTitle(artist?.name ?? 'Artista')

  if (loadingArtist) {
    return (
      <section>
        <div className={styles.hero}>
          <SkeletonLoader count={1} height={200} className={styles.heroSkeletonArt} />
          <div className={styles.heroMeta}>
            <SkeletonLoader count={2} height={16} />
          </div>
        </div>
      </section>
    )
  }

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
  const esMiCuentaDeArtista =
    miCuenta.data?.estado_cuenta === 'aprobada' && miCuenta.data.nombre_artistico === artist.name

  return (
    <section>
      <div className={styles.hero}>
        <AlbumArt src={artist.imagen_url} alt="" size={200} genreSeed={String(id)} />
        <div className={styles.heroMeta}>
          <span className={styles.heroType}>Artista</span>
          <h1 className={styles.heroName}>{artist.name}</h1>
          <div className={styles.heroSub}>
            <span>{artist.track_count ?? tracks.length} canciones</span>
            {artist.country && <span>· {artist.country}</span>}
            {artist.record_label && <span>· {artist.record_label}</span>}
          </div>
          {authed && (
            <div className={styles.heroActions}>
              <button
                type="button"
                className={`${styles.btnGhost} ${siguiendo ? styles.btnGhostActive : ''}`}
                disabled={seguir.isPending || dejarDeSeguir.isPending}
                onClick={() => (siguiendo ? dejarDeSeguir.mutate() : seguir.mutate())}
              >
                {siguiendo ? (
                  <UserCheck size={16} aria-hidden="true" style={{ verticalAlign: '-3px', marginRight: 4 }} />
                ) : (
                  <UserPlus size={16} aria-hidden="true" style={{ verticalAlign: '-3px', marginRight: 4 }} />
                )}
                {siguiendo ? 'Siguiendo' : 'Seguir'}
              </button>
              {esMiCuentaDeArtista && (
                <Link to="/creadores" className={styles.btnGhost}>
                  Tu hub de creador
                </Link>
              )}
              <div className={styles.shareWrap}>
                <button type="button" className={styles.btnGhost} onClick={() => setShareOpen((v) => !v)}>
                  <ShareIcon /> Compartir
                </button>
                {shareOpen && (
                  <div className={styles.shareOptions}>
                    {CANALES.map(({ canal, label }) => (
                      <button key={canal} type="button" className={styles.shareOption} onClick={() => compartir.mutate(canal)}>
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {shareResult && <div className={styles.shareResult}>{shareResult}</div>}

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
        <EmptyState icon={<Music2 size={22} aria-hidden="true" />} title="Sin canciones registradas para este artista." />
      ) : (
        <ul className={styles.trackList} aria-label="Canciones del artista">
          {tracks.map((track: Track, i: number) => (
            <li key={`${track.fact_id}-${track.track_id}`}>
              <TrackCard track={track} position={i + 1} queue={tracks} />
            </li>
          ))}
        </ul>
      )}

      {/* Mismo "Volver" del detalle de canción — paridad de navegación entre
          páginas de detalle (feedback: faltaba aquí). */}
      <button type="button" className={styles.btnBack} style={{ marginTop: 'var(--space-xl)' }} onClick={() => navigate(-1)}>
        <ArrowLeft size={16} aria-hidden="true" />
        Volver
      </button>
    </section>
  )
}
