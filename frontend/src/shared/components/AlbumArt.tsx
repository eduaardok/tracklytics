import { useState } from 'react'
import styles from './AlbumArt.module.css'

type Props = {
  src?:       string | null
  alt:        string
  size?:      number
  className?: string
}

// RF-EXP-009: portada real con reemplazo visual local — cero llamada externa
// en el camino de fallback (sin `src`, sin resultado resuelto por el ETL, o
// si la imagen falla al cargar). Mismo look ya usado como placeholder vacío
// en TrackCard antes de esta capability, ahora reutilizado como fallback.
export function AlbumArt({ src, alt, size = 40, className = '' }: Props) {
  const [failed, setFailed] = useState(false)
  const showImage = !!src && !failed

  return (
    <span
      className={`${styles.art} ${className}`}
      style={{ width: size, height: size }}
      aria-hidden={showImage ? undefined : 'true'}
    >
      {showImage ? (
        <img
          src={src}
          alt={alt}
          className={styles.img}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        // Antes era una caja lisa sin ícono — en una lista de varias filas
        // (TrackCard, LibraryTrackRow) eso se lee como un estado de carga que
        // nunca termina, no como "sin portada". Mismo glifo ya usado en los
        // fallbacks de detalle (TrackDetailPage `♪`) para consistencia.
        <span className={styles.fallbackIcon}>♪</span>
      )}
    </span>
  )
}
