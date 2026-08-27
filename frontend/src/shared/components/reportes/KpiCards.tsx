import { memo } from 'react'
import type { LucideIcon } from 'lucide-react'
import { TrendingDown, TrendingUp } from 'lucide-react'
import { InfoHint } from '../InfoHint'
import styles from './KpiCards.module.css'

export type Kpi = {
  label: string
  value: string | number
  trend?: number
  icon?: LucideIcon
  // S17: texto de ayuda opcional (mismo InfoHint que KPICard) — usado cuando
  // el registro de un informe compuesto trae `ayuda`/`descripcion` para uno
  // de sus KPIs de cabecera.
  helpText?: string
}

// Grid de tarjetas de resumen (S13-P3b) — usado por los 30 informes
// compuestos para sus 2-4 KPIs de cabecera.
// `memo` (S14-FINAL, Fase 2.4): evita re-render cuando un hermano de la
// misma página de informe cambia (ej. el filtro Desde/Hasta de ReportLayout
// solo toca `datos`, no `kpis` en algunos informes).
export const KpiCards = memo(function KpiCards({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className={styles.grid}>
      {kpis.map((kpi) => {
        const Icon = kpi.icon
        const tendenciaPositiva = (kpi.trend ?? 0) >= 0
        return (
          <div key={kpi.label} className={styles.card}>
            <div className={styles.cardHead}>
              {Icon && <Icon size={16} className={styles.icon} aria-hidden="true" />}
              <span className={styles.label}>{kpi.label}</span>
              {kpi.helpText && <InfoHint text={kpi.helpText} />}
            </div>
            <div className={styles.valueRow}>
              <span className={styles.value}>{kpi.value}</span>
              {kpi.trend !== undefined && (
                <span className={`${styles.trend} ${tendenciaPositiva ? styles.trendUp : styles.trendDown}`}>
                  {tendenciaPositiva ? <TrendingUp size={13} aria-hidden="true" /> : <TrendingDown size={13} aria-hidden="true" />}
                  {Math.abs(kpi.trend).toFixed(1)}%
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
})
