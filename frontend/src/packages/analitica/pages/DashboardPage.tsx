import { useQuery } from '@tanstack/react-query'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
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
      <div className={styles.etlPanel} style={{ minHeight: 44 }} />
    </>
  )
}

export function DashboardPage() {
  useDocumentTitle('Dashboard')
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['analytics', 'dashboard'],
    queryFn: analiticaApi.dashboard,
  })

  if (isLoading) return <section><DashboardSkeleton /></section>

  if (isError || !data) {
    return (
      <section>
        <h1 className={styles.heading}>Dashboard</h1>
        <button onClick={() => refetch()} style={{ marginTop: 16 }}>
          Reintentar
        </button>
      </section>
    )
  }

  const { totals, audio_averages: audio, top_genres, top_artists, last_etl } = data
  const etlOk = last_etl?.status === 'success'

  const subtitle = `// ${fmt(totals.tracks)} tracks · ${fmt(totals.artists)} artistas · ${totals.genres} géneros`

  return (
    <section>
      <h1 className={styles.heading}>Dashboard</h1>
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
