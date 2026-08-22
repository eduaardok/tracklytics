import { Music2 } from 'lucide-react'
import { AlbumArt } from '@shared/components/AlbumArt'
import { genreAccent } from '@shared/lib/genre-colors'
import { PlaylistCollage } from './PlaylistCollage'
import styles from './ExploreGridCard.module.css'

type Props = {
  kind:   'genero' | 'artista' | 'playlist'
  name:   string
  metric: string
  imagenUrl?: string | null
  // Solo playlists sin portada propia: habilita el collage 2×2 con covers de
  // sus tracks (PlaylistCollage) en vez del placeholder vacío ♪.
  albumId?: number
  onClick: () => void
  // Lado de la portada en px (CatalogDiscovery — filas horizontales más
  // compactas que la vista completa) — default 160, el tamaño histórico de
  // esta card en las 3 vistas completas (Artistas/Playlists/Géneros), que
  // no cambian.
  size?: number
  // 'circle' = avatar redondo (artistas en CatalogDiscovery, mismo patrón
  // que cualquier UI de música: personas en círculo, álbumes en cuadrado).
  // Las vistas completas siguen usando 'square' (default), sin cambios.
  shape?: 'square' | 'circle'
}

// Vista de grid de artistas/playlists(álbumes)/géneros (S13-P6) — portada
// prominente arriba, nombre/métrica debajo, mismo patrón visual que
// TrackGridCard (catálogo de canciones). Antes Artistas/Playlists/Géneros
// solo tenían la card compacta de `ExploreRow` (icono de 44px + texto) sin
// alternativa de grid — la auditoría la calificó de "presentación inferior".
export function ExploreGridCard({ kind, name, metric, imagenUrl, albumId, onClick, size, shape = 'square' }: Props) {
  const circular = shape === 'circle'
  const effectiveSize = size ?? 160
  // Collage solo para playlists SIN portada propia y con id conocido — el
  // resto mantiene su render original intacto.
  const useCollage = kind === 'playlist' && !imagenUrl && albumId != null
  return (
    <div
      className={`${styles.card} ${circular ? styles.cardCentered : ''}`}
      style={size ? { width: size } : undefined}
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      role="button"
      tabIndex={0}
    >
      <div className={styles.artWrap} style={size ? { minHeight: size } : undefined}>
        {useCollage ? (
          <PlaylistCollage albumId={albumId} seed={name} size={effectiveSize} />
        ) : kind !== 'genero' ? (
          <AlbumArt src={imagenUrl} alt="" size={size ?? 160} className={`${styles.art} ${circular ? styles.circular : ''}`} />
        ) : (
          <span
            className={`${styles.genreArt} ${circular ? styles.circular : ''}`}
            aria-hidden="true"
            style={{
              backgroundImage: imagenUrl
                ? `linear-gradient(${genreAccent(name, 0.65)}, ${genreAccent(name, 0.65)}), url(${imagenUrl})`
                : undefined,
              backgroundColor: imagenUrl ? undefined : genreAccent(name),
            }}
          >
            {!imagenUrl && <Music2 size={32} />}
          </span>
        )}
      </div>
      <div className={styles.info}>
        <p className={styles.name} title={name}>{name}</p>
        <p className={styles.metric} title={metric}>{metric}</p>
      </div>
    </div>
  )
}
