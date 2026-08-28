import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { CheckCircle2, Globe, Search, XCircle } from 'lucide-react'
import { ErrorState } from '@shared/components/ErrorState'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { TrackPicker, type TrackSearchResult } from '@shared/components/TrackPicker'
import { apiErrorMessage } from '@shared/lib/api-client'
import { useToast } from '@shared/context/ToastContext'
import { distribucionApi } from '../api/distribucion.api'
import type { EstadoDisponibilidadFiltro } from '../types'
import { SkeletonTableRows } from '@shared/components/SkeletonLoader'
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
    onSuccess: (res) => toast.success(res.disponible ? 'Canción disponible en tu país' : 'Consulta realizada — canción no disponible en tu país'),
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

      <div className={styles.introRow}>
        <span className={styles.introIcon} aria-hidden="true"><Globe size={17} /></span>
        <p className={styles.introText}>
          Las licencias por país y las restricciones de canal deciden qué puede reproducirse dónde.
          Consulta una canción puntual o explora el catálogo completo por estado de disponibilidad.
        </p>
      </div>

      <div className={styles.lookupCard}>
        <div className={styles.lookupHead}>
          <span className={styles.lookupIcon} aria-hidden="true"><Search size={15} /></span>
          <span className={styles.lookupTitle}>Consulta rápida</span>
        </div>
        <p className={styles.lookupSub}>Busca una canción por nombre o artista y verifica su disponibilidad en tu país.</p>
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
              label="Canción"
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
            message="No se pudo consultar la disponibilidad (¿canción existente? ¿sesión activa?)."
            style={{ marginTop: 'var(--space-lg)' }}
          />
        )}

        {consulta.isSuccess && selectedTrack !== null && (
          <div className={styles.resultPanel}>
            <span
              className={`${styles.resultIcon} ${consulta.data.disponible ? styles['resultIcon--ok'] : styles['resultIcon--error']}`}
              aria-hidden="true"
            >
              {consulta.data.disponible ? <CheckCircle2 size={22} /> : <XCircle size={22} />}
            </span>
            <div className={styles.resultText}>
              <span className={styles.resultTitle}>{selectedTrack.track_name}</span>
              <span className={styles.resultMeta}>
                {consulta.data.disponible
                  ? 'Puedes reproducir esta canción en tu país.'
                  : `No disponible en tu país — motivo: ${consulta.data.tipo_restriccion}`}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className={styles.explorerHead}>
        <p className={styles.sectionLabel} style={{ marginBottom: 0 }}>
          Explorar el catálogo por estado de disponibilidad
        </p>
        {!lista.isLoading && !lista.isError && (
          <span className={styles.resultCount}>{total} resultado{total === 1 ? '' : 's'}</span>
        )}
      </div>
      <div className={styles.form} style={{ marginTop: 'var(--space-sm)' }}>
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
            placeholder="Nombre de canción o artista"
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
                <th>Canción</th>
                <th>Artista</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {lista.isLoading && (
                <SkeletonTableRows columns={3} rows={5} />
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
                      {row.disponible
                        ? <><CheckCircle2 size={11} aria-hidden="true" /> Disponible</>
                        : <><XCircle size={11} aria-hidden="true" /> {row.tipo_restriccion ?? 'Bloqueado'}</>}
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
