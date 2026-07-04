import type { KeyboardEvent, MouseEvent, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePlayer } from '@shared/context/PlayerContext'
import styles from './PlayerBar.module.css'

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function Equalizer({ animated }: { animated: boolean }) {
  return (
    <span className={`${styles.eq} ${animated ? styles.eqAnimated : ''}`} aria-hidden="true">
      <span className={styles.eqBar} />
      <span className={styles.eqBar} />
      <span className={styles.eqBar} />
    </span>
  )
}

type Props = {
  // Slot para acciones reales que dependen del dominio `catalogo` (favorito,
  // agregar a playlist) — PlayerBar vive en `shared/` y no debe importar de
  // `packages/catalogo` (regla de dependencias del proyecto), así que quien
  // lo monta (AppShell) le inyecta el contenido ya resuelto.
  actions?: ReactNode
}

export function PlayerBar({ actions }: Props) {
  const { currentTrack, isPlaying, progressMs, playbackUnavailable, playbackUnavailableReason, togglePlay, seek } = usePlayer()
  const navigate = useNavigate()

  if (!currentTrack) return null

  const total = currentTrack.duration_ms || 180_000
  const pct   = Math.min((progressMs / total) * 100, 100)

  function handleSeek(e: MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const frac = Math.max(0, Math.min((e.clientX - rect.left) / rect.width, 1))
    seek(frac * total)
  }

  // TS no propaga el narrowing del early-return de arriba dentro de esta
  // closure anidada — currentTrack ya está garantizado no-null en este punto.
  function goToDetail() {
    navigate(`/catalogo/track/${currentTrack!.fact_id}`)
  }

  return (
    <div className={styles.bar} role="region" aria-label="Reproductor">
      <div
        className={styles.trackInfo}
        onClick={goToDetail}
        onKeyDown={(e: KeyboardEvent) => e.key === 'Enter' && goToDetail()}
        role="button"
        tabIndex={0}
        aria-label={`Ir al detalle de ${currentTrack.track_name}`}
      >
        <span className={styles.art} aria-hidden="true">
          <Equalizer animated={isPlaying} />
        </span>
        <div className={styles.meta}>
          <span className={styles.name}>{currentTrack.track_name}</span>
          <span className={styles.artist}>{currentTrack.artist_name}</span>
        </div>
      </div>

      <div className={styles.controls}>
        <button
          type="button"
          className={styles.playBtn}
          onClick={togglePlay}
          disabled={playbackUnavailable}
          title={playbackUnavailable ? (playbackUnavailableReason ?? 'No disponible') : undefined}
          aria-label={playbackUnavailable ? (playbackUnavailableReason ?? 'No disponible') : isPlaying ? 'Pausar' : 'Reproducir'}
        >
          {playbackUnavailable ? '⊘' : isPlaying ? '⏸' : '▶'}
        </button>
        {playbackUnavailable ? (
          <span className={playbackUnavailableReason ? styles.blockedReason : styles.time}>
            {playbackUnavailableReason ?? 'No disponible'}
          </span>
        ) : (
          <div className={styles.progress}>
            <span className={styles.time}>{formatMs(progressMs)}</span>
            <div
              className={styles.track}
              onClick={handleSeek}
              role="slider"
              aria-label="Progreso"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={progressMs}
            >
              <div className={styles.fill} style={{ width: `${pct}%` }} />
              <div className={styles.handle} style={{ left: `${pct}%` }} />
            </div>
            <span className={styles.time}>{formatMs(total)}</span>
          </div>
        )}
      </div>

      <div className={styles.actions}>{actions}</div>
    </div>
  )
}
