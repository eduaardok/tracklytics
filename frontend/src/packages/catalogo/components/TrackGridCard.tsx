import type { KeyboardEvent, MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Play } from 'lucide-react'
import { usePlayer } from '@shared/context/PlayerContext'
import { AlbumArt } from '@shared/components/AlbumArt'
import { TrackName, FeaturingCaption } from '@shared/components/TrackName'
import { useAd } from '@packages/publicidad'
import { bibliotecaApi } from '../api/biblioteca.api'
import { ApiError, apiErrorMessage } from '@shared/lib/api-client'
import { isAuthenticated } from '@shared/lib/session'
import type { Track } from '../types'
import styles from './TrackGridCard.module.css'

type Props = {
  track: Track
  // Lista completa + indice del track dentro de ella - mismo mecanismo de
  // encolado automatico que TrackCard (Fase 1, S16), opcional para no
  // romper usos existentes que no la pasen.
  queue?: Track[]
  index?: number
}

// Vista grid del catálogo (S13 polish visual): la misma fila de TrackCard
// pero como tarjeta ~180×220 con portada grande — toggle grid/lista en
// CatalogPage, preferencia recordada en localStorage (ver ui-prefs).
export function TrackGridCard({ track, queue, index }: Props) {
  const navigate = useNavigate()
  const { play, playList, reportPlaybackIssue } = usePlayer()
  const { pedirImpresion } = useAd()

  function goToDetail() {
    navigate(`/catalogo/track/${track.fact_id}`)
  }

  async function handlePlay(e: MouseEvent) {
    e.stopPropagation()
    const authed = isAuthenticated()
    if (authed) await pedirImpresion()
    if (queue && queue.length > 0 && index != null) playList(queue, index)
    else play(track)
    if (authed) {
      bibliotecaApi.registrarReproduccion(track.fact_id).catch((err) => {
        if (err instanceof ApiError && err.status === 403) {
          reportPlaybackIssue(apiErrorMessage(err, 'Este track no está disponible.'))
        }
      })
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') goToDetail()
  }

  return (
    <div
      className={styles.card}
      onClick={goToDetail}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
    >
      <div className={styles.artWrap}>
        <AlbumArt src={track.imagen_url} alt="" size={160} className={styles.art} genreSeed={track.genre_name} />
        <div className={styles.overlay}>
          <button
            type="button"
            className={styles.playBtn}
            onClick={handlePlay}
            title="Reproducir"
            aria-label="Reproducir"
          >
            <Play size={20} fill="currentColor" aria-hidden="true" />
          </button>
        </div>
        <span className={styles.popBadge}>
          <span aria-hidden="true">★</span>{track.popularity}
        </span>
      </div>
      <div className={styles.info}>
        <p className={styles.name} title={track.track_name}>
          <TrackName
            name={track.track_name}
            esFeaturing={track.es_featuring}
            sourceType={track.source_type}
            featBadgeClassName={styles.featBadge}
            explicitId={track.explicit_id}
          />
        </p>
        <p className={styles.artist} title={track.artist_name}>{track.artist_name}</p>
        {track.es_featuring && track.artistas_feat && track.artistas_feat.length > 0 && (
          <p className={styles.featArtists} title={track.artistas_feat.join(', ')}>con {track.artistas_feat.join(', ')}</p>
        )}
      </div>
    </div>
  )
}
