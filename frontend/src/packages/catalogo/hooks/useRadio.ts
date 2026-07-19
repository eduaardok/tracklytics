import { useState } from 'react'

import { experienciaApi } from '@packages/experiencia/api/experiencia.api'
import { useToast } from '@shared/context/ToastContext'
import { usePlayer, type PlayableTrack } from '@shared/context/PlayerContext'
import { apiErrorMessage } from '@shared/lib/api-client'

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
  const { play, replaceQueue } = usePlayer()
  const toast = useToast()

  async function iniciarRadio(factId: number) {
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
      play(cola[0])
      replaceQueue(cola.slice(1))
      toast.success(`Radio de "${r.semilla.track_name}" · ${cola.length} canciones`)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'No se pudo iniciar la radio.'))
    } finally {
      setIniciando(false)
    }
  }

  return { iniciarRadio, iniciando }
}
