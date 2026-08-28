import { lazy, Suspense } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft, Clock, Gauge, Heart, ListPlus, Lock, MessageSquare, Play, Radio, ThumbsDown, ThumbsUp, Volume2,
} from 'lucide-react'
import { catalogoApi } from '../api/catalogo.api'
import { usePlayer } from '@shared/context/PlayerContext'
import { AlbumArt } from '@shared/components/AlbumArt'
import { TrackName, FeaturingCaption } from '@shared/components/TrackName'
import { ErrorState } from '@shared/components/ErrorState'
import { InfoHint } from '@shared/components/InfoHint'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { ApiError, apiClient, apiErrorMessage } from '@shared/lib/api-client'
import { useFavoritos } from '../hooks/useFavoritos'
import { useLikes } from '../hooks/useLikes'
import { useRadio } from '../hooks/useRadio'
import { AddToPlaylistMenu } from '../components/AddToPlaylistMenu'
import { bibliotecaApi } from '../api/biblioteca.api'
import { usePlanActivo } from '@packages/suscripciones'
import { useAd } from '@packages/publicidad'
import styles from './DetailPages.module.css'

// `TrackDetailPage` se importa EAGER en `router.tsx` (no vía el helper
// `lazy()` de rutas) — es una de las páginas más visitadas del B2C. Recharts
// (usado solo acá dentro de todo `catalogo`) agregaba ~94kB gzip al bundle
// principal si se importaba de forma estática (confirmado con `npm run
// build`: index pasó de 146kB a 240kB gzip). Con `lazy()` a nivel de
// componente, recharts queda en su propio chunk, cargado solo cuando el
// usuario premium realmente ve "Características de audio".
const AudioFeaturesPanel = lazy(() =>
  import('../components/AudioFeaturesPanel').then((m) => ({ default: m.AudioFeaturesPanel })),
)

