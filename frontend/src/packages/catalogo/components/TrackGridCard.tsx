import type { KeyboardEvent, MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Play } from 'lucide-react'
import { usePlayer } from '@shared/context/PlayerContext'
import { AlbumArt } from '@shared/components/AlbumArt'
import { useAd } from '@packages/publicidad'
import { bibliotecaApi } from '../api/biblioteca.api'
import { ApiError, apiErrorMessage } from '@shared/lib/api-client'
import { isAuthenticated } from '@shared/lib/session'
import type { Track } from '../types'
import styles from './TrackGridCard.module.css'

type Props = { track: Track }

// Vista grid del catálogo (S13 polish visual): la misma fila de TrackCard
// pero como tarjeta ~180×220 con portada grande — toggle grid/lista en
// CatalogPage, preferencia recordada en localStorage (ver ui-prefs).
export function TrackGridCard({ track }: Props) {
  const navigate = useNavigate()
  const { play, reportPlaybackIssue } = usePlayer()
  const { pedirImpresion } = useAd()

  function goToDetail() {
    navigate(`/catalogo/track/${track.fact_id}`)
  }

  async function handlePlay(e: MouseEvent) {
    e.stopPropagation()
    const authed = isAuthenticated()
    if (authed) await pedirImpresion()
    play(track)
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
          {track.track_name}
          {track.es_featuring && <span className={styles.featBadge}>feat.</span>}
        </p>
        <p className={styles.artist} title={track.artist_name}>{track.artist_name}</p>
        {track.es_featuring && track.artistas_feat && track.artistas_feat.length > 0 && (
          <p className={styles.featArtists} title={track.artistas_feat.join(', ')}>con {track.artistas_feat.join(', ')}</p>
        )}
      </div>
    </div>
  )
}
