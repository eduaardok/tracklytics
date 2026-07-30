import {
  ComposedChart, Line, Area, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { ChartTooltip } from '@shared/components/charts/ChartTooltip'
import { formatTooltipValue } from '@shared/components/charts/format'
import type { FilaInforme } from '@packages/reportes/types'

export type TrendSeries = { key: string; label: string; color: string; type?: 'line' | 'area' | 'bar' }

type Props = {
  datos:        FilaInforme[]
  series:       TrendSeries[]
  promedioMovil?: boolean
  altura?:      number
}

const AXIS_TICK = { fill: 'oklch(0.58 0.010 285)', fontSize: 10, fontFamily: 'var(--font-mono)' }
const GRID_STROKE = 'oklch(0.22 0.012 285)'

function conPromedioMovil(datos: FilaInforme[], key: string, ventana = 3): FilaInforme[] {
  return datos.map((fila, i) => {
    const vecinos = datos.slice(Math.max(0, i - ventana + 1), i + 1)
    const valores = vecinos.map((f) => Number(f[key]) || 0)
    const promedio = valores.reduce((a, b) => a + b, 0) / valores.length
    return { ...fila, [`${key}__ma`]: Math.round(promedio * 100) / 100 }
  })
}

// Gráfico de tendencia temporal (S13-P3b) — plantilla compartida por la
// mayoría de los 30 informes compuestos. `ComposedChart` porque distintos
// informes combinan line/area/bar sobre el MISMO eje (nunca un segundo eje Y
// — dataviz skill, "One axis": dos métricas de escala distinta van en dos
// gráficos separados, no en un dual-axis).
export function TrendChart({ datos, series, promedioMovil = false, altura = 350 }: Props) {
  const primeraSerieLinea = series.find((s) => (s.type ?? 'line') === 'line')
  const data = promedioMovil && primeraSerieLinea ? conPromedioMovil(datos, primeraSerieLinea.key) : datos

  return (
    <div style={{ width: '100%', height: altura }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="periodo" tick={AXIS_TICK} axisLine={{ stroke: GRID_STROKE }} tickLine={false} />
          <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={48} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: 'oklch(0.64 0.15 290 / 0.06)', stroke: GRID_STROKE, strokeDasharray: '3 3' }}
            content={({ active, label, payload }) => {
              if (!active || !payload) return null
              const rows = series.map((s) => ({
                label: s.label, color: s.color,
                value: formatTooltipValue(payload.find((p) => p.dataKey === s.key)?.value),
              }))
              if (promedioMovil && primeraSerieLinea) {
                rows.push({
                  label: 'Promedio móvil (3)', color: 'oklch(0.68 0.02 285)',
                  value: formatTooltipValue(payload.find((p) => p.dataKey === `${primeraSerieLinea.key}__ma`)?.value),
                })
              }
              return <ChartTooltip title={String(label)} rows={rows} />
            }}
          />
          {series.length > 1 && (
            <Legend wrapperStyle={{ fontFamily: 'var(--font-sans)', fontSize: '0.75rem', color: 'var(--color-muted)' }} />
          )}
          {series.map((s) => {
            const tipo = s.type ?? 'line'
            if (tipo === 'bar') {
              return <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[3, 3, 0, 0]} isAnimationActive={false} />
            }
            if (tipo === 'area') {
              return (
                <Area
                  key={s.key} type="monotone" dataKey={s.key} name={s.label}
                  stroke={s.color} fill={s.color} fillOpacity={0.15} strokeWidth={2}
                  isAnimationActive={false}
                />
              )
            }
            return (
              <Line
                key={s.key} type="monotone" dataKey={s.key} name={s.label}
                stroke={s.color} strokeWidth={2} dot={{ r: 3, fill: s.color, strokeWidth: 0 }}
                activeDot={{ r: 5 }} isAnimationActive={false}
              />
            )
          })}
          {promedioMovil && primeraSerieLinea && (
            <Line
              type="monotone" dataKey={`${primeraSerieLinea.key}__ma`} name="Promedio móvil (3)"
              stroke="oklch(0.68 0.02 285)" strokeWidth={1.5} strokeDasharray="5 5" dot={false}
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