function formatDuration(ms: number): string {
  const m = Math.floor(ms / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function TrackDetailPage() {
  const { factId } = useParams<{ factId: string }>()
  const navigate = useNavigate()
  const { play, reportPlaybackIssue, enqueue } = usePlayer()
  const { pedirImpresion } = useAd()
  const { isAuthenticated, isFavorite, toggle, toggleError } = useFavoritos()
  const { esPremium, isLoading: planLoading } = usePlanActivo()
  const { iniciarRadio, iniciando: radioIniciando } = useRadio()

  const id = Number(factId)
  const { likes, voto, like, dislike } = useLikes(id)

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

  // F1 (auditoría de lógica y flujos): el hilo de comentarios existía solo en
  // /social — desde el detalle no había ni un camino hacia él. Contamos con
  // el mismo endpoint del hilo para etiquetar "Comentarios (N)". Va por
  // apiClient directo y no por `@packages/social` porque social ya importa a
  // catálogo y la dependencia inversa rompería la capa (regla del proyecto).
  // El endpoint exige sesión: sin sesión o ante error, el enlace se muestra
  // simplemente sin número.
  const { data: comentariosRes } = useQuery({
    queryKey: ['social', 'comentarios', id],
    queryFn:  () => apiClient.get<{ data: unknown[] }>(`/social/comentarios/${id}`),
    enabled:  Number.isFinite(id) && isAuthenticated,
    retry:    false,
  })
  const numComentarios = comentariosRes?.data?.length ?? null

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
        <div className={styles.heroBg} aria-hidden="true" />
        <AlbumArt src={track.imagen_url} alt="" size={96} trackId={track.track_id} />
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
            {/* Radio desde el detalle (S16-P10): hasta ahora solo TrackCard de
                los listados tenía el botón — la ficha completa era la superficie
                más natural y no lo tenía. */}
            <button
              type="button"
              className={styles.btnGhost}
              disabled={radioIniciando}
              onClick={() => iniciarRadio(track.fact_id)}
            >
              <Radio size={16} aria-hidden="true" style={{ verticalAlign: '-3px', marginRight: 4 }} />
              {radioIniciando ? 'Iniciando radio…' : 'Iniciar radio'}
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
                <button
                  type="button"
                  className={`${styles.btnGhost} ${voto === 'like' ? styles.btnGhostActive : ''}`}
                  onClick={like}
                >
                  <ThumbsUp size={16} aria-hidden="true" fill={voto === 'like' ? 'currentColor' : 'none'} style={{ verticalAlign: '-3px', marginRight: 4 }} />
                  Me gusta{likes > 0 ? ` (${likes})` : ''}
                </button>
                <button
                  type="button"
                  className={`${styles.btnGhost} ${voto === 'dislike' ? styles.btnGhostActive : ''}`}
                  onClick={dislike}
                >
                  <ThumbsDown size={16} aria-hidden="true" fill={voto === 'dislike' ? 'currentColor' : 'none'} style={{ verticalAlign: '-3px', marginRight: 4 }} />
                  No me gusta
                </button>
                <AddToPlaylistMenu factId={track.fact_id} />
              </>
            )}
          </div>
          {toggleError && <ErrorState compact message={toggleError} />}
        </div>
      </div>

      {/* "Métricas" y no "Popularidad": la grilla mezcla el Score (que sí es
          popularidad) con Tempo/Loudness/Duración, que son atributos del
          audio sin relación con ella (feedback). */}
      <h2 className={styles.sectionTitle}>Métricas</h2>
      <div className={styles.attrGrid}>
        <div className={styles.attrCard}>
          <div className={styles.attrLabel}>
            <Gauge size={13} aria-hidden="true" />
            Popularidad (Score)
            <InfoHint text="Puntaje de 0 a 100 que resume qué tan popular es la canción en el catálogo: reproducciones, «me gusta» y reacciones." />
          </div>
          <div className={styles.attrValue}>{track.popularity ?? '—'}</div>
        </div>
        <div className={styles.attrCard}>
          <div className={styles.attrLabel}>
            <Radio size={13} aria-hidden="true" />
            Tempo (BPM)
            <InfoHint text="Pulsos por minuto: la velocidad del ritmo. 60–90 es lento, ~120 moderado, 160+ muy rápido." />
          </div>
          <div className={styles.attrValue}>{track.tempo ? `${Math.round(track.tempo)} BPM` : '—'}</div>
        </div>
        <div className={styles.attrCard}>
          <div className={styles.attrLabel}>
            <Volume2 size={13} aria-hidden="true" />
            Sonoridad (Loudness)
            <InfoHint text="Volumen promedio en decibelios (dB). Valores más cercanos a 0 indican una canción que suena más fuerte." />
          </div>
          <div className={styles.attrValue}>{track.loudness != null ? `${track.loudness.toFixed(1)} dB` : '—'}</div>
        </div>
        <div className={styles.attrCard}>
          <div className={styles.attrLabel}>
            <Clock size={13} aria-hidden="true" />
            Duración
          </div>
          <div className={styles.attrValue}>{formatDuration(track.duration_ms)}</div>
        </div>
      </div>

      {/* Glosario coherente (S16) preservado, ahora en AudioFeaturesPanel:
          radar (forma del track de un vistazo) + las mismas 7 barras con
          ícono — reemplaza la lista plana anterior (feedback: "que tengan
          más peso, no solo barrita"). */}
      <h2 className={styles.sectionTitle}>Características de audio</h2>
      {planLoading ? null : esPremium && audioFeatures ? (
        <Suspense fallback={<p className={styles.loading}>// cargando…</p>}>
          <AudioFeaturesPanel data={audioFeatures} />
        </Suspense>
      ) : (
        <div className={styles.paywall}>
          <Lock size={24} className={styles.paywallIcon} aria-hidden="true" />
          <p className={styles.paywallText}>Sección exclusiva Premium.</p>
          <Link to="/suscripciones" className={styles.btnPrimary}>Actualizar a Premium</Link>
        </div>
      )}

      {/* F1: puerta de entrada al hilo social del track — la ruta y la UI
          ya existían en /social/track/:factId, aquí solo se abre el enlace.
          btnGhostPage y no btnGhost: este link vive FUERA del hero y el vidrio
          esmerilado de btnGhost (texto blanco fijo) era invisible en modo
          claro sobre --color-bg casi blanco. */}
      <h2 className={styles.sectionTitle}>Comentarios</h2>
      <div>
        <Link to={`/social/track/${track.fact_id}`} className={styles.btnGhostPage}>
          <MessageSquare size={16} aria-hidden="true" style={{ verticalAlign: '-3px', marginRight: 4 }} />
          {numComentarios != null && numComentarios > 0 ? `Ver comentarios (${numComentarios})` : 'Ver comentarios'}
        </Link>
      </div>

      <button type="button" className={styles.btnBack} style={{ marginTop: 'var(--space-xl)' }} onClick={() => navigate(-1)}>
        <ArrowLeft size={16} aria-hidden="true" />
        Volver
      </button>
    </section>
  )
}
