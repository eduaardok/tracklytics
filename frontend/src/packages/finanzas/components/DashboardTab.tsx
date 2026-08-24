import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ErrorState } from '@shared/components/ErrorState'
import { apiErrorMessage } from '@shared/lib/api-client'
import { CHART_COLORS, STATUS_COLORS } from '@shared/components/charts/colors'
// S16-P11: los KPIs usaban '…' y el gauge "Calculando…" como placeholder —
// ahora shimmer del design system (mismo patrón que el resto de Finanzas).
import { SkeletonChart, SkeletonLoader } from '@shared/components/SkeletonLoader'
import { finanzasApi } from '../api/finanzas.api'
import { RadialGauge } from './charts/RadialGauge'
import { fmtMoney, fmtPct, isoDaysAgo, isoToday } from '../lib/format'
import styles from '../pages/FinanzasPages.module.css'

function Delta({ pct }: { pct: number | null | undefined }) {
  if (pct == null) return null
  const up = pct >= 0
  return (
    <span className={`${styles.kpiDelta} ${up ? styles.kpiDeltaUp : styles.kpiDeltaDown}`}>
      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
    </span>
  )
}

// Dashboard financiero consolidado (CU-O83) — compone /finanzas/dashboard,
// que a su vez compone v1_pnl (analitica) restando gastos y reembolsos.
export function DashboardTab() {
  const [desde, setDesde] = useState(isoDaysAgo(30))
  const [hasta, setHasta] = useState(isoToday())
  const [comparar, setComparar] = useState(false)
  const [desdeComp, setDesdeComp] = useState(isoDaysAgo(60))
  const [hastaComp, setHastaComp] = useState(isoDaysAgo(31))

  const dashboard = useQuery({
    queryKey: ['finanzas', 'dashboard', desde, hasta, comparar, desdeComp, hastaComp],
    queryFn: () => finanzasApi.dashboard({
      desde, hasta,
      desdeComparacion: comparar ? desdeComp : undefined,
      hastaComparacion: comparar ? hastaComp : undefined,
    }),
  })

  const d = dashboard.data
  const delta = d?.delta_pct

  return (
    <>
      <form className={styles.form} onSubmit={(e) => e.preventDefault()}>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="dash-desde">Desde</label>
          <input id="dash-desde" type="date" className={styles.input} value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="dash-hasta">Hasta</label>
          <input id="dash-hasta" type="date" className={styles.input} value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
        <div className={styles.field} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <input id="dash-comparar" type="checkbox" checked={comparar} onChange={(e) => setComparar(e.target.checked)} style={{ accentColor: 'var(--color-primary)', width: 15, height: 15 }} />
          <label htmlFor="dash-comparar" className={styles.fieldLabel} style={{ marginBottom: 0 }}>Comparar periodo</label>
        </div>
        {comparar && (
          <>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="dash-desde-comp">Desde (comparación)</label>
              <input id="dash-desde-comp" type="date" className={styles.input} value={desdeComp} onChange={(e) => setDesdeComp(e.target.value)} />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="dash-hasta-comp">Hasta (comparación)</label>
              <input id="dash-hasta-comp" type="date" className={styles.input} value={hastaComp} onChange={(e) => setHastaComp(e.target.value)} />
            </div>
          </>
        )}
      </form>

      {dashboard.isError && <ErrorState message={apiErrorMessage(dashboard.error, 'No se pudo cargar el dashboard financiero.')} />}

      <div className={styles.dashboardGrid}>
        <div className={styles.kpiPanel}>
          <p className={styles.panelTitle}>Ingresos y utilidad del periodo</p>
          <div className={styles.kpiGrid}>
            <div className={styles.kpiRow}>
              <span className={styles.kpiValueSm}>{dashboard.isLoading ? <SkeletonLoader count={1} height={14} className={styles.kpiSkel} /> : fmtMoney(d?.ingreso_total)}<Delta pct={delta?.ingreso_total} /></span>
              <span className={styles.kpiLabel}>Ingreso total (susc. + publicidad)</span>
            </div>
            <div className={styles.kpiRow}>
              <span className={styles.kpiValueSm}>{dashboard.isLoading ? <SkeletonLoader count={1} height={14} className={styles.kpiSkel} /> : fmtMoney(d?.regalias_pagadas)}<Delta pct={delta?.regalias_pagadas} /></span>
              <span className={styles.kpiLabel}>Regalías pagadas</span>
            </div>
            <div className={styles.kpiRow}>
              <span className={styles.kpiValueSm}>{dashboard.isLoading ? <SkeletonLoader count={1} height={14} className={styles.kpiSkel} /> : fmtMoney(d?.gastos_operativos)}<Delta pct={delta?.gastos_operativos} /></span>
              <span className={styles.kpiLabel}>Gastos operativos</span>
            </div>
            <div className={styles.kpiRow}>
              <span className={styles.kpiValueSm}>{dashboard.isLoading ? <SkeletonLoader count={1} height={14} className={styles.kpiSkel} /> : fmtMoney(d?.reembolsos_procesados)}<Delta pct={delta?.reembolsos_procesados} /></span>
              <span className={styles.kpiLabel}>Reembolsos procesados</span>
            </div>
            <div className={styles.kpiRow}>
              <span className={styles.kpiValueSm}>{dashboard.isLoading ? <SkeletonLoader count={1} height={14} className={styles.kpiSkel} /> : fmtMoney(d?.retiros_regalia_procesados)}<Delta pct={delta?.retiros_regalia_procesados} /></span>
              <span className={styles.kpiLabel}>Retiros de regalía procesados</span>
            </div>
            <div className={styles.kpiRow}>
              <span className={styles.kpiValueSm}>{dashboard.isLoading ? <SkeletonLoader count={1} height={14} className={styles.kpiSkel} /> : fmtMoney(d?.utilidad_estimada)}<Delta pct={delta?.utilidad_estimada} /></span>
              <span className={styles.kpiLabel}>Utilidad estimada</span>
            </div>
          </div>
        </div>

        <div className={styles.gaugePanel}>
          <p className={styles.panelTitle}>Margen de plataforma</p>
          {dashboard.isLoading ? (
            <SkeletonChart height={140} />
          ) : (
            <RadialGauge
              pct={d?.margen ?? 0}
              color={(d?.margen ?? 0) >= 0 ? CHART_COLORS.teal : STATUS_COLORS.error}
              label="utilidad / ingreso"
              valueLabel={fmtPct(d?.margen, { fromRatio: true })}
            />
          )}
        </div>
      </div>
    </>
  )
}
