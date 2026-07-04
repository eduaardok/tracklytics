import { usePlayer } from '@shared/context/PlayerContext'
import { useFavoritos } from '../hooks/useFavoritos'
import { AddToPlaylistMenu } from './AddToPlaylistMenu'
import styles from './PlayerBarActions.module.css'

// Acciones reales del reproductor (favorito + agregar a playlist) — viven en
// `catalogo` porque dependen de `bibliotecaApi`; `PlayerBar` (shared/) recibe
// esto como children/prop en vez de importar el paquete directamente.
export function PlayerBarActions() {
  const { currentTrack } = usePlayer()
  const { isAuthenticated, isFavorite, toggle } = useFavoritos()

  if (!currentTrack || !isAuthenticated) return null

  const favorite = isFavorite(currentTrack.fact_id)

  return (
    <>
      <button
        type="button"
        className={`${styles.actionBtn} ${favorite ? styles.actionBtnActive : ''}`}
        onClick={() => toggle(currentTrack.fact_id)}
        title={favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}
        aria-label={favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}
      >
        ♥
      </button>
      <AddToPlaylistMenu factId={currentTrack.fact_id} />
    </>
  )
}
