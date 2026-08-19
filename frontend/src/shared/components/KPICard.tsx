import { memo } from 'react'
import type { LucideIcon } from 'lucide-react'
import { TrendingDown, TrendingUp } from 'lucide-react'
import { useCountUp } from '@shared/hooks/useCountUp'
import { Sparkline } from './charts/Sparkline'
import styles from './KPICard.module.css'

type Props = {
  title:          string
  value:          string | number
  delta?:         number
  deltaLabel?:    string
  sparklineData?: number[]
  icon?:          LucideIcon
  // S16 Fase 3 (hero de CatalogPage): cuenta desde 0 hasta `value` en vez de
  // mostrarlo estático — solo tiene efecto si `value` es number (un string
  // ya formateado, ej. "$1.2M", no tiene un punto de partida numérico que
  // animar). `formatValue` da el formato final (ej. toLocaleString) sin que
  // el conteo intermedio también lo lleve — ahorra parsear/reformatear en
  // cada frame.
  animate?:       boolean
  formatValue?:   (n: number) => string
}

// Card de KPI premium (S14-FINAL) — número grande + delta con flecha +
// sparkline de tendencia. Distinto de `reportes/KpiCards.tsx` (que no lleva
// sparkline, usado por los 30 informes compuestos con datos ya agregados a
// un solo valor); este componente es para superficies con serie temporal
// disponible (BSC, dashboards nuevos).
export const KPICard = memo(function KPICard({ title, value, delta, deltaLabel, sparklineData, icon: Icon, animate, formatValue }: Props) {
  const esPositivo = (delta ?? 0) >= 0
  const numericTarget = animate && typeof value === 'number' ? value : undefined
  const counted = useCountUp(numericTarget)
  const displayValue = numericTarget != null
    ? (formatValue ? formatValue(counted) : counted.toLocaleString('es'))
    : value

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        {Icon && <Icon size={16} className={styles.icon} aria-hidden="true" />}
        <span className={styles.title}>{title}</span>
      </div>
      <div className={styles.value}>{displayValue}</div>
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
