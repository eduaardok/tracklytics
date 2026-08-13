import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { useTheme } from '@shared/context/ThemeContext'
import { ChartTooltip } from './ChartTooltip'
import { formatTooltipValue } from './format'
import styles from './charts.module.css'

export type BarDatum = { name: string; value: number }

// Mismo motivo que MiniLineChart: recharts no resuelve custom properties CSS
// de forma confiable en atributos SVG, así que el eje/grid lee su par
// claro/oscuro directo del ThemeContext.
const AXIS_TICK_BY_THEME = {
  light: { fill: 'oklch(0.46 0.02 285)', fontSize: 10, fontFamily: 'var(--font-sans)' },
  dark:  { fill: 'oklch(0.58 0.010 285)', fontSize: 10, fontFamily: 'var(--font-sans)' },
} as const
const GRID_STROKE_BY_THEME = { light: 'oklch(0.88 0.006 285)', dark: 'oklch(0.22 0.012 285)' } as const

// Bar chart horizontal ranking (top-N) — una sola serie, una barra por
// categoría (país, artista). `layout="vertical"` en recharts = barras
// horizontales, eje de categorías en Y.
export function MiniBarChart({ data, color, emptyLabel = 'Sin datos todavía.' }: { data: BarDatum[]; color: string; emptyLabel?: string }) {
  const { theme } = useTheme()
  const AXIS_TICK = AXIS_TICK_BY_THEME[theme]
  const GRID_STROKE = GRID_STROKE_BY_THEME[theme]

  if (data.length === 0) return <div className={styles.emptyChart}>{emptyLabel}</div>

  return (
    <div className={styles.chartBox} style={{ height: Math.max(220, data.length * 34) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
          <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
          <YAxis type="category" dataKey="name" tick={AXIS_TICK} axisLine={false} tickLine={false} width={110} />
          <Tooltip
            cursor={{ fill: 'oklch(0.64 0.15 290 / 0.08)' }}
            content={({ active, payload }) => {
              if (!active || !payload || payload.length === 0) return null
              const p = payload[0].payload as BarDatum
              return <ChartTooltip rows={[{ label: p.name, color, value: formatTooltipValue(p.value) }]} />
            }}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} isAnimationActive={false}>
            {data.map((d) => <Cell key={d.name} fill={color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
