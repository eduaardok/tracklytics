import type { MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ListPlus } from 'lucide-react'
import { usePlayer } from '@shared/context/PlayerContext'
import { ErrorState } from '@shared/components/ErrorState'
import { ApiError, apiErrorMessage } from '@shared/lib/api-client'
import { useFavoritos } from '../hooks/useFavoritos'
import { bibliotecaApi } from '../api/biblioteca.api'
import type { LibraryTrack } from '../types'
import styles from './LibraryTrackRow.module.css'

function formatDuration(ms: number): string {
  const m = Math.floor(ms / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  return `${m}:${s.toString().padStart(2, '0')}`
}

type Props = {
  track:      LibraryTrack
  position:   number
  timeAgo?:   string
  onRemove?:  () => void
  removeTitle?: string
}

// Fila para favoritos/historial/tracks de playlist — estos endpoints devuelven
// `LibraryTrack` (subconjunto de campos), no un `Track` completo, así que no
// reusa TrackCard directamente.
export function LibraryTrackRow({ track, position, timeAgo, onRemove, removeTitle }: Props) {
  const navigate = useNavigate()
  const { play, reportPlaybackIssue, enqueue } = usePlayer()
  const { isFavorite, toggle, toggleError } = useFavoritos()
  const favorite = isFavorite(track.fact_id)

  function goToDetail() {
    navigate(`/catalogo/track/${track.fact_id}`)
  }

  // Nota (iteración de diseño, bug de portadas): `LibraryTrack` (favoritos/
  // historial/tracks de playlist) no trae `imagen_url` — ninguna query de
  // `api/paquetes/biblioteca/queries.py` la selecciona hoy. `PlayableTrack`
  // queda con `imagen_url: undefined` para estos tracks; `AlbumArt` ya
  // maneja ese caso con su glifo de respaldo (no rompe, solo no muestra
  // foto). Arreglarlo del todo requeriría tocar ese backend — fuera de
  // alcance de este cambio, que es 100% frontend.
  function toPlayable() {
    return {
      fact_id:     track.fact_id,
      track_name:  track.track_name,
      artist_name: track.artist_name,
      duration_ms: track.duration_ms,
    }
  }

  function handlePlay(e: MouseEvent) {
    e.stopPropagation()
    play(toPlayable())
    bibliotecaApi.registrarReproduccion(track.fact_id).catch((err) => {
      if (err instanceof ApiError && err.status === 403) {
        reportPlaybackIssue(apiErrorMessage(err, 'Este track no está disponible.'))
      }
    })
  }

  function handleEnqueue(e: MouseEvent) {
    e.stopPropagation()
    enqueue(toPlayable())
  }

  function handleFavorite(e: MouseEvent) {
    e.stopPropagation()
    toggle(track.fact_id)
  }

  function handleRemove(e: MouseEvent) {
    e.stopPropagation()
    onRemove?.()
  }

  return (
    <>
      <div
        className={styles.row}
        onClick={goToDetail}
        onKeyDown={(e) => e.key === 'Enter' && goToDetail()}
        role="button"
        tabIndex={0}
      >
        <span className={styles.position} aria-hidden="true">{position}</span>
        <div className={styles.info}>
          <div className={styles.name}>{track.track_name}</div>
          <div className={styles.meta}>{track.artist_name} · {track.genre_name}</div>
        </div>
        {timeAgo && <span className={styles.timeAgo}>{timeAgo}</span>}
        <span className={styles.duration}>{formatDuration(track.duration_ms)}</span>
        <div className={styles.actions}>
          <button type="button" className={styles.actionBtn} onClick={handlePlay} title="Reproducir" aria-label="Reproducir">▶</button>
          <button type="button" className={styles.actionBtn} onClick={handleEnqueue} title="Agregar a la cola" aria-label="Agregar a la cola">
            <ListPlus size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`${styles.actionBtn} ${favorite ? styles.actionBtnActive : ''}`}
            onClick={handleFavorite}
            title={favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}
            aria-label={favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}
          >
            ♥
          </button>
          {onRemove && (
            <button
              type="button"
              className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
              onClick={handleRemove}
              title={removeTitle ?? 'Quitar'}
              aria-label={removeTitle ?? 'Quitar'}
            >
              ✕
            </button>
          )}
        </div>
      </div>
      {toggleError && <ErrorState compact message={toggleError} />}
    </>
  )
}
