import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { EyeOff, SearchX } from 'lucide-react'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { apiErrorMessage } from '@shared/lib/api-client'
import { useToast } from '@shared/context/ToastContext'
import { useConfirm } from '@shared/context/ConfirmContext'
import { ExportPDFButton } from '@shared/components/ExportPDFButton'
import { EmptyState } from '@shared/components/EmptyState'
import { ErrorState } from '@shared/components/ErrorState'
import { catalogoApi } from '../api/catalogo.api'
import type { Track } from '../types'
import { SkeletonTableRows } from '@shared/components/SkeletonLoader'
import styles from './AdminTracksPage.module.css'

// Panel admin de takedown de catálogo (change p1-ciclos-vida, rol
// admin_contenido): ocultar un track (DMCA simulado, error editorial) y
// restaurarlo. Los tracks ocultos no aparecen en la búsqueda pública, así que
// se listan aparte para poder restaurarlos.
export function AdminTracksPage() {
  useDocumentTitle('Catálogo · Takedown')
  const reportRef = useRef<HTMLElement>(null)
  const queryClient = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()

  const [q, setQ] = useState('')
  const [buscado, setBuscado] = useState('')

  const resultados = useQuery({
    queryKey: ['catalogo', 'admin', 'search', buscado],
    queryFn: () => catalogoApi.tracksSearch({ q: buscado, limit: 30 }),
    enabled: buscado.trim().length > 0,
  })
  const ocultos = useQuery({
    queryKey: ['catalogo', 'admin', 'ocultos'],
    queryFn: () => catalogoApi.tracksOcultos(),
  })

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ['catalogo', 'admin', 'ocultos'] })
    queryClient.invalidateQueries({ queryKey: ['catalogo', 'admin', 'search'] })
  }

  const ocultar = useMutation({
    mutationFn: (factId: number) => catalogoApi.ocultarTrack(factId),
    onSuccess: () => { invalidar(); toast.success('Track ocultado del catálogo') },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo ocultar el track.')),
  })
  const restaurar = useMutation({
    mutationFn: (factId: number) => catalogoApi.restaurarTrack(factId),
    onSuccess: () => { invalidar(); toast.success('Track restaurado') },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo restaurar el track.')),
  })

  async function pedirOcultar(t: Track) {
    if (await confirm(`"${t.track_name}" dejará de aparecer en búsquedas y en el catálogo público. Seguirá en la base de datos y podrás restaurarlo.`, { title: 'Ocultar del catálogo', danger: true })) {
      ocultar.mutate(t.fact_id)
    }
  }

  const resultadosData: Track[] = resultados.data?.data ?? []
  const ocultosData: Track[] = ocultos.data?.data ?? []

  return (
    <section className={styles.page} ref={reportRef}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
        <h1 className={styles.heading}>Takedown de catálogo</h1>
        <ExportPDFButton targetRef={reportRef} fileName="catalogo-takedown" title="Takedown de catálogo" />
      </div>
      <p className={styles.intro}>Oculta un track del catálogo público (DMCA, error editorial) o restaura uno retirado. El track nunca se borra: solo cambia su disponibilidad.</p>

      <p className={styles.sectionLabel}>Buscar un track para ocultar</p>
      <form className={styles.searchBar} onSubmit={(e) => { e.preventDefault(); setBuscado(q) }} data-pdf-export-ignore="true">
        <input className={styles.input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre del track o artista…" aria-label="Buscar track" />
        <button type="submit" className={styles.btnPrimary} disabled={!q.trim()}>Buscar</button>
      </form>

      {buscado.trim() && (
        <div className={styles.tablePanel}>
          <table className={styles.table}>
            <thead><tr><th>Track</th><th>Artista</th><th className={styles.actionsCol}>Acción</th></tr></thead>
            <tbody>
              {resultados.isLoading ? (
                /* S16-P11: "Buscando…" plano -> filas shimmer (patrón admin). */
                <SkeletonTableRows columns={3} rows={4} />
              ) : resultados.isError ? (
                <tr><td colSpan={3}><ErrorState compact message="No se pudo buscar — la falla puede ser de red, no ausencia de resultados." /></td></tr>
              ) : resultadosData.length === 0 ? (
                <tr><td colSpan={3}><EmptyState icon={<SearchX size={22} aria-hidden="true" />} title={`Sin resultados para «${buscado}»`} /></td></tr>
              ) : resultadosData.map((t) => (
                <tr key={t.fact_id}>
                  <td>{t.track_name}</td><td>{t.artist_name}</td>
                  <td className={styles.actionsCol}>
                    <button className={styles.btnGhostDanger} onClick={() => pedirOcultar(t)}>Ocultar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className={styles.sectionLabel} style={{ marginTop: 'var(--space-xl)' }}>Tracks ocultos ({ocultosData.length})</p>
      <div className={styles.tablePanel}>
        <table className={styles.table}>
          <thead><tr><th>Track</th><th>Artista</th><th className={styles.actionsCol}>Acción</th></tr></thead>
          <tbody>
            {ocultos.isLoading ? (
              <SkeletonTableRows columns={3} rows={5} />
            ) : ocultos.isError ? (
              <tr><td colSpan={3}><ErrorState compact message="No se pudo cargar la lista de tracks ocultos." /></td></tr>
            ) : ocultosData.length === 0 ? (
              <tr><td colSpan={3}><EmptyState icon={<EyeOff size={22} aria-hidden="true" />} title="No hay tracks ocultos" /></td></tr>
            ) : ocultosData.map((t) => (
              <tr key={t.fact_id}>
                <td>{t.track_name}</td><td>{t.artist_name}</td>
                <td className={styles.actionsCol}>
                  <button className={styles.btnGhost} onClick={() => restaurar.mutate(t.fact_id)} disabled={restaurar.isPending}>Restaurar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
