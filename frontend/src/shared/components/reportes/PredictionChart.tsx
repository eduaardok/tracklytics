import {
  ComposedChart, Line, ReferenceArea, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { ChartTooltip } from '@shared/components/charts/ChartTooltip'
import { formatTooltipValue } from '@shared/components/charts/format'
import { CHART_COLORS } from '@shared/components/charts/colors'

export type PuntoSerie = { periodo: string; valor: number | null }

type Props = {
  datosReales:       PuntoSerie[]
  datosProyectados:  PuntoSerie[]
  metricaLabel:      string
  altura?:           number
}

const AXIS_TICK = { fill: 'oklch(0.58 0.010 285)', fontSize: 10, fontFamily: 'var(--font-mono)' }
const GRID_STROKE = 'oklch(0.22 0.012 285)'

// Gráfico con proyección (S13-P3b, OT-18) — real primero (línea sólida),
// proyección después (línea punteada + zona sombreada), en la MISMA serie
// combinada para que la línea sea continua en el punto de empalme (el
// último real y el primer proyectado comparten valor).
export function PredictionChart({ datosReales, datosProyectados, metricaLabel, altura = 350 }: Props) {
  const combinado = [
    ...datosReales.map((p) => ({ periodo: p.periodo, real: p.valor, proyectado: null as number | null })),
    ...datosProyectados.map((p, i) => ({
      periodo: p.periodo,
      real: i === 0 ? datosReales[datosReales.length - 1]?.valor ?? null : null,
      proyectado: p.valor,
    })),
  ]
  const inicioZonaProyectada = datosReales[datosReales.length - 1]?.periodo
  const finZonaProyectada = datosProyectados[datosProyectados.length - 1]?.periodo

  return (
    <div style={{ width: '100%', height: altura }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={combinado} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="periodo" tick={AXIS_TICK} axisLine={{ stroke: GRID_STROKE }} tickLine={false} />
          <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={48} allowDecimals={false} />
          <Tooltip
            content={({ active, label, payload }) => {
              if (!active || !payload) return null
              const real = payload.find((p) => p.dataKey === 'real')?.value
              const proyectado = payload.find((p) => p.dataKey === 'proyectado')?.value
              const rows = [
                ...(real != null ? [{ label: metricaLabel, color: CHART_COLORS.violeta, value: formatTooltipValue(real) }] : []),
                ...(proyectado != null ? [{ label: 'Proyección', color: CHART_COLORS.ambar, value: formatTooltipValue(proyectado) }] : []),
              ]
              return <ChartTooltip title={String(label)} rows={rows} />
            }}
          />
          <Legend wrapperStyle={{ fontFamily: 'var(--font-sans)', fontSize: '0.75rem', color: 'var(--color-muted)' }} />
          {inicioZonaProyectada && finZonaProyectada && (
            <ReferenceArea
              x1={inicioZonaProyectada} x2={finZonaProyectada}
              fill={CHART_COLORS.ambar} fillOpacity={0.08}
              label={{ value: 'Proyección', position: 'insideTopRight', fill: 'var(--color-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
            />
          )}
          <Line
            type="monotone" dataKey="real" name={metricaLabel} stroke={CHART_COLORS.violeta} strokeWidth={2}
            dot={{ r: 3, fill: CHART_COLORS.violeta, strokeWidth: 0 }} activeDot={{ r: 5 }}
            connectNulls isAnimationActive={false}
          />
          <Line
            type="monotone" dataKey="proyectado" name="Proyección (4 semanas)" stroke={CHART_COLORS.ambar} strokeWidth={2}
            strokeDasharray="5 5" dot={{ r: 3, fill: CHART_COLORS.ambar, strokeWidth: 0 }}
            connectNulls isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
