import { Heart, Share2 } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { usePlayer } from '@shared/context/PlayerContext'
import { useToast } from '@shared/context/ToastContext'
import { apiErrorMessage } from '@shared/lib/api-client'
// Import directo (no vía el barrel `@packages/social`, que exporta
// TrackSocialPage/ModeracionSocialPage — dashboards con Recharts/moderación
// que no deben entrar al bundle principal) — mismo criterio ya documentado
// en AppShell.tsx para NotificationBell/UserMenu/AdBanner.
import { socialApi } from '@packages/social/api/social.api'
import { useFavoritos } from '../hooks/useFavoritos'
import { AddToPlaylistMenu } from './AddToPlaylistMenu'
import styles from './PlayerBarActions.module.css'

// Acciones reales del reproductor (favorito + agregar a playlist + compartir)
// — viven en `catalogo` porque dependen de `bibliotecaApi`; `PlayerBar`
// (shared/) recibe esto como children/prop en vez de importar el paquete
// directamente.
export function PlayerBarActions() {
  const { currentTrack } = usePlayer()
  const { isAuthenticated, isFavorite, toggle } = useFavoritos()
  const toast = useToast()

  // Registra la intención de compartir igual que TrackSocialPage
  // (`socialApi.compartir`, FACT_COMPARTICION) — el enlace que se copia es
  // la ruta real del frontend (`/catalogo/track/:id`), no el dominio
  // simulado `https://tracklytics.app/...` que arma el backend para el
  // texto de X/WhatsApp: acá el objetivo es que "funcione al abrirlo", y
  // el dominio simulado no resuelve en ningún entorno real.
  const compartir = useMutation({
    mutationFn: (factId: number) => socialApi.compartir({ tipo_interaccion_id: 'compartir_track', canal: 'copiar_enlace', fact_id_track: factId }),
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo generar el enlace para compartir.')),
  })

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
        <Heart size={16} aria-hidden="true" fill={favorite ? 'currentColor' : 'none'} />
      </button>
      <AddToPlaylistMenu factId={currentTrack.fact_id} />
      <button
        type="button"
        className={styles.actionBtn}
        disabled={compartir.isPending}
        onClick={() => {
          compartir.mutate(currentTrack.fact_id)
          const enlace = `${window.location.origin}/catalogo/track/${currentTrack.fact_id}`
          navigator.clipboard.writeText(enlace)
            .then(() => toast.success('Enlace copiado'))
            .catch(() => toast.error('No se pudo copiar el enlace.'))
        }}
        title="Copiar enlace de la canción"
        aria-label="Copiar enlace de la canción"
      >
        <Share2 size={16} aria-hidden="true" />
      </button>
    </>
  )
}
