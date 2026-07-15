import { RadialBarChart, RadialBar, PolarAngleAxis, ResponsiveContainer } from 'recharts'
import styles from './charts.module.css'

const TRACK_COLOR = 'oklch(0.22 0.012 285)'

// Anillo de progreso (0-100%) — usado donde el dato ES una proporción de un
// total conocido (margen de utilidad, % de presupuesto de campaña consumido):
// un valor semántico de "cuánto de un círculo completo", no una comparación
// entre categorías, que es el caso en el que una barra/dona sirven mejor.
// RadialBarChart no expone una API de "centro de la dona" — el label central
// se superpone con un <div> posicionado absoluto sobre el propio SVG.
export function RadialGauge({
  pct, color, label, size = 132, thickness = 10, valueLabel,
}: {
  pct: number // 0-1, se clampa a [0, 1] para el anillo (un valor >100% se representa lleno + label real)
  color: string
  label: string
  size?: number
  thickness?: number
  valueLabel?: string
}) {
  const clamped = Math.max(0, Math.min(1, pct))
  const data = [{ name: label, value: clamped * 100, fill: color }]

  return (
    <div className={styles.gaugeWrap} style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          data={data}
          startAngle={90}
          endAngle={-270}
          innerRadius="72%"
          outerRadius="100%"
          barSize={thickness}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} axisLine={false} />
          <RadialBar dataKey="value" background={{ fill: TRACK_COLOR }} cornerRadius={thickness / 2} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className={styles.gaugeCenter}>
        <span className={styles.gaugeValue}>{valueLabel ?? `${Math.round(clamped * 100)}%`}</span>
        <span className={styles.gaugeLabel}>{label}</span>
      </div>
    </div>
  )
}
