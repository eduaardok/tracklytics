import { useEffect, useState } from 'react'
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer,
} from 'recharts'
import { AudioLines, Guitar, Mic2, Music2, Smile, Users, Zap, type LucideIcon } from 'lucide-react'
import { useTheme } from '@shared/context/ThemeContext'
import { useReveal } from '@shared/hooks/useReveal'
import { CHART_COLORS } from '@shared/components/charts/colors'
import { InfoHint } from '@shared/components/InfoHint'
import type { AudioFeatures } from '../types'
import styles from './AudioFeaturesPanel.module.css'

type FeatureKey = keyof AudioFeatures

// Mismos 7 atributos y mismos textos de glosario que ya usaba TrackDetailPage
// (etiqueta "Español (English)" + ⓘ) — solo se les suma un ícono y el radar.
// Orden propio (no el de `analitica/lib/audioFeatures.ts`, que arma otros
// gráficos): acá el orden decide la FORMA del radar, se eligió agrupando
// "sensación" (baile/energía/valencia) primero.
const FEATURES: { key: FeatureKey; short: string; label: string; hint: string; Icon: LucideIcon }[] = [
  { key: 'danceability',     short: 'Baile',        label: 'Baile (Danceability)',       hint: 'Qué tan bailable es la canción',              Icon: Music2 },
  { key: 'energy',           short: 'Energía',       label: 'Energía (Energy)',            hint: 'Intensidad y actividad percibida',            Icon: Zap },
  { key: 'valence',          short: 'Valencia',      label: 'Valencia (Valence)',           hint: 'Positividad emocional del sonido',            Icon: Smile },
  { key: 'acousticness',     short: 'Acústica',      label: 'Acústica (Acousticness)',      hint: 'Probabilidad de ser acústica',                Icon: Guitar },
  { key: 'speechiness',      short: 'Habla',         label: 'Habla (Speechiness)',          hint: 'Presencia de palabras habladas',              Icon: Mic2 },
  { key: 'instrumentalness', short: 'Instrumental',  label: 'Instrumental (Instrumentalness)', hint: 'Ausencia de voz (más = instrumental)',     Icon: AudioLines },
  { key: 'liveness',         short: 'En vivo',       label: 'En vivo (Liveness)',           hint: 'Probabilidad de ser una grabación en vivo',   Icon: Users },
]

// Recharts aplica `fill`/`stroke` como atributo SVG crudo y no resuelve
// custom properties CSS de forma confiable ahí (mismo motivo documentado en
// MiniLineChart.tsx y shared/components/charts/colors.ts) — grid/eje llevan
// su propio par claro/oscuro, la serie usa el violeta categórico fijo
// (CHART_COLORS.violeta) que ya se valida contra ambos fondos.
const GRID_BY_THEME  = { light: 'oklch(0.88 0.006 285)', dark: 'oklch(0.22 0.012 285)' } as const
const AXIS_BY_THEME  = { light: 'oklch(0.40 0.02 285)',  dark: 'oklch(0.72 0.010 285)' } as const

function FeatureBar({ label, hint, Icon, value }: { label: string; hint: string; Icon: LucideIcon; value: number }) {
  const pct = Math.round(value * 100)
  // Reveal propio (independiente del panel): la barra nace en 0% y transiciona
  // al valor real apenas monta — un rAF evita que React pinte ya en el ancho
  // final en el mismo frame (sin eso no habría transición que ver). Con
  // prefers-reduced-motion la transition-duration global ya queda en 0.01ms
  // (index.css), así que esto se resuelve como un salto instantáneo, no una
  // animación — nada extra que gatear acá.
  const [revealed, setRevealed] = useState(false)
  useEffect(() => {
    const raf = requestAnimationFrame(() => setRevealed(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className={styles.row}>
      <span className={styles.iconWrap} aria-hidden="true"><Icon size={15} /></span>
      <span className={styles.label}>
        {label}
        <InfoHint text={hint} />
      </span>
      <div className={styles.track}>
        <div className={styles.fill} style={{ width: revealed ? `${pct}%` : '0%' }} />
      </div>
      <span className={styles.value}>{pct}%</span>
    </div>
  )
}

type Props = { data: AudioFeatures }

export function AudioFeaturesPanel({ data }: Props) {
  const { theme } = useTheme()
  const revealRef = useReveal<HTMLDivElement>()

  const radarData = FEATURES.map((f) => ({ feature: f.short, valor: data[f.key] }))

  return (
    <div ref={revealRef} className={`${styles.panel} reveal-base`}>
      {/* El radar da la "forma" del track de un vistazo — las 7 barras de al
          lado dan el valor exacto por atributo, con el mismo glosario que ya
          existía. Ninguna reemplaza a la otra: una es lectura rápida, la otra
          es lectura precisa (feedback: "que tengan más peso, no solo barrita"). */}
      <div className={styles.radarBox}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={radarData} outerRadius="70%">
            <PolarGrid stroke={GRID_BY_THEME[theme]} />
            <PolarAngleAxis
              dataKey="feature"
              tick={{ fill: AXIS_BY_THEME[theme], fontSize: 11, fontFamily: 'var(--font-sans)' }}
            />
            <PolarRadiusAxis domain={[0, 1]} tick={false} axisLine={false} tickCount={3} />
            <Radar
              dataKey="valor"
              stroke={CHART_COLORS.violeta}
              fill={CHART_COLORS.violeta}
              fillOpacity={0.22}
              strokeWidth={2}
              dot={{ r: 3, fill: CHART_COLORS.violeta, strokeWidth: 0 }}
              isAnimationActive
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <div className={styles.list}>
        {FEATURES.map((f) => (
          <FeatureBar key={f.key} label={f.label} hint={f.hint} Icon={f.Icon} value={data[f.key]} />
        ))}
      </div>
    </div>
  )
}
