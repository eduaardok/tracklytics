import { useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { MiniLineChart } from '@shared/components/charts/MiniLineChart'
import { MiniBarChart, type BarDatum } from '@shared/components/charts/MiniBarChart'
import { CHART_COLORS } from '@shared/components/charts/colors'
import { ExportPDFButton } from '@shared/components/ExportPDFButton'
import { analiticaApi } from '../api/analitica.api'
import styles from './DashboardPage.module.css'

const fmt    = (n: number)         => n.toLocaleString('es-ES')
const fmtDec = (n: number, d = 4) => n.toFixed(d)

function fmtTs(ts: string): string {
  try {
    return new Date(ts).toLocaleString('es-ES', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return ts }
}

function Skel({ w, h, mb = 0 }: { w: number | string; h: number; mb?: number }) {
  return (
    <span
      className={styles.skel}
      style={{ display: 'block', width: w, height: h, marginBottom: mb }}
    />
  )
}

function DashboardSkeleton() {
  return (
    <>
      <Skel w={140} h={24} mb={6} />
      <Skel w={260} h={13} mb={40} />
      <div className={styles.topGrid}>
        <div className={styles.panel} style={{ minHeight: 124 }} />
        <div className={styles.panel} style={{ minHeight: 124 }} />
      </div>
      <div className={styles.midGrid}>
        <div className={styles.panel} style={{ minHeight: 250 }} />
        <div className={styles.panel} style={{ minHeight: 250 }} />
      </div>
      <div className={styles.midGrid}>
        <div className={styles.panel} style={{ minHeight: 220 }} />
        <div className={styles.panel} style={{ minHeight: 220 }} />
      </div>
      <div className={styles.midGrid}>
        <div className={styles.panel} style={{ minHeight: 220 }} />
        <div className={styles.panel} style={{ minHeight: 220 }} />
      </div>
      <div className={styles.etlPanel} style={{ minHeight: 44 }} />
    </>
  )
}

export function DashboardPage() {
  useDocumentTitle('Dashboard')
  const pageRef = useRef<HTMLElement>(null)
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['analytics', 'dashboard'],
    queryFn: analiticaApi.dashboard,
  })

  if (isLoading) return <section><DashboardSkeleton /></section>

  if (isError || !data) {
    return (
      <section>
        <h1 className={styles.heading}>Dashboard</h1>
        <button className={styles.retryBtn} onClick={() => refetch()} style={{ marginTop: 16 }}>
          Reintentar
        </button>
      </section>
    )
  }

  const {
    totals, audio_averages: audio, top_genres, top_artists, last_etl,
    ingresos_vs_regalias, altas_por_plan_semana, engagement_por_genero,
    reproducciones_bloqueadas_por_pais,
  } = data
  const etlOk = last_etl?.status === 'success'

  const subtitle = `// ${fmt(totals.tracks)} tracks · ${fmt(totals.artists)} artistas · ${totals.genres} géneros`

  const ingresosData = ingresos_vs_regalias.map((d) => ({
    dia: new Date(d.dia).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }),
    ingresos_suscripciones: d.ingresos_suscripciones,
    ingresos_publicidad:    d.ingresos_publicidad,
    regalias_pagadas:       d.regalias_pagadas,
  }))

  const altasPlanData = altas_por_plan_semana.map((d) => ({
    semana:   new Date(d.semana).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }),
    free:     d.free,
    b2c_pago: d.b2c_pago,
    b2b:      d.b2b,
  }))

  const engagementData: BarDatum[] = engagement_por_genero.map((g) => ({ name: g.name, value: g.value }))
  const restriccionesData: BarDatum[] = reproducciones_bloqueadas_por_pais.map((r) => ({ name: r.pais, value: r.total }))

  return (
    <section ref={pageRef}>
      <div className={styles.headTop}>
        <h1 className={styles.heading}>Dashboard</h1>
        <span className={styles.exportSlot}>
          <ExportPDFButton targetRef={pageRef} fileName="dashboard-ejecutivo" title="Dashboard ejecutivo" />
        </span>
      </div>
      <span className={styles.subtitle}>{subtitle}</span>

      {/* ── Top row: catalog scale + audio averages ── */}
      <div className={styles.topGrid}>
        <div>
          <p className={styles.sectionLabel}>Escala del catálogo</p>
          <div className={styles.panel}>
            <dl className={styles.kv}>
              <dt className={styles.kvLabel}>Tracks</dt>
              <dd className={styles.kvValue}>{fmt(totals.tracks)}</dd>
              <dt className={styles.kvLabel}>Artistas</dt>
              <dd className={styles.kvValue}>{fmt(totals.artists)}</dd>
              <dt className={styles.kvLabel}>Géneros</dt>
              <dd className={styles.kvValue}>{totals.genres}</dd>
            </dl>
          </div>
        </div>

        <div>
          <p className={styles.sectionLabel}>Audio promedio</p>
          <div className={styles.panel}>
            <dl className={styles.kv}>
              <dt className={styles.kvLabel}>Popularidad</dt>
              <dd className={styles.kvValue}>{fmtDec(audio.avg_popularity, 2)}</dd>
              <dt className={styles.kvLabel}>Energy</dt>
              <dd className={styles.kvValue}>{fmtDec(audio.avg_energy)}</dd>
              <dt className={styles.kvLabel}>Danceability</dt>
              <dd className={styles.kvValue}>{fmtDec(audio.avg_danceability)}</dd>
              <dt className={styles.kvLabel}>Valence</dt>
              <dd className={styles.kvValue}>{fmtDec(audio.avg_valence)}</dd>
              <dt className={styles.kvLabel}>Tempo</dt>
              <dd className={styles.kvValue}>{fmtDec(audio.avg_tempo, 2)} bpm</dd>
            </dl>
          </div>
        </div>
      </div>

      {/* ── Mid row: top genres + top artists ── */}
      <div className={styles.midGrid}>
        <div>
          <p className={styles.sectionLabel}>Géneros más frecuentes</p>
          <div className={styles.panel}>
            <ol className={styles.rankedList} aria-label="Top géneros">
              {top_genres.map((g, i) => (
                <li key={g.name} className={styles.rankedRow}>
                  <span className={styles.rank} aria-hidden="true">{i + 1}</span>
                  <span className={styles.rankedName}>{g.name}</span>
                  <span className={styles.rankedValue}>{fmt(g.track_count)}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div>
          <p className={styles.sectionLabel}>Artistas más representados</p>
          <div className={styles.panel}>
            <ol className={styles.rankedList} aria-label="Top artistas">
              {top_artists.map((a, i) => (
                <li key={a.name} className={styles.rankedRow}>
                  <span className={styles.rank} aria-hidden="true">{i + 1}</span>
                  <span className={styles.rankedName}>{a.name}</span>
                  <span className={styles.rankedValue}>{fmt(a.track_count)}</span>
                  <span className={`${styles.rankedValue} ${styles.rankedValueAccent}`}>
                    ★ {fmtDec(a.avg_popularity, 1)}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>

      {/* ── Charts de negocio: ingresos vs. regalías + altas por plan ── */}
      <div className={styles.midGrid}>
        <div>
          <p className={styles.sectionLabel}>Ingresos vs. regalías pagadas (diario)</p>
          <div className={styles.panel}>
            <MiniLineChart
              data={ingresosData}
              xKey="dia"
              series={[
                { key: 'ingresos_suscripciones', label: 'Suscripciones', color: CHART_COLORS.teal },
                { key: 'ingresos_publicidad',    label: 'Publicidad',    color: CHART_COLORS.violeta },
                { key: 'regalias_pagadas',       label: 'Regalías pagadas', color: CHART_COLORS.ambar },
              ]}
            />
          </div>
        </div>

        <div>
          <p className={styles.sectionLabel}>Altas de suscripción por plan (semanal)</p>
          <div className={styles.panel}>
            <MiniLineChart
              data={altasPlanData}
              xKey="semana"
              series={[
                { key: 'free',     label: 'Free',        color: CHART_COLORS.teal },
                { key: 'b2c_pago', label: 'B2C de pago',  color: CHART_COLORS.violeta },
                { key: 'b2b',      label: 'B2B',          color: CHART_COLORS.ambar },
              ]}
            />
          </div>
        </div>
      </div>

      {/* ── Charts de negocio: engagement por género + restricciones por país ── */}
      <div className={styles.midGrid}>
        <div>
          <p className={styles.sectionLabel}>Géneros con más engagement real</p>
          <div className={styles.panel}>
            <MiniBarChart data={engagementData} color={CHART_COLORS.teal} />
          </div>
        </div>

        <div>
          <p className={styles.sectionLabel}>Reproducciones bloqueadas por país</p>
          <div className={styles.panel}>
            <MiniBarChart data={restriccionesData} color={CHART_COLORS.ambar} />
          </div>
        </div>
      </div>

      {/* ── ETL health ── */}
      {last_etl && (
        <div>
          <p className={styles.sectionLabel}>Estado de ingestión</p>
          <div className={styles.etlPanel}>
            <span className={`${styles.etlBadge} ${etlOk ? styles.etlBadgeOk : styles.etlBadgeError}`}>
              <span className={styles.etlDot} aria-hidden="true" />
              {etlOk ? 'activo' : last_etl.status}
            </span>
            <span className={styles.etlMeta}>{fmtTs(last_etl.run_timestamp)}</span>
            <span className={styles.etlMeta}>{fmt(last_etl.records_inserted)} records insertados</span>
          </div>
        </div>
      )}
    </section>
  )
}
