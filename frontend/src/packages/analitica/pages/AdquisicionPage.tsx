import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { analiticaApi } from '../api/analitica.api'
import { TierUpsell } from '../components/TierUpsell'
import { tierInsuficienteInfo } from '../lib/tierError'
import { ExportPDFButton } from '@shared/components/ExportPDFButton'
import { EmptyState } from '@shared/components/EmptyState'
import type { AdquisicionCanal } from '../types'
import { SkeletonChart } from '@shared/components/SkeletonLoader'
import styles from './AdquisicionPage.module.css'

// Tabla (no gráfico de barras apiladas) — evita introducir una paleta
// categórica nueva de 4 colores sin pasar por la validación de contraste del
// skill `dataviz` (ya aplicada a las paletas existentes de 2-3 colores del
// proyecto); design.md de `completar-modelo-base` deja la tabla como opción
// válida para esta vista.
function pivotByCanal(rows: AdquisicionCanal[]) {
  const canales = Array.from(new Set(rows.map((r) => r.canal))).sort()
  const semanas = Array.from(new Set(rows.map((r) => r.semana))).sort()
  const porSemana = new Map<string, Map<string, number>>()
  for (const r of rows) {
    if (!porSemana.has(r.semana)) porSemana.set(r.semana, new Map())
    porSemana.get(r.semana)!.set(r.canal, r.usuarios_nuevos)
  }
  return { canales, semanas, porSemana }
}

export function AdquisicionPage() {
  useDocumentTitle('Adquisición de usuarios')
  const reportRef = useRef<HTMLElement>(null)

  // FASE 6 (Prompt 10): filtro de rango de fechas + canal — antes la tabla
  // pivotada era plana, sin forma de acotarla.
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [canalesActivos, setCanalesActivos] = useState<string[]>([])

  const canalesQuery = useQuery({
    queryKey: ['analitica', 'adquisicion-canales'],
    queryFn:  () => analiticaApi.adquisicionCanales(),
  })
  const canalesDisponibles = canalesQuery.data?.data ?? []

  const adquisicion = useQuery({
    queryKey: ['analitica', 'adquisicion', fechaDesde, fechaHasta, canalesActivos],
    queryFn:  () => analiticaApi.adquisicion({ fechaDesde: fechaDesde || undefined, fechaHasta: fechaHasta || undefined, canales: canalesActivos }),
  })

  function toggleCanal(canal: string) {
    setCanalesActivos((prev) => prev.includes(canal) ? prev.filter((c) => c !== canal) : [...prev, canal])
  }

  function limpiarFiltros() {
    setFechaDesde('')
    setFechaHasta('')
    setCanalesActivos([])
  }

  const hayFiltrosActivos = !!fechaDesde || !!fechaHasta || canalesActivos.length > 0

  const data = adquisicion.data?.data ?? []
  const { canales, semanas, porSemana } = pivotByCanal(data)
  const tierInfo = tierInsuficienteInfo(adquisicion.error)

  return (
    <section className={styles.page} ref={reportRef}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
        <h1 className={styles.heading}>Adquisición de usuarios</h1>
        <ExportPDFButton targetRef={reportRef} fileName="analitica-adquisicion" title="Adquisición de usuarios" />
      </div>
      <span className={styles.subtitle}>
        {semanas.length > 0 ? `// ${semanas.length} semanas` : '// usuarios nuevos por canal de marketing'}
      </span>

      <div className={styles.filters} data-pdf-export-ignore="true">
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Desde</span>
          <input type="date" className={styles.input} value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Hasta</span>
          <input type="date" className={styles.input} value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} />
        </label>
        {canalesDisponibles.length > 0 && (
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Canal</span>
            <div className={styles.canalChips}>
              {canalesDisponibles.map((canal) => (
                <button
                  key={canal}
                  type="button"
                  className={`${styles.canalChip} ${canalesActivos.includes(canal) ? styles.canalChipActive : ''}`}
                  aria-pressed={canalesActivos.includes(canal)}
                  onClick={() => toggleCanal(canal)}
                >
                  {canal}
                </button>
              ))}
            </div>
          </div>
        )}
        {hayFiltrosActivos && (
          <button type="button" className={styles.clearFiltersBtn} onClick={limpiarFiltros}>
            Limpiar filtros
          </button>
        )}
      </div>

      {adquisicion.isLoading && <div className={styles.panel}><SkeletonChart height={200} /></div>}

      {adquisicion.isError && (
        tierInfo ? (
          <TierUpsell tierRequerido={tierInfo.tierRequerido} tierActual={tierInfo.tierActual} />
        ) : (
          <div className={styles.panel}>
            <p className={styles.panelError}>No se pudo cargar la adquisición de usuarios.</p>
          </div>
        )
      )}

      {!adquisicion.isLoading && !adquisicion.isError && semanas.length === 0 && (
        <EmptyState
          icon="◔"
          title={hayFiltrosActivos ? 'Sin resultados para este filtro' : 'Sin datos de adquisición todavía'}
          actionLabel={hayFiltrosActivos ? 'Limpiar filtros' : undefined}
          onAction={hayFiltrosActivos ? limpiarFiltros : undefined}
        />
      )}

      {semanas.length > 0 && (
        <div className={styles.panel}>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>Semana</th>
                  {canales.map((canal) => (
                    <th key={canal} className={styles.th}>{canal}</th>
                  ))}
                  <th className={styles.th}>Total</th>
                </tr>
              </thead>
              <tbody>
                {semanas.map((semana) => {
                  const fila = porSemana.get(semana)!
                  const total = canales.reduce((acc, c) => acc + (fila.get(c) ?? 0), 0)
                  return (
                    <tr key={semana}>
                      <td className={styles.rowLabel}>{semana}</td>
                      {canales.map((canal) => (
                        <td key={canal} className={styles.rowValue}>{fila.get(canal) ?? 0}</td>
                      ))}
                      <td className={styles.rowValue}><strong>{total}</strong></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}
