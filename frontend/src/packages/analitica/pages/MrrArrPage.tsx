import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { MiniLineChart } from '@shared/components/charts/MiniLineChart'
import { CHART_COLORS } from '@shared/components/charts/colors'
import { ExportPDFButton } from '@shared/components/ExportPDFButton'
import { analiticaApi } from '../api/analitica.api'
import { SkeletonChart } from '@shared/components/SkeletonLoader'
import styles from './MrrArrPage.module.css'
import { ErrorState } from '@shared/components/ErrorState'

function isoMesesAtras(n: number): string {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - n)
  return d.toISOString().slice(0, 10)
}

function fmt(n: number): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'USD' }).format(n)
}

// CU-O77 (modelo-financiero-simulacion): MRR/ARR — solo staff/admin
// (`require_staff` en backend).
export function MrrArrPage() {
  useDocumentTitle('MRR / ARR')
  const reportRef = useRef<HTMLElement>(null)
  const [desde, setDesde] = useState(() => isoMesesAtras(5))
  const [hasta, setHasta] = useState(() => new Date().toISOString().slice(0, 10))

  const mrr = useQuery({
    queryKey: ['analitica', 'mrr-arr', desde, hasta],
    queryFn:  () => analiticaApi.mrrArr(desde, hasta),
  })

  const tendencia = (mrr.data?.tendencia_mensual ?? []).map((t) => ({ mes: t.mes, ingreso: t.ingreso }))

  return (
    <section className={styles.page} ref={reportRef}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
        <h1 className={styles.heading}>MRR / ARR</h1>
        <ExportPDFButton targetRef={reportRef} fileName="analitica-mrr-arr" title="MRR / ARR" />
      </div>
      <span className={styles.subtitle}>// ingreso recurrente mensual y proyección anual</span>

      <div className={styles.filters} data-pdf-export-ignore="true">
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Desde</span>
          <input type="date" className={styles.input} value={desde} onChange={(e) => setDesde(e.target.value)} />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Hasta</span>
          <input type="date" className={styles.input} value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </label>
      </div>

      {mrr.isLoading && <div className={styles.panel}><SkeletonChart height={220} /></div>}

      {mrr.isError && (
        <ErrorState message="No se pudo cargar MRR/ARR." />
      )}

      {mrr.data && (
        <>
          <div className={styles.kpiRow}>
            <div className={styles.kpiTile}>
              <span className={styles.kpiValue}>{fmt(mrr.data.mrr)}</span>
              <span className={styles.kpiLabel}>MRR — ingreso mensual recurrente</span>
            </div>
            <div className={styles.kpiTile}>
              <span className={styles.kpiValue}>{fmt(mrr.data.arr)}</span>
              <span className={styles.kpiLabel}>ARR — proyección anual</span>
            </div>
          </div>

          <div className={styles.panel}>
            <p className={styles.panelTitle}>Tendencia de ingreso cobrado por mes</p>
            <MiniLineChart
              data={tendencia}
              xKey="mes"
              series={[{ key: 'ingreso', label: 'Ingreso (USD)', color: CHART_COLORS.violeta }]}
            />
          </div>

          <p className={styles.nota}>{mrr.data.nota}</p>
        </>
      )}
    </section>
  )
}
