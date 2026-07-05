import type { KeyboardEvent, MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ListPlus } from 'lucide-react'
import { usePlayer } from '@shared/context/PlayerContext'
import { AlbumArt } from '@shared/components/AlbumArt'
import { ErrorState } from '@shared/components/ErrorState'
import { ApiError, apiErrorMessage } from '@shared/lib/api-client'
import { useFavoritos } from '../hooks/useFavoritos'
import { AddToPlaylistMenu } from './AddToPlaylistMenu'
import { bibliotecaApi } from '../api/biblioteca.api'
import type { Track } from '../types'
import styles from './TrackCard.module.css'

type Props = {
  track:    Track
  position: number
}

function formatDuration(ms: number): string {
  const m = Math.floor(ms / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function TrackCard({ track, position }: Props) {
  const navigate = useNavigate()
  const { play, reportPlaybackIssue, enqueue } = usePlayer()
  const { isAuthenticated, isFavorite, toggle, toggleError } = useFavoritos()
  const favorite = isFavorite(track.fact_id)

  function goToDetail() {
    navigate(`/catalogo/track/${track.fact_id}`)
  }

  function handlePlay(e: MouseEvent) {
    e.stopPropagation()
    play(track)
    if (isAuthenticated) {
      bibliotecaApi.registrarReproduccion(track.fact_id).catch((err) => {
        // Solo el bloqueo geográfico (RF-DIS-007) detiene la reproducción —
        // un 500/red en el registro de historial no debería cortar la
        // música por un fallo de analítica no crítico.
        if (err instanceof ApiError && err.status === 403) {
          reportPlaybackIssue(apiErrorMessage(err, 'Este track no está disponible.'))
        }
      })
    }
  }

  function handleFavorite(e: MouseEvent) {
    e.stopPropagation()
    toggle(track.fact_id)
  }

  function handleEnqueue(e: MouseEvent) {
    e.stopPropagation()
    enqueue(track)
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') goToDetail()
  }

  return (
    <>
      <div
        className={styles.row}
        onClick={goToDetail}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
      >
        <span className={styles.position} aria-hidden="true">
          {position}
        </span>
        <AlbumArt src={track.imagen_url} alt="" size={40} />
        <div className={styles.info}>
          <div className={styles.name}>{track.track_name}</div>
          <div className={styles.meta}>
            {track.artist_name} · {track.genre_name}
          </div>
        </div>
        <div className={styles.data}>
          <span className={styles.popularity}>
            <span aria-hidden="true">★</span>
            {track.popularity}
          </span>
          <span>{formatDuration(track.duration_ms)}</span>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={handlePlay}
            title="Reproducir"
            aria-label="Reproducir"
          >
            ▶
          </button>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={handleEnqueue}
            title="Agregar a la cola"
            aria-label="Agregar a la cola"
          >
            <ListPlus size={16} aria-hidden="true" />
          </button>
          {isAuthenticated && (
            <>
              <button
                type="button"
                className={`${styles.actionBtn} ${favorite ? styles.actionBtnActive : ''}`}
                onClick={handleFavorite}
                title={favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}
                aria-label={favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}
              >
                ♥
              </button>
              <AddToPlaylistMenu factId={track.fact_id} />
            </>
          )}
        </div>
      </div>
      {toggleError && <ErrorState compact message={toggleError} />}
    </>
  )
}
