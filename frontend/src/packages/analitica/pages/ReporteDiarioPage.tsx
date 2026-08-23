import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { EmptyState } from '@shared/components/EmptyState'
import { analiticaApi } from '../api/analitica.api'
import { SkeletonChart } from '@shared/components/SkeletonLoader'
import styles from './ReporteDiarioPage.module.css'

const fmt = (n: number) => n.toLocaleString('es-ES')

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function StatusPill({ status }: { status: string }) {
  const ok = status === 'success'
  return <span className={`${styles.statusPill} ${ok ? styles.statusOk : styles.statusError}`}>{status}</span>
}

// "Descargar PDF" = window.print() + @media print (oculta sidebar/nav, fuerza
// fondo blanco) — igual que app/analytics/reporte-diario.html legacy, que
// tampoco usa jsPDF ni ninguna librería real de generación de PDF. Un export
// real client-side (sin pasar por el diálogo de impresión del navegador)
// queda fuera de alcance de este bloque — ver docs/decisiones-refactorizacion.md.
export function ReporteDiarioPage() {
  useDocumentTitle('Reporte diario operativo')
  const [fecha, setFecha] = useState(todayISO())

  const reporte = useQuery({
    queryKey: ['analitica', 'reporte-diario', fecha],
    queryFn:  () => analiticaApi.reporteDiario(fecha),
  })

  const data = reporte.data

  return (
    <section className={styles.page}>
      <div className={styles.headRow}>
        <div>
          <h1 className={styles.heading}>Reporte diario operativo</h1>
          <span className={styles.subtitle}>{data ? `// ${data.fecha}` : '// ingestas y engagement del día'}</span>
        </div>
        <div className={styles.headActions}>
          <input
            className={styles.dateInput}
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            aria-label="Fecha del reporte"
          />
          <button type="button" className={styles.btnPrimary} onClick={() => window.print()}>
            Descargar PDF
          </button>
        </div>
      </div>

      {reporte.isLoading && <div className={styles.panel}><SkeletonChart height={160} /></div>}

      {reporte.isError && (
        <div className={styles.panel}>
          <p className={styles.panelError}>No se pudo cargar el reporte diario.</p>
        </div>
      )}

      {data && (
        <>
          <p className={styles.sectionLabel}>Ingestas</p>
          <div className={styles.kpiGrid}>
            <div className={styles.panel}>
              <div className={styles.kpiLabel}>Corridas</div>
              <div className={styles.kpiValue}>{fmt(data.ingestas.corridas)}</div>
            </div>
            <div className={styles.panel}>
              <div className={styles.kpiLabel}>Records leídos</div>
              <div className={styles.kpiValue}>{fmt(data.ingestas.records_read)}</div>
            </div>
            <div className={styles.panel}>
              <div className={styles.kpiLabel}>Records insertados</div>
              <div className={styles.kpiValue}>{fmt(data.ingestas.records_inserted)}</div>
            </div>
            <div className={styles.panel}>
              <div className={styles.kpiLabel}>Records rechazados</div>
              <div className={styles.kpiValue}>{fmt(data.ingestas.records_rejected)}</div>
            </div>
          </div>

          {data.ingestas.statuses.length > 0 && (
            <div className={styles.statusRow}>
              {data.ingestas.statuses.map((s, i) => <StatusPill key={i} status={s} />)}
            </div>
          )}

          <p className={styles.sectionLabel} style={{ marginTop: 'var(--space-xl)' }}>Engagement por tipo</p>
          {data.engagement_por_tipo.length === 0 ? (
            <EmptyState icon="◔" title="Sin eventos de engagement registrados este día" />
          ) : (
            <div className={styles.panel}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.thLeft}>Tipo de evento</th>
                    <th className={styles.thRight}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.engagement_por_tipo.map((row) => (
                    <tr key={row.event_type}>
                      <td className={styles.rowLabel}>{row.event_type}</td>
                      <td className={styles.rowValue}>{fmt(row.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className={styles.notaBanner}>
            <p className={styles.notaText}>{data.nota}</p>
          </div>
        </>
      )}
    </section>
  )
}
