import { memo } from 'react'
import type { LucideIcon } from 'lucide-react'
import { TrendingDown, TrendingUp } from 'lucide-react'
import { Sparkline } from './charts/Sparkline'
import styles from './KPICard.module.css'

type Props = {
  title:          string
  value:          string | number
  delta?:         number
  deltaLabel?:    string
  sparklineData?: number[]
  icon?:          LucideIcon
}

// Card de KPI premium (S14-FINAL) — número grande + delta con flecha +
// sparkline de tendencia. Distinto de `reportes/KpiCards.tsx` (que no lleva
// sparkline, usado por los 30 informes compuestos con datos ya agregados a
// un solo valor); este componente es para superficies con serie temporal
// disponible (BSC, dashboards nuevos).
export const KPICard = memo(function KPICard({ title, value, delta, deltaLabel, sparklineData, icon: Icon }: Props) {
  const esPositivo = (delta ?? 0) >= 0

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        {Icon && <Icon size={16} className={styles.icon} aria-hidden="true" />}
        <span className={styles.title}>{title}</span>
      </div>
      <div className={styles.value}>{value}</div>
      <div className={styles.footRow}>
        {delta !== undefined && (
          <span className={`${styles.delta} ${esPositivo ? styles.deltaUp : styles.deltaDown}`}>
            {esPositivo ? <TrendingUp size={13} aria-hidden="true" /> : <TrendingDown size={13} aria-hidden="true" />}
            {esPositivo ? '+' : ''}{delta.toFixed(1)}%
            {deltaLabel && <span className={styles.deltaLabel}>{deltaLabel}</span>}
          </span>
        )}
        {sparklineData && sparklineData.length > 1 && (
          <Sparkline
            data={sparklineData}
            color={esPositivo ? 'var(--color-success)' : 'var(--color-error)'}
          />
        )}
      </div>
    </div>
  )
})
