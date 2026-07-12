import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { ChartTooltip } from './ChartTooltip'
import styles from './charts.module.css'

export type DonutDatum = { name: string; value: number; color: string }

// Donut categórico — mismo patrón que DataQualityPage (ingesta), reusado en
// los dashboards de creadores/experiencia (S10 Día 3): estado de revisión,
// estado de tickets.
export function MiniDonutChart({ data, emptyLabel = 'Sin datos suficientes.' }: { data: DonutDatum[]; emptyLabel?: string }) {
  const filtered = data.filter((d) => d.value > 0)
  if (filtered.length === 0) return <div className={styles.emptyChart}>{emptyLabel}</div>

  const total = filtered.reduce((sum, d) => sum + d.value, 0)

  return (
    <div className={styles.chartBox}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={filtered} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="80%" paddingAngle={2} strokeWidth={0}>
            {filtered.map((d) => <Cell key={d.name} fill={d.color} />)}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload || payload.length === 0) return null
              const p = payload[0].payload as DonutDatum
              const pct = ((p.value / total) * 100).toFixed(1)
              return <ChartTooltip rows={[{ label: p.name, color: p.color, value: `${p.value} (${pct}%)` }]} />
            }}
          />
          <Legend wrapperStyle={{ fontFamily: 'var(--font-sans)', fontSize: '0.75rem', color: 'var(--color-muted)' }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
