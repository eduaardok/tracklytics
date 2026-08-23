import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ZAxis } from 'recharts'
import { CHART_COLORS, STATUS_COLORS } from '@shared/components/charts/colors'
import { formatTooltipValue } from '@shared/components/charts/format'
import type { Reembolso } from '../../types'
import styles from './charts.module.css'

const AXIS_TICK = { fill: 'oklch(0.58 0.010 285)', fontSize: 10, fontFamily: 'var(--font-sans)' }
const GRID_STROKE = 'oklch(0.22 0.012 285)'

function fmtDateShort(iso: string) {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
}

// Dispersión monto × fecha de los reembolsos procesados en el rango — a
// diferencia de una serie de tiempo agregada (línea/barra por día), cada
// punto es un reembolso individual: el objetivo es que un reembolso elevado
// (por encima del umbral que también dispara la alerta "reembolso_elevado")
// salte a la vista como outlier, no que se pierda promediado en un total
// diario.
export function ReembolsosScatter({
  data, umbral, emptyLabel = 'Sin reembolsos procesados en este rango.',
}: {
  data: Reembolso[]
  umbral: number
  emptyLabel?: string
}) {
  if (data.length === 0) return <div className={styles.emptyChart}>{emptyLabel}</div>

  const puntos = data.map((r) => ({
    x: new Date(r.fecha).getTime(),
    y: r.monto,
    fechaLabel: fmtDateShort(r.fecha),
    motivo: r.motivo,
    elevado: r.monto > umbral,
  }))
  const normales = puntos.filter((p) => !p.elevado)
  const elevados = puntos.filter((p) => p.elevado)

  return (
    <div className={styles.chartBox}>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" />
          <XAxis
            dataKey="x" type="number" domain={['dataMin', 'dataMax']}
            tickFormatter={(v) => fmtDateShort(new Date(v).toISOString())}
            tick={AXIS_TICK} axisLine={false} tickLine={false}
          />
          <YAxis dataKey="y" type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} width={56} />
          <ZAxis range={[60, 60]} />
          <Tooltip
            cursor={{ strokeDasharray: '3 3', stroke: GRID_STROKE }}
            content={({ active, payload }) => {
              if (!active || !payload || payload.length === 0) return null
              const p = payload[0].payload as (typeof puntos)[number]
              return (
                <div className={styles.scatterTooltip}>
                  <p className={styles.scatterTooltipTitle}>{p.fechaLabel} · {p.motivo || 'Sin motivo'}</p>
                  <p className={styles.scatterTooltipValue} style={{ color: p.elevado ? STATUS_COLORS.warning : CHART_COLORS.teal }}>
                    {formatTooltipValue(p.y)}{p.elevado ? ' · reembolso elevado' : ''}
                  </p>
                </div>
              )
            }}
          />
          <Scatter data={normales} fill={CHART_COLORS.teal} fillOpacity={0.75} />
          <Scatter data={elevados} fill={STATUS_COLORS.warning} fillOpacity={0.9} shape="diamond" />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}
