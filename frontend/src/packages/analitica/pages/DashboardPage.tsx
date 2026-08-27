import { useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Disc3, Mic2, Tags, Gauge, Zap, Music4, Smile, Timer } from 'lucide-react'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { MiniLineChart } from '@shared/components/charts/MiniLineChart'
import { MiniBarChart, type BarDatum } from '@shared/components/charts/MiniBarChart'
import { CHART_COLORS } from '@shared/components/charts/colors'
import { ExportPDFButton } from '@shared/components/ExportPDFButton'
import { KPICard } from '@shared/components/KPICard'
import { SkeletonCard, SkeletonChart } from '@shared/components/SkeletonLoader'
import { analiticaApi } from '../api/analitica.api'
import styles from './DashboardPage.module.css'

const fmt    = (n: number)         => n.toLocaleString('es-ES')
const fmtDec = (n: number, d = 4) => n.toFixed(d)
// KPICard usa `font-size: 2rem` para el valor — números de 7+ dígitos
// (catálogo real: 1.313.556 tracks) se salían de una card de ~110px de
// ancho mínimo (encontrado en verificación visual con Playwright, no en el
// diseño). Notación compacta en es-ES escribe la unidad como palabra
// ("29,9 mil", no "29,9K") — para números de 6 dígitos o menos eso ocupa
// MÁS espacio que el número completo ("29.863"), así que solo compacta a
// partir de 1M, donde "1,3 M" sí gana contra "1.313.556". `fmt()` (sin
// compactar) sigue siendo el que se usa en el subtítulo, donde cabe el
// número completo sin problema.
const fmtKpi = (n: number) =>
  n >= 1_000_000 ? new Intl.NumberFormat('es-ES', { notation: 'compact', maximumFractionDigits: 1 }).format(n) : fmt(n)

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
        <div className={styles.panel}><SkeletonCard height={124} /></div>
        <div className={styles.panel}><SkeletonCard height={124} /></div>
      </div>
      <div className={styles.midGrid}>
        <div className={styles.panel}><SkeletonChart height={250} /></div>
        <div className={styles.panel}><SkeletonChart height={250} /></div>
      </div>
      <div className={styles.midGrid}>
        <div className={styles.panel}><SkeletonChart height={220} /></div>
        <div className={styles.panel}><SkeletonChart height={220} /></div>
      </div>
      <div className={styles.midGrid}>
        <div className={styles.panel}><SkeletonChart height={220} /></div>
        <div className={styles.panel}><SkeletonChart height={220} /></div>
      </div>
      <div className={styles.etlPanel}><SkeletonCard height={28} /></div>
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
          <div className={styles.kpiSubGrid}>
            <KPICard title="Canciones" value={fmtKpi(totals.tracks)} icon={Disc3} />
            <KPICard title="Artistas" value={fmtKpi(totals.artists)} icon={Mic2} />
            <KPICard title="Géneros" value={totals.genres} icon={Tags} />
          </div>
        </div>

        <div>
          <p className={styles.sectionLabel}>Audio promedio</p>
          <div className={styles.kpiSubGrid}>
            <KPICard
              title="Popularidad" value={fmtDec(audio.avg_popularity, 2)} icon={Gauge}
              helpText="Puntaje de popularidad del track (0 a 100), calculado a partir de reproducciones recientes y su ritmo de crecimiento."
            />
            <KPICard
              title="Energía (Energy)" value={fmtDec(audio.avg_energy)} icon={Zap}
              helpText="De 0 a 1: qué tan intenso y activo suena el track (volumen, ruido percibido, timbre). Un valor alto no implica tempo alto."
            />
            <KPICard
              title="Baile (Danceability)" value={fmtDec(audio.avg_danceability)} icon={Music4}
              helpText="De 0 a 1: qué tan apto es el track para bailar, según tempo, estabilidad rítmica y regularidad del compás."
            />
            <KPICard
              title="Valencia (Valence)" value={fmtDec(audio.avg_valence)} icon={Smile}
              helpText="De 0 a 1: qué tan positivo o alegre suena el track. Valores bajos suenan más tristes o tensos; altos, más felices o eufóricos."
            />
            <KPICard
              title="Tempo" value={`${fmtDec(audio.avg_tempo, 2)} bpm`} icon={Timer}
              helpText="Velocidad estimada del track en pulsos por minuto (BPM)."
            />
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
              denseDates
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
