import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ErrorState } from '@shared/components/ErrorState'
import { distribucionApi } from '../api/distribucion.api'
import styles from './DistribucionPages.module.css'

// Vista mínima temporal (mismo criterio que ArtistaSocialPage/TrackSocialPage en
// `social`): `catalogo` todavía no tiene una vista de detalle de track real en
// React (`TrackCard.tsx` tiene su click deshabilitado, esa migración es trabajo
// de `experiencia`), así que RF-DIS-008 se expone aquí como un lookup manual por
// `fact_id` en vez de integrarse en una vista de track que todavía no existe.
export function DisponibilidadPage() {
  const [factIdInput, setFactIdInput] = useState('')
  const [factId, setFactId] = useState<number | null>(null)

  const consulta = useMutation({
    mutationFn: (id: number) => distribucionApi.disponibilidad(id),
  })

  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>Disponibilidad por país</h1>
      <span className={styles.subtitle}>// consulta si un track está disponible en tu país antes de reproducirlo</span>

      <p className={styles.emptyBody} style={{ marginBottom: 0 }}>
        La navegación desde el catálogo hacia el detalle de un track la construye la capability
        <code> experiencia</code>. Mientras tanto, ingresa el identificador del track:
      </p>
      <form
        className={styles.jumpForm}
        onSubmit={(e) => {
          e.preventDefault()
          const id = Number(factIdInput.trim())
          if (!id) return
          setFactId(id)
          consulta.mutate(id)
        }}
      >
        <input
          className={styles.jumpInput}
          type="number"
          min={1}
          value={factIdInput}
          onChange={(e) => setFactIdInput(e.target.value)}
          placeholder="fact_id del track"
        />
        <button className={styles.btnPrimary} type="submit" disabled={consulta.isPending}>
          {consulta.isPending ? 'Consultando…' : 'Consultar'}
        </button>
      </form>

      {consulta.isError && (
        <ErrorState
          message="No se pudo consultar la disponibilidad (¿track existente? ¿sesión activa?)."
          style={{ marginTop: 'var(--space-lg)' }}
        />
      )}

      {consulta.isSuccess && factId !== null && (
        <div className={styles.resultPanel}>
          <span className={`${styles.badge} ${consulta.data.disponible ? styles.badgeOk : styles.badgeError}`}>
            {consulta.data.disponible ? 'disponible' : 'no disponible'}
          </span>
          <div className={styles.resultText}>
            <span className={styles.resultTitle}>Track #{factId}</span>
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
