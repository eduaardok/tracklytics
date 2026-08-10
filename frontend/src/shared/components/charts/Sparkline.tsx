import { memo } from 'react'

// SVG puro (sin Recharts) — usada dentro de KPICard, donde puede haber
// varias sparklines por página; evitar N instancias de ResponsiveContainer/
// ResizeObserver de Recharts para un elemento tan pequeño (perf, Fase 2).
type Props = {
  data:   number[]
  color?: string
  width?: number
  height?: number
}

export const Sparkline = memo(function Sparkline({ data, color = 'var(--color-primary-light)', width = 72, height = 24 }: Props) {
  if (data.length < 2) return <svg width={width} height={height} aria-hidden="true" />

  const min = Math.min(...data)
  const max = Math.max(...data)
  const rango = max - min || 1
  const step = width / (data.length - 1)

  const puntos = data.map((v, i) => {
    const x = i * step
    const y = height - ((v - min) / rango) * height
    return [x, y] as const
  })

  const linePath = puntos.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={areaPath} fill={color} fillOpacity={0.12} stroke="none" />
      <path d={linePath} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
})
