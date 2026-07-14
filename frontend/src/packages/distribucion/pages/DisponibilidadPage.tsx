import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ErrorState } from '@shared/components/ErrorState'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { TrackPicker, type TrackSearchResult } from '@shared/components/TrackPicker'
import { apiErrorMessage } from '@shared/lib/api-client'
import { useToast } from '@shared/context/ToastContext'
import { distribucionApi } from '../api/distribucion.api'
import type { EstadoDisponibilidadFiltro } from '../types'
import styles from './DistribucionPages.module.css'

const PAGE_LIMIT = 30

const FILTROS: { value: EstadoDisponibilidadFiltro; label: string }[] = [
  { value: 'todos',       label: 'Todos' },
  { value: 'disponible',  label: 'Disponibles' },
  { value: 'bloqueado',   label: 'Bloqueados' },
]

// RF-DIS-008: además del lookup puntual de un track (TrackPicker, se
// mantiene sin cambios), la vista ahora explora una lista navegable del
// catálogo con su estado por país — antes solo se podía saber si un track
// estaba disponible/bloqueado si ya se conocía su nombre exacto (QA manual,
// change `mejoras-producto-revision-qa`). Nota corregida (QA S10 ronda 2): el
// comentario anterior decía que `catalogo` no tenía vista de detalle de
// track en React todavía y filtraba esa frase directo al texto visible de la
// página — ya existe (`/catalogo/track/:factId`, TrackDetailPage) desde
// hace varias rondas.
export function DisponibilidadPage() {
  useDocumentTitle('Disponibilidad por país')
  const toast = useToast()
  const [selectedTrack, setSelectedTrack] = useState<TrackSearchResult | null>(null)
  const [estado, setEstado] = useState<EstadoDisponibilidadFiltro>('todos')
  const [search, setSearch] = useState('')
  const [page, setPage]     = useState(1)

  const consulta = useMutation({
    mutationFn: (id: number) => distribucionApi.disponibilidad(id),
    onSuccess: (res) => toast.success(res.disponible ? 'Track disponible en tu país' : 'Consulta realizada — track no disponible en tu país'),
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo consultar la disponibilidad.')),
  })

  const lista = useQuery({
    queryKey: ['distribucion', 'disponibilidad-lista', page, estado, search],
    queryFn:  () => distribucionApi.disponibilidadLista({ page, limit: PAGE_LIMIT, estado, search }),
  })
  const filas  = lista.data?.data ?? []
  const total  = lista.data?.total ?? 0

  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>Disponibilidad por país</h1>

      <p className={styles.emptyBody} style={{ marginBottom: 0 }}>
        Consulta un track puntual por nombre o artista:
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

      <p className={styles.sectionLabel} style={{ marginTop: 'var(--space-xl)' }}>
        Explorar el catálogo por estado de disponibilidad
      </p>
      <div className={styles.form}>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="disp-estado">Estado</label>
          <select
            id="disp-estado"
            className={styles.select}
            value={estado}
            onChange={(e) => { setEstado(e.target.value as EstadoDisponibilidadFiltro); setPage(1) }}
          >
            {FILTROS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="disp-search">Buscar (opcional)</label>
          <input
            id="disp-search"
            className={styles.input}
            type="text"
            placeholder="Nombre de track o artista"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
      </div>

      {lista.isError && (
        <ErrorState message="No se pudo cargar la lista de disponibilidad." style={{ marginTop: 'var(--space-lg)' }} />
      )}

      {!lista.isError && (
        <div className={styles.tablePanel}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Track</th>
                <th>Artista</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {lista.isLoading && (
                <tr><td colSpan={3} className={styles.emptyBody}>Cargando…</td></tr>
              )}
              {!lista.isLoading && filas.length === 0 && (
                <tr><td colSpan={3} className={styles.emptyBody}>Sin resultados para este filtro.</td></tr>
              )}
              {filas.map((row) => (
                <tr key={row.fact_id_track}>
                  <td>{row.track_name}</td>
                  <td>{row.artist_name}</td>
                  <td>
                    <span className={`${styles.badge} ${row.disponible ? styles.badgeOk : styles.badgeError}`}>
                      {row.disponible ? 'disponible' : row.tipo_restriccion ?? 'bloqueado'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > PAGE_LIMIT && (
        <div className={styles.jumpForm} style={{ justifyContent: 'flex-end' }}>
          <button type="button" className={styles.btnGhost} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Anterior</button>
          <button type="button" className={styles.btnGhost} disabled={page * PAGE_LIMIT >= total} onClick={() => setPage((p) => p + 1)}>Siguiente →</button>
        </div>
      )}
    </section>
  )
}
