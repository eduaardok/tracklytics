import { useEffect, useState } from 'react'
import { apiClient } from '@shared/lib/api-client'
import { genreGradient } from '@shared/lib/genre-colors'
import styles from './AlbumArt.module.css'

type Props = {
  src?:        string | null
  alt:         string
  size?:       number
  className?:  string
  // Género del track/álbum (S13 polish visual): sin portada real, en vez de
  // una caja lisa gris se muestra un gradiente determinista por género — más
  // fácil de escanear en la vista grid del catálogo, donde varias filas sin
  // portada real quedarían indistinguibles entre sí.
  genreSeed?:  string
  // Fallback en tiempo real vía Spotify (solo tracks, `track_id` real — sin
  // ambigüedad de búsqueda por nombre). El backfill batch de
  // `etl/gold/portada.py` no llega a todo el catálogo de una sola corrida;
  // si este track todavía no tiene `imagen_url`, se resuelve al vuelo la
  // primera vez que se ve y queda persistido para las próximas.
  trackId?:    string
}

// Cache de proceso (no por componente): evita pedir la misma portada de
// nuevo si el mismo track aparece en varios AlbumArt a la vez (cola,
// PlayerBar, tarjeta) o al re-montar. `null` = ya se intentó y no hubo
// resultado, no reintentar en esta sesión.
const _fallbackCache = new Map<string, string | null>()

// RF-EXP-009: portada real con reemplazo visual local — cero llamada externa
// en el camino de fallback (sin `src`, sin resultado resuelto por el ETL, o
// si la imagen falla al cargar). Mismo look ya usado como placeholder vacío
// en TrackCard antes de esta capability, ahora reutilizado como fallback.
export function AlbumArt({ src, alt, size = 40, className = '', genreSeed, trackId }: Props) {
  const [failed, setFailed] = useState(false)
  const [resolved, setResolved] = useState<string | null>(() =>
    trackId ? _fallbackCache.get(trackId) ?? null : null,
  )

  useEffect(() => {
    if (src || !trackId || _fallbackCache.has(trackId)) return
    let cancelado = false
    apiClient
      .get<{ imagen_url: string | null }>(`/tracks/${trackId}/portada-fallback`)
      .then((res) => {
        _fallbackCache.set(trackId, res.imagen_url)
        if (!cancelado && res.imagen_url) setResolved(res.imagen_url)
      })
      .catch(() => {
        _fallbackCache.set(trackId, null)
      })
    return () => {
      cancelado = true
    }
  }, [src, trackId])

  const effectiveSrc = src || resolved
  const showImage = !!effectiveSrc && !failed

  return (
    <span
      className={`${styles.art} ${className}`}
      style={{
        width: size,
        height: size,
        background: !showImage && genreSeed ? genreGradient(genreSeed) : undefined,
      }}
      aria-hidden={showImage ? undefined : 'true'}
    >
      {showImage ? (
        <img
          src={effectiveSrc}
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
