import { useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { ExportPDFButton } from '@shared/components/ExportPDFButton'
import { EmptyState } from '@shared/components/EmptyState'
import { SkeletonCard } from '@shared/components/SkeletonLoader'
import { Sparkline } from '@shared/components/charts/Sparkline'
import { analiticaApi } from '../api/analitica.api'
import type { BscKpi } from '../types'
import styles from './BalancedScorecardPage.module.css'

const SEMAFORO_COLOR: Record<BscKpi['semaforo'], string> = {
  verde:    'var(--color-success)',
  amarillo: 'var(--color-warning)',
  rojo:     'var(--color-error)',
}

function fmtValor(kpi: BscKpi): string {
  const num = kpi.unidad.trim() === 'USD'
    ? new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(kpi.valor_actual)
    : kpi.valor_actual.toLocaleString('es-ES', { maximumFractionDigits: 1 })
  return `${num}${kpi.unidad}`
}

function KpiRow({ kpi }: { kpi: BscKpi }) {
  const color = SEMAFORO_COLOR[kpi.semaforo]
  return (
    <div className={styles.kpiRow}>
      <span className={styles.semaforo} style={{ background: color }} aria-hidden="true" />
      <div className={styles.kpiBody}>
        <div className={styles.kpiHead}>
          <span className={styles.kpiLabel}>{kpi.indicador}</span>
          <span className={styles.kpiValue}>{fmtValor(kpi)}</span>
        </div>
        <div className={styles.progressTrack}>
          <div
            className={styles.progressFill}
            style={{ transform: `scaleX(${Math.max(0, Math.min(100, kpi.porcentaje_meta)) / 100})`, background: color }}
          />
        </div>
        <div className={styles.kpiFoot}>
          <span className={styles.metaLabel}>meta: {kpi.meta} ({kpi.porcentaje_meta.toFixed(0)}%)</span>
          {kpi.tendencia.length > 1 && <Sparkline data={kpi.tendencia} color={color} width={56} height={18} />}
        </div>
      </div>
    </div>
  )
}

// Balanced Scorecard estratégico (S14-FINAL, Fase 6, CU-E01..CU-E07) — 4
// perspectivas clásicas del BSC en cuadrante 2×2, cada KPI con semáforo +
// barra de progreso hacia la meta + sparkline de tendencia (últimos 6
// meses). Solo staff interno (`require_staff` en backend, ver
// `api/paquetes/analitica/bsc.py`) — mismo criterio que reporte-diario/
// churn/pnl/mrr-arr, no un panel de cliente B2B.
export function BalancedScorecardPage() {
  useDocumentTitle('Balanced Scorecard')
  const pageRef = useRef<HTMLElement>(null)
  const { data, isLoading, isError } = useQuery({
    queryKey: ['analitica', 'bsc', 'resumen'],
    queryFn:  analiticaApi.bsc,
  })

  return (
    <section className={styles.page} ref={pageRef}>
      <div className={styles.headTop}>
        <div>
          <h1 className={styles.heading}>Balanced Scorecard</h1>
          <span className={styles.subtitle}>// Tracklytics — visión estratégica de las 4 perspectivas</span>
        </div>
        {data && <ExportPDFButton targetRef={pageRef} fileName="bsc-estrategico" title="Balanced Scorecard" />}
      </div>

      {isLoading && (
        <div className={styles.grid}>
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} height={220} />)}
        </div>
      )}

      {isError && (
        <EmptyState
          icon={<AlertTriangle size={22} aria-hidden="true" />}
          title="No se pudo cargar el Balanced Scorecard"
          body="Reintenta en unos segundos."
        />
      )}

      {data && (
        <div className={styles.grid}>
          {data.perspectivas.map((persp) => (
            <div key={persp.nombre} className={styles.card}>
              <h2 className={styles.cardTitle}>{persp.nombre.toUpperCase()}</h2>
              <div className={styles.kpiList}>
                {persp.kpis.map((kpi) => <KpiRow key={kpi.indicador} kpi={kpi} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
