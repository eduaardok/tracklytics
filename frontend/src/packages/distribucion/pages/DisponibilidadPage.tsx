import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ErrorState } from '@shared/components/ErrorState'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { TrackPicker, type TrackSearchResult } from '@shared/components/TrackPicker'
import { distribucionApi } from '../api/distribucion.api'
import styles from './DistribucionPages.module.css'

// Vista mínima temporal (mismo criterio que ArtistaSocialPage/TrackSocialPage en
// `social`): `catalogo` todavía no tiene una vista de detalle de track real en
// React (`TrackCard.tsx` tiene su click deshabilitado, esa migración es trabajo
// de `experiencia`), así que RF-DIS-008 se expone aquí como un lookup manual —
// ahora por búsqueda de nombre/artista (TrackPicker) en vez de `fact_id` crudo.
export function DisponibilidadPage() {
  useDocumentTitle('Disponibilidad por país')
  const [selectedTrack, setSelectedTrack] = useState<TrackSearchResult | null>(null)

  const consulta = useMutation({
    mutationFn: (id: number) => distribucionApi.disponibilidad(id),
  })

  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>Disponibilidad por país</h1>

      <p className={styles.emptyBody} style={{ marginBottom: 0 }}>
        La navegación desde el catálogo hacia el detalle de un track la construye la capability
        <code> experiencia</code>. Mientras tanto, busca el track:
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
