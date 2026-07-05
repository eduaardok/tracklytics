import { ChevronUp, ChevronDown, X } from 'lucide-react'
import type { PlayableTrack } from '@shared/context/PlayerContext'
import { AlbumArt } from './AlbumArt'
import styles from './QueuePanel.module.css'

type Props = {
  currentTrack: PlayableTrack
  queue:        PlayableTrack[]
  onRemove:     (index: number) => void
  onMove:       (index: number, direction: -1 | 1) => void
  onClose:      () => void
}

// Panel flotante sobre el PlayerBar — mismo patrón visual que `AddToPlaylistMenu`
// (paquete `catalogo`), pero vive en `shared/` porque la cola es estado del
// propio PlayerContext, sin dependencia de `bibliotecaApi`. Sin
// drag-and-drop (no hay librería de eso en el proyecto): reordenar es
// subir/bajar un puesto por click, suficiente para una cola corta.
export function QueuePanel({ currentTrack, queue, onRemove, onMove, onClose }: Props) {
  return (
    <>
      <button type="button" className={styles.backdrop} aria-label="Cerrar cola" onClick={onClose} />
      <div className={styles.panel} role="dialog" aria-label="Cola de reproducción">
        <div className={styles.section}>
          <span className={styles.sectionLabel}>Reproduciendo ahora</span>
          <div className={styles.row}>
            <AlbumArt src={currentTrack.imagen_url} alt="" size={32} />
            <div className={styles.rowMeta}>
              <span className={styles.rowName}>{currentTrack.track_name}</span>
              <span className={styles.rowArtist}>{currentTrack.artist_name}</span>
            </div>
          </div>
        </div>

        <div className={styles.section}>
          <span className={styles.sectionLabel}>A continuación{queue.length > 0 ? ` (${queue.length})` : ''}</span>
          {queue.length === 0 ? (
            <p className={styles.empty}>La cola está vacía — agrega tracks desde el catálogo o un detalle de canción.</p>
          ) : (
            <ol className={styles.list}>
              {queue.map((track, i) => (
                <li key={`${track.fact_id}-${i}`} className={styles.row}>
                  <AlbumArt src={track.imagen_url} alt="" size={32} />
                  <div className={styles.rowMeta}>
                    <span className={styles.rowName}>{track.track_name}</span>
                    <span className={styles.rowArtist}>{track.artist_name}</span>
                  </div>
                  <div className={styles.rowActions}>
                    <button
                      type="button"
                      className={styles.rowBtn}
                      onClick={() => onMove(i, -1)}
                      disabled={i === 0}
                      aria-label="Subir en la cola"
                      title="Subir"
                    >
                      <ChevronUp size={14} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={styles.rowBtn}
                      onClick={() => onMove(i, 1)}
                      disabled={i === queue.length - 1}
                      aria-label="Bajar en la cola"
                      title="Bajar"
                    >
                      <ChevronDown size={14} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={`${styles.rowBtn} ${styles.rowBtnDanger}`}
                      onClick={() => onRemove(i)}
                      aria-label="Quitar de la cola"
                      title="Quitar"
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </>
  )
}
