import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Heart, ListPlus, Lock, Play } from 'lucide-react'
import { catalogoApi } from '../api/catalogo.api'
import { usePlayer } from '@shared/context/PlayerContext'
import { AlbumArt } from '@shared/components/AlbumArt'
import { TrackName, FeaturingCaption } from '@shared/components/TrackName'
import { ErrorState } from '@shared/components/ErrorState'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { ApiError, apiErrorMessage } from '@shared/lib/api-client'
import { useFavoritos } from '../hooks/useFavoritos'
import { AddToPlaylistMenu } from '../components/AddToPlaylistMenu'
import { bibliotecaApi } from '../api/biblioteca.api'
import { usePlanActivo } from '@packages/suscripciones'
import { useAd } from '@packages/publicidad'
import styles from './DetailPages.module.css'

function formatDuration(ms: number): string {
  const m = Math.floor(ms / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function FeatureBar({ label, desc, value }: { label: string; desc: string; value: number }) {
  const pct = Math.round(value * 100)
  return (
    <div className={styles.featureBar}>
      <span className={styles.featureLabel}>
        {label}
        <span className={styles.featureDesc}>{desc}</span>
      </span>
      <div className={styles.featureTrack}>
        <div className={styles.featureFill} style={{ width: `${pct}%` }} />
      </div>
      <span className={styles.featureValue}>{pct}%</span>
    </div>
  )
}

export function TrackDetailPage() {
  const { factId } = useParams<{ factId: string }>()
  const navigate = useNavigate()
  const { play, reportPlaybackIssue, enqueue } = usePlayer()
  const { pedirImpresion } = useAd()
  const { isAuthenticated, isFavorite, toggle, toggleError } = useFavoritos()
  const { esPremium, isLoading: planLoading } = usePlanActivo()

  const id = Number(factId)

  const { data: track, isLoading, isError, error } = useQuery({
    queryKey: ['catalogo', 'track-detail', id],
    queryFn:  () => catalogoApi.trackDetailByFact(id),
    enabled:  Number.isFinite(id),
  })

  // Backend-enforced (no solo visual): el endpoint responde 403 si el plan
  // activo no es premium — antes las 7 características de audio viajaban
  // siempre en `track-detail` y el paywall era únicamente del cliente.
  const { data: audioFeatures } = useQuery({
    queryKey: ['catalogo', 'audio-features', id],
    queryFn:  () => catalogoApi.audioFeatures(id),
    enabled:  Number.isFinite(id) && esPremium,
    retry:    false,
  })

  useDocumentTitle(track?.track_name ?? 'Track')

  if (isLoading) return <p className={styles.loading}>// cargando…</p>

  if (isError || !track) {
    const notFound = error instanceof ApiError && error.status === 404
    return (
      <ErrorState
        title={notFound ? 'Track no encontrado' : undefined}
        message={
          notFound
            ? 'Este track no existe o fue eliminado.'
            : 'No se pudo cargar este track. Puede que la API no esté disponible.'
        }
      />
    )
  }

  const favorite = isFavorite(track.fact_id)

  return (
    <section>
      <div className={styles.hero}>
        <AlbumArt src={track.imagen_url} alt="" size={96} />
        <div className={styles.heroMeta}>
          <span className={styles.heroType}>Canción</span>
          <h1 className={styles.heroName}>
            <TrackName name={track.track_name} esFeaturing={track.es_featuring} sourceType={track.source_type} featBadgeClassName={styles.featBadge} explicitId={track.explicit_id} />
          </h1>
          <FeaturingCaption esFeaturing={track.es_featuring} artistasFeat={track.artistas_feat} className={styles.featArtists} />
          <div className={styles.heroSub}>
            <Link to={`/catalogo/artista/${track.artist_id}`} className={styles.heroLink}>
              {track.artist_name}
            </Link>
            {track.album_name && (
              <>
                <span>·</span>
                <Link to={`/catalogo/album/${track.album_id}`} className={styles.heroLink}>
                  {track.album_name}
                </Link>
              </>
            )}
            <span>· {track.genre_name}</span>
            <span>· {formatDuration(track.duration_ms)}</span>
          </div>
          <div className={styles.heroActions}>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={async () => {
                if (isAuthenticated) await pedirImpresion()
                play(track)
                if (isAuthenticated) {
                  bibliotecaApi.registrarReproduccion(track.fact_id).catch((err) => {
                    // Solo el bloqueo geográfico (RF-DIS-007) detiene la
                    // reproducción — un fallo del registro de historial en sí
                    // (500/red) no es razón para cortar la música.
                    if (err instanceof ApiError && err.status === 403) {
                      reportPlaybackIssue(apiErrorMessage(err, 'Este track no está disponible.'))
                    }
                  })
                }
              }}
            >
              <Play size={16} aria-hidden="true" fill="currentColor" style={{ verticalAlign: '-3px', marginRight: 4 }} />
              Reproducir
            </button>
            <button
              type="button"
              className={styles.btnGhost}
              onClick={() => enqueue(track)}
            >
              <ListPlus size={16} aria-hidden="true" style={{ verticalAlign: '-3px', marginRight: 4 }} />
              Agregar a la cola
            </button>
            {isAuthenticated && (
              <>
                <button
                  type="button"
                  className={`${styles.btnGhost} ${favorite ? styles.btnGhostActive : ''}`}
                  onClick={() => toggle(track.fact_id)}
                >
                  <Heart size={16} aria-hidden="true" fill={favorite ? 'currentColor' : 'none'} style={{ verticalAlign: '-3px', marginRight: 4 }} />
                  {favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}
                </button>
                <AddToPlaylistMenu factId={track.fact_id} />
              </>
            )}
          </div>
          {toggleError && <ErrorState compact message={toggleError} />}
        </div>
      </div>

      <h2 className={styles.sectionTitle}>Popularidad</h2>
      <div className={styles.attrGrid}>
        <div className={styles.attrCard}>
          <div className={styles.attrLabel}>Score</div>
          <div className={styles.attrValue}>{track.popularity ?? '—'}</div>
        </div>
        <div className={styles.attrCard}>
          <div className={styles.attrLabel}>Tempo</div>
          <div className={styles.attrValue}>{track.tempo ? `${Math.round(track.tempo)} BPM` : '—'}</div>
        </div>
        <div className={styles.attrCard}>
          <div className={styles.attrLabel}>Loudness</div>
          <div className={styles.attrValue}>{track.loudness != null ? `${track.loudness.toFixed(1)} dB` : '—'}</div>
        </div>
        <div className={styles.attrCard}>
          <div className={styles.attrLabel}>Duración</div>
          <div className={styles.attrValue}>{formatDuration(track.duration_ms)}</div>
        </div>
      </div>

      <h2 className={styles.sectionTitle}>Características de audio</h2>
      {planLoading ? null : esPremium && audioFeatures ? (
        <div className={styles.featureBars}>
          <FeatureBar label="Danceability"     desc="Qué tan bailable es la canción"          value={audioFeatures.danceability} />
          <FeatureBar label="Energy"           desc="Intensidad y actividad percibida"        value={audioFeatures.energy} />
          <FeatureBar label="Valence"          desc="Positividad emocional del sonido"        value={audioFeatures.valence} />
          <FeatureBar label="Acousticness"     desc="Probabilidad de ser acústica"            value={audioFeatures.acousticness} />
          <FeatureBar label="Speechiness"      desc="Presencia de palabras habladas"          value={audioFeatures.speechiness} />
          <FeatureBar label="Instrumentalness" desc="Ausencia de voz (más = instrumental)"    value={audioFeatures.instrumentalness} />
          <FeatureBar label="Liveness"         desc="Probabilidad de ser en vivo"              value={audioFeatures.liveness} />
        </div>
      ) : (
        <div className={styles.paywall}>
          <Lock size={24} className={styles.paywallIcon} aria-hidden="true" />
          <p className={styles.paywallText}>Sección exclusiva Premium.</p>
          <Link to="/suscripciones" className={styles.btnPrimary}>Actualizar a Premium</Link>
        </div>
      )}

      <button type="button" className={styles.btnBack} style={{ marginTop: 'var(--space-xl)' }} onClick={() => navigate(-1)}>
        <ArrowLeft size={16} aria-hidden="true" />
        Volver
      </button>
    </section>
  )
}
