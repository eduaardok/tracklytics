import { useQuery } from '@tanstack/react-query'
import { Sparkles } from 'lucide-react'

import { experienciaApi } from '@packages/experiencia/api/experiencia.api'
import { AlbumArt } from '@shared/components/AlbumArt'
import { usePlayer, type PlayableTrack } from '@shared/context/PlayerContext'
import { isAuthenticated } from '@shared/lib/session'

import styles from './MixDiarioCard.module.css'

const PORTADAS_VISIBLES = 4

/**
 * Tarjeta "Tu mix diario" en el home B2C (change p2-descubrimiento-comunidad).
 *
 * El mix es determinista por usuario y día, así que la tarjeta no ofrece
 * "regenerar": eso rompería la promesa de que es *el* mix de hoy. Solo se
 * renderiza con sesión iniciada — sin usuario no hay perfil que mezclar.
 */
export function MixDiarioCard() {
  const autenticado = isAuthenticated()
  const { play, replaceQueue } = usePlayer()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['experiencia', 'mix-diario'],
    queryFn:  () => experienciaApi.mixDiario(),
    enabled:  autenticado,
    // Es estable durante todo el día: no tiene sentido refetch al reenfocar.
    staleTime: 1000 * 60 * 30,
  })

  // Un fallo del mix no debe ensuciar el home: la tarjeta simplemente no
  // aparece y el catálogo sigue siendo perfectamente usable.
  if (!autenticado || isError || (!isLoading && !data?.data?.length)) return null

  function reproducir() {
    if (!data?.data.length) return
    const cola: PlayableTrack[] = data.data.map((t) => ({
      fact_id:     t.fact_id,
      track_name:  t.track_name,
      artist_name: t.artist_name,
      duration_ms: 0,
      imagen_url:  t.imagen_url,
    }))
    play(cola[0])
    replaceQueue(cola.slice(1))
  }

  return (
    <div className={styles.card}>
      <div className={styles.art} aria-hidden="true">
        {isLoading
          ? <div className={styles.artSkel} />
          : data!.data.slice(0, PORTADAS_VISIBLES).map((t, i) => (
              <AlbumArt key={`${t.fact_id}-${i}`} src={t.imagen_url} alt="" size={44} />
            ))}
      </div>

      <div className={styles.info}>
        <span className={styles.label}>
          <Sparkles size={13} aria-hidden="true" /> Tu mix diario
        </span>
        <span className={styles.title}>
          {isLoading ? 'Preparando tu mix…' : `${data!.total} canciones para hoy`}
        </span>
        <span className={styles.meta}>
          {isLoading
            ? ''
            : data!.personalizado
              ? 'Basado en lo que escuchas, con algo nuevo para descubrir'
              : 'Lo más popular ahora mismo — escucha algo y mañana será tuyo'}
        </span>
      </div>

      <button
        type="button"
        className={styles.btn}
        onClick={reproducir}
        disabled={isLoading}
      >
        Reproducir
      </button>
    </div>
  )
}
