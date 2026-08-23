import { useQuery } from '@tanstack/react-query'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ErrorState } from '@shared/components/ErrorState'
import { useCountUp } from '@shared/hooks/useCountUp'
import { useReveal } from '@shared/hooks/useReveal'
import { creadoresApi } from '../api/creadores.api'
import styles from '../pages/CreadoresPages.module.css'

// R2 (S16-P9) — analítica propia del artista: engagement REAL sobre los
// tracks promovidos propios. Hasta ahora el artista solo veía streams
// LIQUIDADOS (regalías, con retraso de ciclo); este panel expone lo que
// está pasando hoy: plays, likes, favoritos netos y oyentes únicos por
// track + serie de los últimos 30 días. El endpoint hace el gating
// (403 sin cuenta aprobada) y solo devuelve fact_ids propios.

function KpiTile({ valor, etiqueta }: { valor: number; etiqueta: string }) {
  const n = useCountUp(valor)
  const ref = useReveal<HTMLDivElement>()
  return (
    <div className={`${styles.kpiPanel} reveal-base`} ref={ref}>
      <span className={styles.kpiValue}>{n.toLocaleString('es-ES')}</span>
      <span className={styles.kpiLabel}>{etiqueta}</span>
    </div>
  )
}

function SkelKpi() {
  return (
    <div className={styles.kpiPanel} aria-hidden="true">
      <span className={styles.skel} style={{ width: '45%', height: 26 }} />
      <span className={styles.skel} style={{ width: '70%', height: 11, marginTop: 6 }} />
    </div>
  )
}

function diaCorto(iso: string) {
  const d = new Date(`${iso}T00:00:00`)
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
}

export function PanelAnaliticaArtista({ aprobada }: { aprobada: boolean }) {
  // Refs de reveal ANTES de cualquier return temprano (Rules of Hooks).
  const chartRef = useReveal<HTMLDivElement>()
  const tablaRef = useReveal<HTMLDivElement>()

  const q = useQuery({
    queryKey: ['creadores', 'mi-analitica'],
    queryFn: () => creadoresApi.miAnalitica(),
    enabled: aprobada,
    retry: false,
  })

  if (!aprobada || q.isError) {
    return (
      <ErrorState message="No se pudo cargar tu analítica — se requiere una cuenta de artista aprobada." />
    )
  }

  if (q.isLoading || !q.data) {
    return (
      <>
        <div className={styles.hubStatsGrid} aria-hidden="true">
          <SkelKpi /><SkelKpi /><SkelKpi /><SkelKpi />
        </div>
        <div className={`${styles.panel} ${styles.anaChartBox}`} aria-hidden="true">
          <span className={styles.skel} style={{ width: '30%', height: 12 }} />
          <span className={styles.skel} style={{ width: '100%', height: '65%', marginTop: 14 }} />
        </div>
      </>
    )
  }

  const { totales, serie, tracks } = q.data.data
  const serieChart = serie.map((p) => ({ ...p, etiqueta: diaCorto(p.dia) }))

  return (
    <>
      {/* Los KPIs cuentan de 0 al valor real (useCountUp) al entrar en vista. */}
      <div className={styles.hubStatsGrid}>
        <KpiTile valor={totales.plays} etiqueta="Streams totales" />
        <KpiTile valor={totales.oyentes} etiqueta="Oyentes únicos" />
        <KpiTile valor={totales.likes} etiqueta="Likes" />
        <KpiTile valor={totales.favoritos} etiqueta="Favoritos netos" />
      </div>

      <p className={styles.sectionLabel}>Streams — últimos 30 días</p>
      <div className={`${styles.panel} ${styles.anaChartBox} reveal-base`} ref={chartRef}>
        {serieChart.length === 0 ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyTitle}>Sin reproducciones todavía</span>
            <span className={styles.emptyBody}>
              Cuando alguien escuche tus tracks, la curva de los últimos 30 días aparece acá.
            </span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={serieChart} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
              <defs>
                <linearGradient id="anaPlaysFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="etiqueta" tick={{ fontSize: 11 }} stroke="var(--color-muted)" tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="var(--color-muted)" tickLine={false} />
              <Tooltip
                formatter={(v) => [`${v}`, 'Streams']}
                labelStyle={{ color: 'var(--color-ink)' }}
                contentStyle={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 10,
                  fontSize: 12,
                }}
              />
              <Area
                type="monotone"
                dataKey="plays"
                stroke="var(--color-primary)"
                strokeWidth={2}
                fill="url(#anaPlaysFill)"
                animationDuration={900}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <p className={styles.sectionLabel}>Engagement por track</p>
      {tracks.length === 0 ? (
        <div className={styles.emptyState}>
          <span className={styles.emptyTitle}>Todavía no tienes tracks publicados</span>
          <span className={styles.emptyBody}>
            Sube un track desde la pestaña Música; cuando sea aprobado, sus métricas aparecen acá.
          </span>
        </div>
      ) : (
        <div className={`${styles.panel} reveal-base`} ref={tablaRef} style={{ overflowX: 'auto' }}>
          <table className={styles.anaTabla}>
            <thead>
              <tr>
                <th>Track</th>
                <th>Streams</th>
                <th>Oyentes</th>
                <th>Likes</th>
                <th>Favoritos</th>
              </tr>
            </thead>
            <tbody>
              {tracks.map((t) => (
                <tr key={t.fact_id}>
                  <td>{t.track_name}</td>
                  <td>{t.plays.toLocaleString('es-ES')}</td>
                  <td>{t.oyentes.toLocaleString('es-ES')}</td>
                  <td>{t.likes.toLocaleString('es-ES')}</td>
                  <td>{(t.favoritos >= 0 ? '' : '−') + Math.abs(t.favoritos).toLocaleString('es-ES')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Errores de refresco silenciosos no deben tumbar el panel: si una
          revalidación falla con datos ya en pantalla, se ignora. */}
      {q.isRefetchError && (
        <p className={styles.sectionLabel} role="status">
          No se pudo actualizar — mostrando los últimos datos.
        </p>
      )}
    </>
  )
}
