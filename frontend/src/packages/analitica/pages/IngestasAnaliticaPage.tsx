import { useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { ExportPDFButton } from '@shared/components/ExportPDFButton'
import { EmptyState } from '@shared/components/EmptyState'
import { ErrorState } from '@shared/components/ErrorState'
import { SkeletonChart } from '@shared/components/SkeletonLoader'
import { ingestaApi } from '@packages/ingesta/api/ingesta.api'
import type { CargaLog } from '@packages/ingesta/types'
import styles from './IngestasAnaliticaPage.module.css'

const TREND_COLOR = 'oklch(0.70 0.14 195)' // --color-accent, mismo criterio que TendenciasPage

type ChartRow = CargaLog & { run_label: string }

function fmtRunLabel(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function TrendTooltip({ active, payload, label, formatValue, seriesLabel }: {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
  formatValue: (n: number) => string
  seriesLabel: string
}) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipLabel}>{label}</p>
      <div className={styles.tooltipRow}>
        <span className={styles.tooltipKey} aria-hidden="true" />
        <span className={styles.tooltipName}>{seriesLabel}</span>
        <span className={styles.tooltipValue}>{formatValue(payload[0].value)}</span>
      </div>
    </div>
  )
}

// Small multiples (mismo criterio que TendenciasPage): volumen, duración y
// tasa de rechazo viven en escalas incompatibles (conteo sin tope, segundos,
// porcentaje 0-100) — un solo eje Y distorsionaría la lectura.
function TrendPanel({ title, data, dataKey, domain, formatValue, seriesLabel }: {
  title:        string
  data:         ChartRow[]
  dataKey:      keyof ChartRow
  domain:       [number | 'auto', number | 'auto']
  formatValue:  (n: number) => string
  seriesLabel:  string
}) {
  return (
    <div className={styles.panel}>
      <p className={styles.panelTitle}>{title}</p>
      <div className={styles.chartBox}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="oklch(0.22 0.012 285)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="run_label"
              tick={{ fill: 'oklch(0.58 0.010 285)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
              axisLine={{ stroke: 'oklch(0.22 0.012 285)' }}
              tickLine={false}
            />
            <YAxis
              domain={domain}
              tick={{ fill: 'oklch(0.58 0.010 285)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
              axisLine={false}
              tickLine={false}
              width={44}
              tickFormatter={formatValue}
            />
            <Tooltip content={<TrendTooltip formatValue={formatValue} seriesLabel={seriesLabel} />} />
            <Line
              type="monotone"
              dataKey={dataKey as string}
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

// P13/S17 (ComingSoonPage residual): reutiliza `GET /app/v1/ingesta/cargas`
// (el mismo endpoint que EtlPage ya usa para su tabla operativa) — no hay
// backend nuevo. La diferencia real con EtlPage: esto es la vista analítica
// de tendencia entre corridas ("comparativa inter-run"), no la consola
// operativa con acciones de disparo/recalificación.
export function IngestasAnaliticaPage() {
  useDocumentTitle('Ingestas')
  const reportRef = useRef<HTMLElement>(null)

  const cargas = useQuery({
    queryKey: ['analitica', 'ingesta-cargas'],
    queryFn:  () => ingestaApi.cargas(1, 20),
  })

  // CARGAS_HISTORIAL viene ordenado DESC por run_timestamp (más reciente
  // primero, conveniente para una tabla) — un gráfico de tendencia necesita
  // el eje X cronológico ascendente, así que se invierte acá, no en el
  // backend (EtlPage sigue necesitando el orden DESC para su tabla).
  const data: ChartRow[] = [...(cargas.data?.data ?? [])]
    .reverse()
    .map((row) => ({
      ...row,
      // `tasa_rechazo_pct` es `null` cuando `records_read` fue 0 (división
      // por cero en la query) — 0% es el valor honesto para esa corrida (no
      // hubo nada que rechazar), y evita que Recharts reciba `null` en un
      // dataKey tipado como número.
      tasa_rechazo_pct: row.tasa_rechazo_pct ?? 0,
      run_label: fmtRunLabel(row.run_timestamp),
    }))

  const ultima = cargas.data?.ultima_carga

  return (
    <section className={styles.page} ref={reportRef}>
      <div className={styles.headRow} data-pdf-export-ignore="true">
        <div>
          <h1 className={styles.heading}>Ingestas</h1>
          <span className={styles.subtitle}>
            {data.length > 0 ? `// ${data.length} corridas` : '// histórico de ETL: volumen, duración y tasa de error'}
          </span>
        </div>
        <ExportPDFButton targetRef={reportRef} fileName="analitica-ingestas" title="Ingestas" />
      </div>

      {cargas.isLoading && <div className={styles.panel}><SkeletonChart height={200} /></div>}

      {cargas.isError && (
        <ErrorState message="No se pudo cargar el histórico de ingestas." />
      )}

      {!cargas.isLoading && !cargas.isError && data.length === 0 && (
        <EmptyState icon="◔" title="Sin corridas de ETL registradas todavía" />
      )}

      {ultima && (
        <div className={styles.kpiRow}>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Última corrida</span>
            <span className={styles.kpiValue}>{fmtRunLabel(ultima.run_timestamp)}</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Registros leídos</span>
            <span className={styles.kpiValue}>{ultima.records_read.toLocaleString('es')}</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Duración</span>
            <span className={styles.kpiValue}>{fmtDuration(ultima.duration_seconds)}</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Tasa de rechazo</span>
            <span className={`${styles.kpiValue} ${ultima.requiere_revision ? styles.kpiWarn : ''}`}>
              {ultima.tasa_rechazo_pct != null ? `${ultima.tasa_rechazo_pct.toFixed(2)}%` : '—'}
            </span>
          </div>
        </div>
      )}

      {data.length > 0 && (
        <div className={styles.grid}>
          <TrendPanel
            title="Volumen (registros leídos)"
            data={data}
            dataKey="records_read"
            domain={['auto', 'auto']}
            formatValue={(n) => n.toLocaleString('es-ES')}
            seriesLabel="Registros leídos"
          />
          <TrendPanel
            title="Duración de la corrida"
            data={data}
            dataKey="duration_seconds"
            domain={['auto', 'auto']}
            formatValue={(n) => fmtDuration(n)}
            seriesLabel="Duración"
          />
          <TrendPanel
            title="Tasa de rechazo"
            data={data}
            dataKey="tasa_rechazo_pct"
            domain={[0, 'auto']}
            formatValue={(n) => `${n.toFixed(1)}%`}
            seriesLabel="Tasa de rechazo"
          />
        </div>
      )}
    </section>
  )
}
