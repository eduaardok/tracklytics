import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Legend, Tooltip, ResponsiveContainer,
} from 'recharts'
import { AUDIO_FEATURES, type AudioFeatureValues } from '../lib/audioFeatures'
import styles from './AudioRadarChart.module.css'

// Paleta categórica validada (dataviz skill, scripts/validate_palette.js) contra
// la superficie oscura de Tracklytics — más oscura que --color-primary-light/
// --color-accent (que fallan la banda de luminosidad L 0.48-0.67 en modo oscuro)
// pero misma familia de hue (violeta 290° / teal 195°), ΔE 36.7 (deutan) — muy
// por encima del piso de 12. Orden fijo: slot 1 = primera serie, slot 2 = segunda.
export const RADAR_COLOR_A = 'oklch(0.64 0.15 290)' // violeta — serie 1 (artista / género único)
export const RADAR_COLOR_B = 'oklch(0.65 0.14 195)' // teal    — serie 2 (comparación / benchmark)

export type RadarSeries = {
  label:  string
  color:  string
  values: AudioFeatureValues
}

function buildRadarData(series: RadarSeries[]) {
  return AUDIO_FEATURES.map((f) => {
    const row: Record<string, string | number> = { feature: f.label }
    for (const s of series) row[s.label] = s.values[f.key]
    return row
  })
}

function RadarTooltip({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: string
}) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipLabel}>{label}</p>
      {payload.map((p) => (
        <div key={p.name} className={styles.tooltipRow}>
          <span className={styles.tooltipKey} style={{ background: p.color }} aria-hidden="true" />
          <span className={styles.tooltipName}>{p.name}</span>
          <span className={styles.tooltipValue}>{p.value.toFixed(2)}</span>
        </div>
      ))}
    </div>
  )
}

type Props = {
  series: RadarSeries[]
  height?: number
}

export function AudioRadarChart({ series, height = 320 }: Props) {
  const data = buildRadarData(series)

  return (
    <div className={styles.wrap} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="72%">
          <PolarGrid stroke="oklch(0.22 0.012 285)" />
          <PolarAngleAxis
            dataKey="feature"
            tick={{ fill: 'oklch(0.58 0.010 285)', fontSize: 11, fontFamily: 'var(--font-sans)' }}
          />
          <PolarRadiusAxis
            domain={[0, 1]}
            tickCount={3}
            tick={{ fill: 'oklch(0.58 0.010 285)', fontSize: 9, fontFamily: 'var(--font-mono)' }}
            axisLine={false}
          />
          {series.map((s) => (
            <Radar
              key={s.label}
              name={s.label}
              dataKey={s.label}
              stroke={s.color}
              fill={s.color}
              fillOpacity={0.1}
              strokeWidth={2}
              dot={{ r: 4, fill: s.color, strokeWidth: 0 }}
              isAnimationActive={false}
            />
          ))}
          <Tooltip content={<RadarTooltip />} />
          {series.length > 1 && (
            <Legend
              wrapperStyle={{ fontFamily: 'var(--font-sans)', fontSize: '0.8125rem', color: 'var(--color-muted)' }}
            />
          )}
        </RadarChart>
      </ResponsiveContainer>
    </div>
  )
}
