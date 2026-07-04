import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { catalogoApi } from '../api/catalogo.api'
import { usePlayer } from '@shared/context/PlayerContext'
import { ErrorState } from '@shared/components/ErrorState'
import { ApiError, apiErrorMessage } from '@shared/lib/api-client'
import { useFavoritos } from '../hooks/useFavoritos'
import { AddToPlaylistMenu } from '../components/AddToPlaylistMenu'
import { bibliotecaApi } from '../api/biblioteca.api'
import { usePlanActivo } from '@packages/suscripciones'
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
  const { play, reportPlaybackIssue } = usePlayer()
  const { isAuthenticated, isFavorite, toggle, toggleError } = useFavoritos()
  const { esPremium, isLoading: planLoading } = usePlanActivo()

  const id = Number(factId)

  const { data: track, isLoading, isError, error } = useQuery({
    queryKey: ['catalogo', 'track-detail', id],
    queryFn:  () => catalogoApi.trackDetailByFact(id),
    enabled:  Number.isFinite(id),
  })

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
        <span className={styles.art} aria-hidden="true">♪</span>
        <div className={styles.heroMeta}>
          <span className={styles.heroType}>Canción</span>
          <h1 className={styles.heroName}>{track.track_name}</h1>
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
              onClick={() => {
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
              ▶ Reproducir
            </button>
            {isAuthenticated && (
              <>
                <button
                  type="button"
                  className={`${styles.btnGhost} ${favorite ? styles.btnGhostActive : ''}`}
                  onClick={() => toggle(track.fact_id)}
                >
                  ♥ {favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}
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
      {planLoading ? null : esPremium ? (
        <div className={styles.featureBars}>
          <FeatureBar label="Danceability"     desc="Qué tan bailable es la canción"          value={track.danceability} />
          <FeatureBar label="Energy"           desc="Intensidad y actividad percibida"        value={track.energy} />
          <FeatureBar label="Valence"          desc="Positividad emocional del sonido"        value={track.valence} />
          <FeatureBar label="Acousticness"     desc="Probabilidad de ser acústica"            value={track.acousticness} />
          <FeatureBar label="Speechiness"      desc="Presencia de palabras habladas"          value={track.speechiness} />
          <FeatureBar label="Instrumentalness" desc="Ausencia de voz (más = instrumental)"    value={track.instrumentalness} />
          <FeatureBar label="Liveness"         desc="Probabilidad de ser en vivo"              value={track.liveness} />
        </div>
      ) : (
        <div className={styles.paywall}>
          <span className={styles.paywallIcon} aria-hidden="true">🔒</span>
          <p className={styles.paywallText}>Sección exclusiva Premium.</p>
          <Link to="/suscripciones" className={styles.btnPrimary}>Actualizar a Premium</Link>
        </div>
      )}

      <button type="button" className={styles.btnGhost} style={{ marginTop: 'var(--space-xl)' }} onClick={() => navigate(-1)}>
        ← Volver
      </button>
    </section>
  )
}
