import { useRef } from 'react'
import {
  LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'
import { useQuery } from '@tanstack/react-query'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { ExportPDFButton } from '@shared/components/ExportPDFButton'
import { EmptyState } from '@shared/components/EmptyState'
import { analiticaApi } from '../api/analitica.api'
import type { DisponibilidadComponente } from '../types'
import { SkeletonChart } from '@shared/components/SkeletonLoader'
import styles from './DisponibilidadInfraPage.module.css'
import { ErrorState } from '@shared/components/ErrorState'

// Nombre del archivo/componente deliberadamente distinto de `DisponibilidadPage`
// (capability `distribucion`, restricción geográfica de reproducción) — mismo
// texto "Disponibilidad" en español, conceptos de negocio no relacionados
// (uptime de infraestructura vs. licencias de contenido). Ver design.md de
// `completar-modelo-base`.
const TREND_COLOR = 'oklch(0.70 0.14 195)' // --color-accent, mismo color validado que TendenciasPage — serie única por panel, sin paleta categórica nueva.

function DisponibilidadTooltip({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
}) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipLabel}>Semana {label}</p>
      <div className={styles.tooltipRow}>
        <span className={styles.tooltipKey} aria-hidden="true" />
        <span className={styles.tooltipName}>Uptime</span>
        <span className={styles.tooltipValue}>{payload[0].value.toFixed(2)}%</span>
      </div>
    </div>
  )
}

function ComponentePanel({ componente, data }: { componente: string; data: DisponibilidadComponente[] }) {
  return (
    <div className={styles.panel}>
      <p className={styles.panelTitle}>{componente}</p>
      <div className={styles.chartBox}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="oklch(0.22 0.012 285)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="semana"
              tick={{ fill: 'oklch(0.58 0.010 285)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
              axisLine={{ stroke: 'oklch(0.22 0.012 285)' }}
              tickLine={false}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fill: 'oklch(0.58 0.010 285)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
              axisLine={false}
              tickLine={false}
              width={40}
              tickFormatter={(n: number) => `${n}%`}
            />
            <Tooltip content={<DisponibilidadTooltip />} />
            <Line
              type="monotone"
              dataKey="disponibilidad_pct"
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

export function DisponibilidadInfraPage() {
  // FASE 5 (Prompt 10): renombrado visible de "Disponibilidad" (académica,
  // uptime de infraestructura simulado) a "Salud del Sistema" — compartía el
  // mismo nombre en el sidebar que `DisponibilidadPage` (distribución,
  // licencias de contenido por país, negocio real), causando confusión. Solo
  // texto visible: archivo/componente/ruta se mantienen sin cambios (ver
  // comentario de arriba, ya documentaba la distinción con `DisponibilidadPage`).
  useDocumentTitle('Salud del sistema')
  const reportRef = useRef<HTMLElement>(null)
  const disponibilidad = useQuery({
    queryKey: ['analitica', 'disponibilidad'],
    queryFn:  () => analiticaApi.disponibilidad(),
  })

  const data = disponibilidad.data?.data ?? []
  const componentes = Array.from(new Set(data.map((r) => r.componente))).sort()

  return (
    <section className={styles.page} ref={reportRef}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
        <h1 className={styles.heading}>Salud del sistema</h1>
        <ExportPDFButton targetRef={reportRef} fileName="analitica-salud-sistema" title="Salud del sistema" />
      </div>
      <span className={styles.subtitle}>
        {componentes.length > 0 ? `// ${componentes.length} componentes` : '// % de uptime por componente y semana'}
      </span>

      {disponibilidad.isLoading && <div className={styles.panel}><SkeletonChart height={200} /></div>}

      {disponibilidad.isError && (
        <ErrorState message="No se pudo cargar la salud del sistema." />
      )}

      {!disponibilidad.isLoading && !disponibilidad.isError && componentes.length === 0 && (
        <EmptyState icon="◔" title="Sin datos de salud del sistema todavía" />
      )}

      {componentes.length > 0 && (
        <div className={styles.grid}>
          {componentes.map((componente) => (
            <ComponentePanel
              key={componente}
              componente={componente}
              data={data.filter((r) => r.componente === componente)}
            />
          ))}
        </div>
      )}
    </section>
  )
}
