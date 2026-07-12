import { useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { analiticaApi } from '../api/analitica.api'
import type { TendenciaSemana } from '../types'
import styles from './TendenciasPage.module.css'

const TREND_COLOR = 'oklch(0.70 0.14 195)' // --color-accent — trend/series único, sin necesidad de la paleta categórica

function TrendTooltip({ active, payload, label, formatValue, seriesLabel }: {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string | number
  formatValue: (n: number) => string
  seriesLabel: string
}) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipLabel}>Semana {label}</p>
      <div className={styles.tooltipRow}>
        <span className={styles.tooltipKey} aria-hidden="true" />
        <span className={styles.tooltipName}>{seriesLabel}</span>
        <span className={styles.tooltipValue}>{formatValue(payload[0].value)}</span>
      </div>
    </div>
  )
}

// Un panel por métrica en vez de un solo gráfico con doble eje Y: track_count
// (conteo sin límite superior), avg_popularity (0-100) y avg_energy (0-1) viven
// en escalas incompatibles — combinarlas en un solo eje distorsiona la lectura
// (el "dual-axis" del legacy trends.html es exactamente el anti-patrón que
// esto evita). Small multiples con eje propio por panel, mismo eje X (load_week).
function TrendPanel({ title, data, dataKey, domain, formatValue, seriesLabel }: {
  title:        string
  data:         TendenciaSemana[]
  dataKey:      keyof TendenciaSemana
  domain:       [number, number] | ['auto', 'auto']
  formatValue:  (n: number) => string
  seriesLabel:  string
}) {
  return (
    <div className={styles.panel}>
      <p className={styles.panelTitle}>{title}</p>
      <div className={styles.chartBox}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="oklch(0.22 0.012 285)" vertical={false} />
            <XAxis
              dataKey="load_week"
              tick={{ fill: 'oklch(0.58 0.010 285)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
              axisLine={{ stroke: 'oklch(0.22 0.012 285)' }}
              tickLine={false}
            />
            <YAxis
              domain={domain}
              tick={{ fill: 'oklch(0.58 0.010 285)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
              axisLine={false}
              tickLine={false}
              width={40}
              tickFormatter={formatValue}
            />
            <Tooltip content={<TrendTooltip formatValue={formatValue} seriesLabel={seriesLabel} />} />
            <Line
              type="monotone"
              dataKey={dataKey}
              stroke={TREND_COLOR}
              strokeWidth={2}
              dot={{ r: 4, fill: TREND_COLOR, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export function TendenciasPage() {
  useDocumentTitle('Tendencias semanales')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [range, setRange] = useState<{ desde?: number; hasta?: number }>({})

  const tendencias = useQuery({
    queryKey: ['analitica', 'tendencias', range.desde, range.hasta],
    queryFn:  () => analiticaApi.tendencias(range.desde, range.hasta),
  })

  function applyRange(e: FormEvent) {
    e.preventDefault()
    setRange({
      desde: desde ? Number(desde) : undefined,
      hasta: hasta ? Number(hasta) : undefined,
    })
  }

  function clearRange() {
    setDesde('')
    setHasta('')
    setRange({})
  }

  const data = tendencias.data?.data ?? []

  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>Tendencias semanales</h1>
      <span className={styles.subtitle}>
        {data.length > 0 ? `// ${data.length} semanas` : '// serie temporal por load_week'}
      </span>

      <form className={styles.filterRow} onSubmit={applyRange} noValidate>
        <div className={styles.filterField}>
          <label className={styles.filterLabel} htmlFor="semana-desde">Semana desde</label>
          <input
            id="semana-desde"
            className={styles.filterInput}
            type="number"
            min={1}
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            placeholder="1"
          />
        </div>
        <div className={styles.filterField}>
          <label className={styles.filterLabel} htmlFor="semana-hasta">Semana hasta</label>
          <input
            id="semana-hasta"
            className={styles.filterInput}
            type="number"
            min={1}
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            placeholder="52"
          />
        </div>
        <button type="submit" className={styles.btnPrimary}>Filtrar</button>
        {(range.desde !== undefined || range.hasta !== undefined) && (
          <button type="button" className={styles.btnGhost} onClick={clearRange}>Limpiar</button>
        )}
      </form>

      {tendencias.isLoading && <div className={styles.panel} style={{ minHeight: 200 }} />}

      {tendencias.isError && (
        <div className={styles.panel}>
          <p className={styles.panelError}>No se pudieron cargar las tendencias.</p>
        </div>
      )}

      {!tendencias.isLoading && !tendencias.isError && data.length === 0 && (
        <div className={styles.prompt}>
          <p className={styles.promptText}>Sin datos para el rango seleccionado.</p>
        </div>
      )}

      {data.length > 0 && (
        <div className={styles.grid}>
          <TrendPanel
            title="Volumen de tracks"
            data={data}
            dataKey="track_count"
            domain={['auto', 'auto']}
            formatValue={(n) => n.toLocaleString('es-ES')}
            seriesLabel="Tracks"
          />
          <TrendPanel
            title="Popularidad promedio"
            data={data}
            dataKey="avg_popularity"
            domain={[0, 100]}
            formatValue={(n) => n.toFixed(0)}
            seriesLabel="Popularidad"
          />
          <TrendPanel
            title="Energy promedio"
            data={data}
            dataKey="avg_energy"
            domain={[0, 1]}
            formatValue={(n) => n.toFixed(2)}
            seriesLabel="Energy"
          />
        </div>
      )}
    </section>
  )
}
