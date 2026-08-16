import type { KeyboardEvent, MouseEvent, ReactNode } from 'react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Ban, ListMusic, Pause, Play, Repeat, Repeat1, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react'
import { usePlayer, type RepeatMode } from '@shared/context/PlayerContext'
import { AlbumArt } from './AlbumArt'
import { TrackName } from './TrackName'
import { QueuePanel } from './QueuePanel'
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

const REPEAT_CYCLE: Record<RepeatMode, RepeatMode> = { none: 'all', all: 'one', one: 'none' }
const REPEAT_LABEL: Record<RepeatMode, string> = {
  none: 'Repetir (desactivado)',
  all:  'Repetir toda la cola (activado)',
  one:  'Repetir esta canción (activado)',
}

type Props = {
  // Slot para acciones reales que dependen del dominio `catalogo` (favorito,
  // agregar a playlist) — PlayerBar vive en `shared/` y no debe importar de
  // `packages/catalogo` (regla de dependencias del proyecto), así que quien
  // lo monta (AppShell) le inyecta el contenido ya resuelto.
  actions?: ReactNode
}

export function PlayerBar({ actions }: Props) {
  const {
    currentTrack, isPlaying, progressMs, playbackUnavailable, playbackUnavailableReason, togglePlay, seek,
    playNext, playPrevious, hasNext, hasPrevious,
    queue, removeFromQueue, moveInQueue, volume, setVolume,
    repeatMode, setRepeatMode,
  } = usePlayer()
  const navigate = useNavigate()
  const [queueOpen, setQueueOpen] = useState(false)

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
        <span className={styles.art}>
          <AlbumArt src={currentTrack.imagen_url} alt="" size={44} />
          <span className={styles.eqBadge}><Equalizer animated={isPlaying} /></span>
        </span>
        <div className={styles.meta}>
          <span className={styles.name}>
            <TrackName name={currentTrack.track_name} esFeaturing={currentTrack.es_featuring} sourceType={currentTrack.source_type} />
          </span>
          <span className={styles.artist}>{currentTrack.artist_name}</span>
        </div>
      </div>

      <div className={styles.controls}>
        <button
          type="button"
          className={styles.iconBtn}
          onClick={playPrevious}
          disabled={!hasPrevious}
          aria-label="Anterior"
          title="Anterior"
        >
          <SkipBack size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={styles.playBtn}
          onClick={togglePlay}
          disabled={playbackUnavailable}
          title={playbackUnavailable ? (playbackUnavailableReason ?? 'No disponible') : undefined}
          aria-label={playbackUnavailable ? (playbackUnavailableReason ?? 'No disponible') : isPlaying ? 'Pausar' : 'Reproducir'}
        >
          {playbackUnavailable ? (
            <Ban size={16} aria-hidden="true" />
          ) : isPlaying ? (
            <Pause size={16} aria-hidden="true" fill="currentColor" />
          ) : (
            <Play size={16} aria-hidden="true" fill="currentColor" />
          )}
        </button>
        <button
          type="button"
          className={styles.iconBtn}
          onClick={playNext}
          disabled={!hasNext}
          aria-label="Siguiente"
          title="Siguiente"
        >
          <SkipForward size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`${styles.iconBtn} ${repeatMode !== 'none' ? styles.iconBtnActive : ''}`}
          onClick={() => setRepeatMode(REPEAT_CYCLE[repeatMode])}
          aria-label={REPEAT_LABEL[repeatMode]}
          aria-pressed={repeatMode !== 'none'}
          title={REPEAT_LABEL[repeatMode]}
        >
          {repeatMode === 'one' ? <Repeat1 size={16} aria-hidden="true" /> : <Repeat size={16} aria-hidden="true" />}
          {repeatMode === 'all' && <span className={styles.repeatDot} aria-hidden="true" />}
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

      {/* Grupo derecho en un solo contenedor (no columnas flex sueltas): con
          `.bar` como grid de 3 columnas (ver .module.css), esta es la
          columna derecha completa — necesaria para que la columna central
          (controles + progreso) quede realmente centrada en el ancho total
          de la barra, sin importar cuánto ocupe volumen+cola+acciones. */}
      <div className={styles.rightGroup}>
        <div className={styles.volume}>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => setVolume(volume > 0 ? 0 : 0.8)}
            aria-label={volume > 0 ? 'Silenciar' : 'Activar sonido'}
            title={volume > 0 ? 'Silenciar' : 'Activar sonido'}
          >
            {volume > 0 ? <Volume2 size={16} aria-hidden="true" /> : <VolumeX size={16} aria-hidden="true" />}
          </button>
          <input
            type="range"
            className={styles.volumeSlider}
            min={0}
            max={100}
            value={Math.round(volume * 100)}
            onChange={(e) => setVolume(Number(e.target.value) / 100)}
            aria-label="Volumen"
          />
        </div>

        <div className={styles.actions}>
          <div className={styles.queueWrap}>
            <button
              type="button"
              className={`${styles.iconBtn} ${queue.length > 0 ? styles.iconBtnActive : ''}`}
              onClick={() => setQueueOpen((v) => !v)}
              aria-label="Cola de reproducción"
              aria-expanded={queueOpen}
              title="Cola de reproducción"
            >
              <ListMusic size={18} aria-hidden="true" />
              {queue.length > 0 && <span className={styles.queueBadge}>{queue.length}</span>}
            </button>
            {queueOpen && (
              <QueuePanel
                currentTrack={currentTrack}
                queue={queue}
                onRemove={removeFromQueue}
                onMove={moveInQueue}
                onClose={() => setQueueOpen(false)}
              />
            )}
          </div>
          {actions}
        </div>
      </div>
    </div>
  )
}
