import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ErrorState } from '@shared/components/ErrorState'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { TrackPicker, type TrackSearchResult } from '@shared/components/TrackPicker'
import { apiErrorMessage } from '@shared/lib/api-client'
import { useToast } from '@shared/context/ToastContext'
import { distribucionApi } from '../api/distribucion.api'
import styles from './DistribucionPages.module.css'

// RF-DIS-008: lookup manual de disponibilidad por país — el usuario busca el
// track por nombre/artista (TrackPicker) en vez de escribir un `fact_id`
// crudo. Nota corregida (QA S10 ronda 2): el comentario anterior decía que
// `catalogo` no tenía vista de detalle de track en React todavía y filtraba
// esa frase directo al texto visible de la página — ya existe
// (`/catalogo/track/:factId`, TrackDetailPage) desde hace varias rondas.
export function DisponibilidadPage() {
  useDocumentTitle('Disponibilidad por país')
  const toast = useToast()
  const [selectedTrack, setSelectedTrack] = useState<TrackSearchResult | null>(null)

  const consulta = useMutation({
    mutationFn: (id: number) => distribucionApi.disponibilidad(id),
    onSuccess: (res) => toast.success(res.disponible ? 'Track disponible en tu país' : 'Consulta realizada — track no disponible en tu país'),
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo consultar la disponibilidad.')),
  })

  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>Disponibilidad por país</h1>

      <p className={styles.emptyBody} style={{ marginBottom: 0 }}>
        Busca el track por nombre o artista, y selecciónalo de la lista de sugerencias:
      </p>
      <form
        className={styles.jumpForm}
        style={{ alignItems: 'flex-end' }}
        onSubmit={(e) => {
          e.preventDefault()
          if (!selectedTrack) return
          consulta.mutate(selectedTrack.fact_id)
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <TrackPicker
            label="Track"
            selected={selectedTrack}
            onSelect={setSelectedTrack}
            onClear={() => setSelectedTrack(null)}
          />
        </div>
        <button className={styles.btnPrimary} type="submit" disabled={!selectedTrack || consulta.isPending}>
          {consulta.isPending ? 'Consultando…' : 'Consultar'}
        </button>
      </form>

      {consulta.isError && (
        <ErrorState
          message="No se pudo consultar la disponibilidad (¿track existente? ¿sesión activa?)."
          style={{ marginTop: 'var(--space-lg)' }}
        />
      )}

      {consulta.isSuccess && selectedTrack !== null && (
        <div className={styles.resultPanel}>
          <span className={`${styles.badge} ${consulta.data.disponible ? styles.badgeOk : styles.badgeError}`}>
            {consulta.data.disponible ? 'disponible' : 'no disponible'}
          </span>
          <div className={styles.resultText}>
            <span className={styles.resultTitle}>{selectedTrack.track_name}</span>
            <span className={styles.resultMeta}>
              {consulta.data.disponible
                ? 'Puedes reproducir este track en tu país.'
                : `No disponible en tu país — motivo: ${consulta.data.tipo_restriccion}`}
            </span>
          </div>
        </div>
      )}
    </section>
  )
}
