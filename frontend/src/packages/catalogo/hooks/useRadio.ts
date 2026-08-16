import { useState } from 'react'

import { experienciaApi } from '@packages/experiencia/api/experiencia.api'
import { useToast } from '@shared/context/ToastContext'
import { useAuthPrompt } from '@shared/context/AuthPromptContext'
import { usePlayer, type PlayableTrack } from '@shared/context/PlayerContext'
import { apiErrorMessage } from '@shared/lib/api-client'
import { isAuthenticated } from '@shared/lib/session'

/**
 * "Iniciar radio" desde cualquier track (change p2-descubrimiento-comunidad).
 *
 * Reproduce el primer track similar y REEMPLAZA la cola con el resto: una radio
 * que se acumulara detrás de la cola anterior no sería una radio. El track
 * semilla no se encola porque el backend ya lo excluye — el usuario acaba de
 * pedir "algo parecido a esto", no esto otra vez.
 */
export function useRadio() {
  const [iniciando, setIniciando] = useState(false)
  const { playList } = usePlayer()
  const toast = useToast()
  const authPrompt = useAuthPrompt()

  async function iniciarRadio(factId: number) {
    // GET /experiencia/radio/track/{fact_id} ahora exige sesión (backend) —
    // este chequeo evita el roundtrip. Modal en vez de toast (S16, mismo
    // criterio que `PlayerContext.play`): un CTA real a login/registro en
    // vez de un aviso que se desvanece solo.
    if (!isAuthenticated()) {
      authPrompt('Regístrate gratis o inicia sesión para escuchar radio.')
      return
    }
    setIniciando(true)
    try {
      const r = await experienciaApi.radioDeTrack(factId)
      if (r.data.length === 0) {
        toast.error('No se encontraron canciones similares.')
        return
      }
      const cola: PlayableTrack[] = r.data.map((t) => ({
        fact_id:     t.fact_id,
        track_name:  t.track_name,
        artist_name: t.artist_name,
        // La radio no devuelve duración: el player la resuelve al reproducir,
        // igual que ya hace en la página de recomendaciones.
        duration_ms: 0,
        imagen_url:  t.imagen_url,
      }))
      // `playList` (Fase 1, S16): mismo play(cola[0]) + replaceQueue(cola.slice(1))
      // de siempre, pero ahora también guarda `cola` como snapshot de sesión —
      // sin eso, repeat-all no tendría nada que reencolar al agotar la radio.
      playList(cola)
      toast.success(`Radio de "${r.semilla.track_name}" · ${cola.length} canciones`)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'No se pudo iniciar la radio.'))
    } finally {
      setIniciando(false)
    }
  }

  return { iniciarRadio, iniciando }
}
