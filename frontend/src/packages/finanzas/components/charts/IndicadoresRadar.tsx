import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { CHART_COLORS } from '@shared/components/charts/colors'
import styles from './charts.module.css'

const AXIS_TICK = { fill: 'oklch(0.58 0.010 285)', fontSize: 10.5, fontFamily: 'var(--font-sans)' }

function RadarTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className={styles.scatterTooltip}>
      <p className={styles.scatterTooltipTitle}>{label}</p>
      <p className={styles.scatterTooltipValue}>{payload[0].value.toFixed(1)}%</p>
    </div>
  )
}

// Radar de las 3 proporciones del periodo, TODAS en el mismo eje (%) — a
// diferencia de AudioRadarChart (analitica), que compara 6 rasgos ya
// normalizados 0-1 entre dos entidades, aquí solo hay una serie y el eje es
// literalmente el mismo para las 3 puntas: mezclar ARPU (dinero) o el
// ingreso promedio por anunciante (dinero) en este mismo radar sería el
// error de "unidades distintas en un solo eje" que un radar no debe cometer
// — esos dos valores se muestran aparte, como KPI.
export function IndicadoresRadar({
  pctRegalias, pctGastos, crecimiento,
}: {
  pctRegalias: number | null
  pctGastos: number | null
  crecimiento: number | null
}) {
  const data = [
    { eje: 'Regalías / ingreso',  valor: Math.max(0, pctRegalias ?? 0) },
    { eje: 'Gastos / ingreso',    valor: Math.max(0, pctGastos ?? 0) },
    { eje: 'Crecimiento vs. anterior', valor: Math.max(0, crecimiento ?? 0) },
  ]
  const maxDominio = Math.max(20, ...data.map((d) => d.valor)) * 1.15

  return (
    <div className={styles.chartBox}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="70%">
          <PolarGrid stroke="oklch(0.22 0.012 285)" />
          <PolarAngleAxis dataKey="eje" tick={AXIS_TICK} />
          <PolarRadiusAxis domain={[0, maxDominio]} tickCount={3} tick={{ ...AXIS_TICK, fontSize: 9, fontFamily: 'var(--font-mono)' }} axisLine={false} />
          <Radar dataKey="valor" stroke={CHART_COLORS.violeta} fill={CHART_COLORS.violeta} fillOpacity={0.14} strokeWidth={2} dot={{ r: 4, fill: CHART_COLORS.violeta, strokeWidth: 0 }} isAnimationActive={false} />
          <Tooltip content={<RadarTooltip />} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  )
}
