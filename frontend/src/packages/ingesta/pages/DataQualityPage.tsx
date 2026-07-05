import { useQuery } from '@tanstack/react-query'
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { EmptyState } from '@shared/components/EmptyState'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { ingestaApi } from '../api/ingesta.api'
import styles from './DataQualityPage.module.css'

const fmt = (n: number) => n.toLocaleString('es-ES')

function fmtDate(iso: string) {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })
}

// Paleta categórica validada (dataviz skill, scripts/validate_palette.js,
// mismo criterio que AudioRadarChart en `analitica`) para 3 series contra la
// superficie oscura real de la app — violeta/teal ya validados en el bloque
// de analitica, más un tercer tono ámbar para `user_uploaded`.
const SOURCE_COLORS = {
  real:          'oklch(0.64 0.15 290)',
  synthetic:     'oklch(0.65 0.14 195)',
  user_uploaded: 'oklch(0.62 0.16 70)',
}

function DonutTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; payload: { pct: number; color: string } }> }) {
  if (!active || !payload || payload.length === 0) return null
  const p = payload[0]
  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipRow}>
        <span className={styles.tooltipKey} style={{ background: p.payload.color }} aria-hidden="true" />
        <span className={styles.tooltipName}>{p.name}</span>
        <span className={styles.tooltipValue}>{fmt(p.value)} ({p.payload.pct.toFixed(1)}%)</span>
      </div>
    </div>
  )
}

// Referencia: app/analytics/data-quality.html — que solo grafica Real vs.
// Sintético e ignora `user_uploaded_records`/`user_uploaded_pct`, aunque el
// backend ya los devuelve (`GET /data-quality`, router.py:141,144). Se cierra
// ese gap acá: las 3 categorías (incluye tracks subidos por artistas,
// `creadores`) en vez de solo 2.
export function DataQualityPage() {
  useDocumentTitle('Calidad de datos')
  const quality = useQuery({
    queryKey: ['ingesta', 'data-quality'],
    queryFn:  () => ingestaApi.dataQuality(),
  })

  const data = quality.data

  const donutData = data
    ? [
        { name: 'Real',                value: data.real_records,          pct: data.real_pct,          color: SOURCE_COLORS.real },
        { name: 'Sintético',            value: data.synthetic_records,     pct: data.synthetic_pct,     color: SOURCE_COLORS.synthetic },
        { name: 'Subido por artista',   value: data.user_uploaded_records, pct: data.user_uploaded_pct, color: SOURCE_COLORS.user_uploaded },
      ].filter((d) => d.value > 0)
    : []

  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>Calidad de datos</h1>

      {quality.isLoading && <div className={styles.panel} style={{ minHeight: 200 }} />}
      {quality.isError && (
        <div className={styles.panel}><p className={styles.errorText}>No se pudo cargar la calidad de datos.</p></div>
      )}

      {data && (
        <>
          <div className={styles.grid}>
            <div className={styles.panel}>
              <p className={styles.panelTitle}>Distribución por origen</p>
              <div className={styles.donutBox}>
                {donutData.length === 0 ? (
                  <EmptyState icon="◔" title="Sin datos suficientes" body="Todavía no hay tracks cargados para graficar." />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={donutData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius="55%"
                        outerRadius="80%"
                        paddingAngle={2}
                        strokeWidth={0}
                      >
                        {donutData.map((d) => <Cell key={d.name} fill={d.color} />)}
                      </Pie>
                      <Tooltip content={<DonutTooltip />} />
                      <Legend
                        wrapperStyle={{ fontFamily: 'var(--font-sans)', fontSize: '0.8125rem', color: 'var(--color-muted)' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className={styles.panel}>
              <p className={styles.panelTitle}>Totales</p>
              <dl className={styles.kv}>
                <dt className={styles.kvLabel}>Total de tracks</dt>
                <dd className={styles.kvValue}>{fmt(data.total_records)}</dd>
                <dt className={styles.kvLabel}>Real</dt>
                <dd className={styles.kvValue}>{fmt(data.real_records)} ({data.real_pct.toFixed(1)}%)</dd>
                <dt className={styles.kvLabel}>Sintético</dt>
                <dd className={styles.kvValue}>{fmt(data.synthetic_records)} ({data.synthetic_pct.toFixed(1)}%)</dd>
                <dt className={styles.kvLabel}>Subido por artista</dt>
                <dd className={styles.kvValue}>{fmt(data.user_uploaded_records)} ({data.user_uploaded_pct.toFixed(1)}%)</dd>
              </dl>
            </div>
          </div>

          <p className={styles.sectionLabel} style={{ marginTop: 'var(--space-xl)' }}>Salud de la última carga</p>
          <div className={styles.grid}>
            <div className={styles.panel}>
              <div className={styles.kpiLabel}>Tasa de rechazo (promedio histórico)</div>
              <div className={data.rejection_rate !== null && data.rejection_rate > 1.0 ? styles.kpiValueBad : styles.kpiValue}>
                {data.rejection_rate !== null ? `${data.rejection_rate.toFixed(2)}%` : '—'}
              </div>
              {data.rejection_rate !== null && data.rejection_rate > 1.0 && (
                <p className={styles.warnText}>Supera el 1% — requiere revisión.</p>
              )}
            </div>
            <div className={styles.panel}>
              <div className={styles.kpiLabel}>Última carga</div>
              {data.last_load ? (
                <>
                  <div className={styles.kpiValue}>
                    semana {data.last_load.week_number} · <span className={data.last_load.status === 'success' ? styles.statusOk : styles.statusError}>{data.last_load.status}</span>
                  </div>
                  <p className={styles.warnText} style={{ color: 'var(--color-muted)' }}>
                    {fmtDate(data.last_load.run_timestamp)} · {fmt(data.last_load.records_inserted)} insertados
                  </p>
                </>
              ) : (
                <div className={styles.kpiValue}>—</div>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  )
}
