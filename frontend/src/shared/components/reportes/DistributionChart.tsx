import { memo } from 'react'
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { ChartTooltip } from '@shared/components/charts/ChartTooltip'
import { formatTooltipValue } from '@shared/components/charts/format'
import { CATEGORICAL_ORDER } from '@shared/components/charts/colors'
import { EmptyState } from '@shared/components/EmptyState'

export type DistribucionDatum = { nombre: string; valor: number }

type Props = {
  datos:  DistribucionDatum[]
  tipo:   'pie' | 'bar' | 'stacked_bar'
  altura?: number
}

const AXIS_TICK = { fill: 'oklch(0.58 0.010 285)', fontSize: 10, fontFamily: 'var(--font-sans)' }
const GRID_STROKE = 'oklch(0.22 0.012 285)'

// Distribución categórica (S13-P3b) — pie para pocas categorías con
// identidad propia (plan, formato), bar/stacked_bar cuando el orden
// (ranking) importa más que la parte-del-todo. Color por posición fija en
// `CATEGORICAL_ORDER` (dataviz skill: "nunca cíclico ni recalculado al
// cambiar el filtro") — la Nº3 de la lista siempre es el mismo color, sin
// importar cuántas categorías haya.
export const DistributionChart = memo(function DistributionChart({ datos, tipo, altura = 280 }: Props) {
  const filtrados = datos.filter((d) => d.valor > 0)
  if (filtrados.length === 0) {
    return <EmptyState icon="( ∅ )" title="Sin datos para esta distribución" body="Prueba ampliando el rango de período." />
  }

  const total = filtrados.reduce((sum, d) => sum + d.valor, 0)
  const conColor = filtrados.map((d, i) => ({ ...d, color: CATEGORICAL_ORDER[i % CATEGORICAL_ORDER.length] }))

  if (tipo === 'pie') {
    return (
      <div style={{ width: '100%', height: altura }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={conColor} dataKey="valor" nameKey="nombre" innerRadius="50%" outerRadius="80%" paddingAngle={2} strokeWidth={0} isAnimationActive={false}>
              {conColor.map((d) => <Cell key={d.nombre} fill={d.color} />)}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0) return null
                const p = payload[0].payload as typeof conColor[number]
                const pct = ((p.valor / total) * 100).toFixed(1)
                return <ChartTooltip rows={[{ label: p.nombre, color: p.color, value: `${formatTooltipValue(p.valor)} (${pct}%)` }]} />
              }}
            />
            <Legend wrapperStyle={{ fontFamily: 'var(--font-sans)', fontSize: '0.75rem', color: 'var(--color-muted)' }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    )
  }

  // 'bar' y 'stacked_bar' (una sola serie de magnitud, ya ordenada por el
  // llamador): mismo color para todas las barras — es un ranking, no
  // identidad categórica, así que no necesita un color por barra.
  return (
    <div style={{ width: '100%', height: Math.max(altura, filtrados.length * 34) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={filtrados} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
          <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
          <YAxis type="category" dataKey="nombre" tick={AXIS_TICK} axisLine={false} tickLine={false} width={110} />
          <Tooltip
            cursor={{ fill: 'oklch(0.64 0.15 290 / 0.06)' }}
            content={({ active, payload }) => {
              if (!active || !payload || payload.length === 0) return null
              const p = payload[0].payload as DistribucionDatum
              return <ChartTooltip rows={[{ label: p.nombre, color: CATEGORICAL_ORDER[0], value: formatTooltipValue(p.valor) }]} />
            }}
          />
          <Bar dataKey="valor" fill={CATEGORICAL_ORDER[0]} radius={[0, 4, 4, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
})
