import styles from './charts.module.css'

export type TooltipRow = { label: string; value: string; color: string }

// Tooltip compartido por los 3 charts de shared/components/charts — mismo
// look que el resto de los charts del proyecto (DisponibilidadInfraPage,
// DataQualityPage): caja oscura, key de color + nombre + valor por fila.
export function ChartTooltip({ title, rows }: { title?: string; rows: TooltipRow[] }) {
  if (rows.length === 0) return null
  return (
    <div className={styles.tooltip}>
      {title && <p className={styles.tooltipTitle}>{title}</p>}
      {rows.map((r) => (
        <div className={styles.tooltipRow} key={r.label}>
          <span className={styles.tooltipKey} style={{ background: r.color }} aria-hidden="true" />
          <span className={styles.tooltipName}>{r.label}</span>
          <span className={styles.tooltipValue}>{r.value}</span>
        </div>
      ))}
    </div>
  )
}
