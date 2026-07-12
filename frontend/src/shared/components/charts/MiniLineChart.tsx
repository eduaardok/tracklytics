import {
  LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { ChartTooltip } from './ChartTooltip'
import { formatTooltipValue } from './format'
import styles from './charts.module.css'

export type LineSeries = { key: string; label: string; color: string }

type Props = {
  data:   Record<string, unknown>[]
  xKey:   string
  series: LineSeries[]
  emptyLabel?: string
}

const AXIS_TICK = { fill: 'oklch(0.58 0.010 285)', fontSize: 10, fontFamily: 'var(--font-mono)' }
const GRID_STROKE = 'oklch(0.22 0.012 285)'

// Line chart de 1-N series — mismo lenguaje visual que DisponibilidadInfraPage
// (analitica), reusado aquí para no repetir la config de ejes/grid en cada
// uno de los 6 dashboards nuevos (RT-04, S10 Día 3).
export function MiniLineChart({ data, xKey, series, emptyLabel = 'Sin datos todavía.' }: Props) {
  if (data.length === 0) return <div className={styles.emptyChart}>{emptyLabel}</div>

  return (
    <div className={styles.chartBox}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID_STROKE} vertical={false} />
          <XAxis dataKey={xKey} tick={AXIS_TICK} axisLine={{ stroke: GRID_STROKE }} tickLine={false} />
          <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={40} allowDecimals={false} />
          <Tooltip
            content={({ active, label, payload }) => {
              if (!active || !payload) return null
              return (
                <ChartTooltip
                  title={String(label)}
                  rows={series.map((s) => ({
                    label: s.label,
                    color: s.color,
                    // `String(value)` (bugfix QA S10 ronda 2) mostraba el float
                    // crudo sin redondear — series de dinero agregadas en
                    // ClickHouse (SUM sobre columnas Float32/Float64) arrastran
                    // ruido de precisión real, ej. "29.969999313354492" en vez
                    // de "29.97". `toLocaleString` con tope de 2 decimales
                    // redondea igual de bien un conteo entero (sin decimales
                    // de más) que un monto.
                    value: formatTooltipValue(payload.find((p) => p.dataKey === s.key)?.value),
                  }))}
                />
              )
            }}
          />
          {series.length > 1 && (
            <Legend wrapperStyle={{ fontFamily: 'var(--font-sans)', fontSize: '0.75rem', color: 'var(--color-muted)' }} />
          )}
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              dot={{ r: 3, fill: s.color, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
