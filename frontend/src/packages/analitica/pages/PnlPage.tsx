import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { MiniBarChart, type BarDatum } from '@shared/components/charts/MiniBarChart'
import { CHART_COLORS } from '@shared/components/charts/colors'
import { ExportPDFButton } from '@shared/components/ExportPDFButton'
import { analiticaApi } from '../api/analitica.api'
import styles from './PnlPage.module.css'

function isoMesesAtras(n: number): string {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - n)
  return d.toISOString().slice(0, 10)
}

function fmt(n: number): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'USD' }).format(n)
}

// CU-O74 (monetizacion-retencion-mejoras): P&L consolidado — solo staff/admin
// (`require_staff` en backend), reusa MiniBarChart igual que el resto de
// dashboards admin del proyecto.
export function PnlPage() {
  useDocumentTitle('P&L consolidado')
  const reportRef = useRef<HTMLElement>(null)
  const [desde, setDesde] = useState(() => isoMesesAtras(1))
  const [hasta, setHasta] = useState(() => new Date().toISOString().slice(0, 10))

  const pnl = useQuery({
    queryKey: ['analitica', 'pnl', desde, hasta],
    queryFn:  () => analiticaApi.pnl(desde, hasta),
  })

  const data: BarDatum[] = pnl.data
    ? [
        { name: 'Ingreso suscripciones', value: pnl.data.ingreso_suscripciones },
        { name: 'Ingreso publicitario',  value: pnl.data.ingreso_publicitario },
        { name: 'Regalías pagadas',      value: pnl.data.regalias_pagadas },
        { name: 'Margen neto',           value: pnl.data.margen_neto },
      ]
    : []

  return (
    <section className={styles.page} ref={reportRef}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
        <h1 className={styles.heading}>P&L consolidado</h1>
        <ExportPDFButton targetRef={reportRef} fileName="analitica-pnl" title="P&L consolidado" />
      </div>
      <span className={styles.subtitle}>// ingresos, regalías pagadas y margen neto del período</span>

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

      {pnl.isLoading && <div className={styles.panel} style={{ minHeight: 220 }} />}

      {pnl.isError && (
        <div className={styles.panel}>
          <p className={styles.panelError}>No se pudo cargar el P&L consolidado.</p>
        </div>
      )}

      {pnl.data && (
        <>
          <div className={styles.panel}>
            <MiniBarChart data={data} color={CHART_COLORS.teal} />
          </div>

          <div className={styles.kpiRow}>
            <div className={styles.kpiTile}>
              <span className={styles.kpiValue}>{fmt(pnl.data.ingreso_suscripciones)}</span>
              <span className={styles.kpiLabel}>Ingreso suscripciones</span>
            </div>
            <div className={styles.kpiTile}>
              <span className={styles.kpiValue}>{fmt(pnl.data.ingreso_publicitario)}</span>
              <span className={styles.kpiLabel}>Ingreso publicitario</span>
            </div>
            <div className={styles.kpiTile}>
              <span className={styles.kpiValue}>{fmt(pnl.data.regalias_pagadas)}</span>
              <span className={styles.kpiLabel}>Regalías pagadas</span>
            </div>
            <div className={styles.kpiTile}>
              <span className={styles.kpiValue}>{fmt(pnl.data.margen_neto)}</span>
              <span className={styles.kpiLabel}>Margen neto</span>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
