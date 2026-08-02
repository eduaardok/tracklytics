import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { MiniBarChart } from '@shared/components/charts/MiniBarChart'
import { EmptyState } from '@shared/components/EmptyState'
import { ExportPDFButton } from '@shared/components/ExportPDFButton'
import { ingestaApi, IngestaApiError } from '../api/ingesta.api'
import type { SyntheticMode, EjecucionEstado, RecalificacionEstado } from '../types'
import styles from './EtlPage.module.css'

// Paleta categórica validada (dataviz skill) — mismos criterios que
// DataQualityPage.tsx (violeta principal, teal secundario) contra la
// superficie oscura real de la app.
const CHART_COLOR_GENRE = 'oklch(0.64 0.15 290)'
const CHART_COLOR_ENERGY = 'oklch(0.65 0.14 195)'
const CHART_COLOR_VALENCE = 'oklch(0.62 0.16 70)'
const CHART_COLOR_DANCE = 'oklch(0.68 0.13 340)'

const TOP_GENEROS = 15

const STAGE_ORDER  = ['extraccion', 'transformacion_staging', 'carga_clickhouse', 'auditoria'] as const
const STAGE_LABELS: Record<string, string> = {
  extraccion:              'Extracción',
  transformacion_staging:  'Transformación (staging)',
  carga_clickhouse:        'Carga a ClickHouse',
  auditoria:               'Auditoría',
}

const POLL_MS   = 5000
const MAX_TICKS = 120 // 10 min, igual que app/analytics/etl.html

function fmt(n: number) { return n.toLocaleString('es-ES') }

// Regresión encontrada en verificación (la duración de ejecución existía
// antes y se perdió en un refactor de esta página) — `duration_seconds` ya
// viaja en la respuesta del backend y en `CargaLog`, solo faltaba
// mostrarla.
function fmtDuration(seconds: number) {
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const mins = Math.floor(seconds / 60)
  const secs = Math.round(seconds % 60)
  return `${mins}m ${secs}s`
}

function fmtDate(iso: string) {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })
}

function RejectionBadge({ pct, requiereRevision }: { pct: number | null; requiereRevision: boolean }) {
  if (pct === null) return <span className={styles.muted}>—</span>
  return (
    <span className={requiereRevision ? styles.rejectBad : styles.rejectOk}>
      {pct.toFixed(2)}%{requiereRevision ? ' · Requiere revisión' : ''}
    </span>
  )
}

function StageBadge({ etapa, estado }: { etapa: string; estado: string | null }) {
  const label = STAGE_LABELS[etapa] ?? etapa
  const cls =
    estado === 'success'    ? styles.stageOk :
    estado === 'failed'     ? styles.stageError :
    estado === 'running'    ? styles.stageRunning :
    styles.stagePending
  return (
    <div className={`${styles.stage} ${cls}`}>
      <span className={styles.stageDot} aria-hidden="true" />
      <span className={styles.stageLabel}>{label}</span>
      <span className={styles.stageState}>{estado ?? 'pendiente'}</span>
    </div>
  )
}

// Referencia: app/analytics/etl.html. Monitoreo en tiempo real = polling real
// (setInterval 5s) contra GET /app/v1/ingesta/ejecuciones/{id} — el backend no
// expone websockets, así que esto replica exactamente el mecanismo real del
// legacy, no una simulación.
export function EtlPage() {
  useDocumentTitle('Ingesta de catálogo')
  const reportRef = useRef<HTMLElement>(null)
  const queryClient = useQueryClient()
  const [weekNumber, setWeekNumber]   = useState('1')
  const [forzarRecarga, setForzar]    = useState(false)
  const [syntheticMode, setSynthetic] = useState<SyntheticMode>('uniform')
  const [triggerError, setTriggerError] = useState<string | null>(null)
  const [triggering, setTriggering]     = useState(false)

  const [ejecucionId, setEjecucionId] = useState<string | null>(null)
  const [estado, setEstado]           = useState<EjecucionEstado | null>(null)
  const [pollError, setPollError]     = useState<string | null>(null)
  const ticksRef = useRef(0)

  const [recalTriggering, setRecalTriggering] = useState(false)
  const [recalError, setRecalError]           = useState<string | null>(null)
  const [recalEjecucionId, setRecalEjecucionId] = useState<string | null>(null)
  const [recalEstado, setRecalEstado]         = useState<RecalificacionEstado | null>(null)
  const [recalPollError, setRecalPollError]   = useState<string | null>(null)
  const recalTicksRef = useRef(0)

  const cargas = useQuery({
    queryKey: ['ingesta', 'cargas'],
    queryFn:  () => ingestaApi.cargas(),
  })

  // "Datos generados por semana" — semanas distintas ya presentes en el
  // historial cargado, más recientes primero. Solo alimenta el <select>.
  const weekOptions = useMemo(() => {
    const weeks = new Set((cargas.data?.data ?? []).map((row) => row.week_number))
    return Array.from(weeks).sort((a, b) => b - a)
  }, [cargas.data])

  // PERF (revisión de rendimiento): `selectedWeek === null` significa "la más
  // reciente" — el backend YA sabe resolver eso solo (`_resolve_week_number`),
  // así que `muestra`/`distribucion` se disparan de una sin esperar a que
  // `cargas` resuelva para fijar `selectedWeek` desde `weekOptions[0]` (como
  // hacía antes, vía un `useEffect` que solo corría una vez `cargas` ya
  // había llegado). Esa espera en cascada era evitable: son 3 llamadas
  // independientes entre sí, no había necesidad real de que 2 de ellas
  // esperaran a la 3ª solo para conocer un número de semana que el propio
  // backend ya resuelve. Medido con Playwright contra el build real: elimina
  // ~1s de espera muerta antes de que empiece a cargar cualquier gráfico.
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null)

  const muestra = useQuery({
    queryKey: ['ingesta', 'etl-muestra', selectedWeek],
    queryFn:  () => ingestaApi.etlMuestra(selectedWeek ?? undefined),
  })

  const distribucion = useQuery({
    queryKey: ['ingesta', 'etl-distribucion', selectedWeek],
    queryFn:  () => ingestaApi.etlDistribucion(selectedWeek ?? undefined),
  })

  // Semana efectivamente mostrada: la elegida a mano, o si no se eligió
  // ninguna, la que el backend resolvió como "más reciente" (viaja en la
  // propia respuesta) — nunca depende de que `cargas` haya llegado primero.
  const displayedWeek = selectedWeek ?? distribucion.data?.week_number ?? muestra.data?.week_number ?? null
  const sinDatosTodavia = weekOptions.length === 0 && !cargas.isLoading
    && (muestra.isError || !muestra.isFetching) && (distribucion.isError || !distribucion.isFetching)
    && displayedWeek === null

  const generoChartData = useMemo(() => {
    const generos = distribucion.data?.generos ?? []
    const top = generos.slice(0, TOP_GENEROS).map((g) => ({ name: g.genre_name, value: g.n }))
    const restantes = generos.length - top.length
    return { top, restantes }
  }, [distribucion.data])

  useEffect(() => {
    if (!ejecucionId) return
    ticksRef.current = 0

    async function poll() {
      try {
        const res = await ingestaApi.estadoEjecucion(ejecucionId!)
        setEstado(res)
        setPollError(null)
        const terminal = res.estado === 'success' || res.estado === 'failed'
        if (terminal) {
          clearInterval(interval)
          queryClient.invalidateQueries({ queryKey: ['ingesta', 'cargas'] })
        }
      } catch {
        setPollError('No se pudo consultar el estado de la ejecución.')
      }
      ticksRef.current += 1
      if (ticksRef.current >= MAX_TICKS) clearInterval(interval)
    }

    poll()
    const interval = setInterval(poll, POLL_MS)
    return () => clearInterval(interval)
  }, [ejecucionId, queryClient])

  useEffect(() => {
    if (!recalEjecucionId) return
    recalTicksRef.current = 0

    async function poll() {
      try {
        const res = await ingestaApi.estadoRecalificacion(recalEjecucionId!)
        setRecalEstado(res)
        setRecalPollError(null)
        const terminal = res.estado === 'success' || res.estado === 'failed'
        if (terminal) clearInterval(interval)
      } catch {
        setRecalPollError('No se pudo consultar el estado de la recalificación.')
      }
      recalTicksRef.current += 1
      if (recalTicksRef.current >= MAX_TICKS) clearInterval(interval)
    }

    poll()
    const interval = setInterval(poll, POLL_MS)
    return () => clearInterval(interval)
  }, [recalEjecucionId])

  async function handleRecalificar() {
    setRecalError(null)
    setRecalTriggering(true)
    setRecalEstado(null)
    try {
      const res = await ingestaApi.dispararRecalificacion()
      setRecalEjecucionId(res.ejecucion_id)
    } catch (err) {
      setRecalError(err instanceof IngestaApiError ? err.message : 'No se pudo disparar la recalificación.')
    } finally {
      setRecalTriggering(false)
    }
  }

  async function handleTrigger() {
    setTriggerError(null)
    setTriggering(true)
    setEstado(null)
    try {
      const week = Number(weekNumber)
      const res = await ingestaApi.trigger({ week_number: week, forzar_recarga: forzarRecarga, synthetic_mode: syntheticMode })
      setEjecucionId(res.ejecucion_id)
    } catch (err) {
      setTriggerError(err instanceof IngestaApiError ? err.message : 'No se pudo disparar la ingesta.')
    } finally {
      setTriggering(false)
    }
  }

  const ultimaCarga = cargas.data?.ultima_carga ?? null
  const historial    = cargas.data?.data ?? []

  return (
    <section className={styles.page} ref={reportRef}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
        <h1 className={styles.heading}>Ingesta de catálogo</h1>
        <ExportPDFButton targetRef={reportRef} fileName="ingesta-etl" title="Ingesta de catálogo" />
      </div>

      {ultimaCarga && (
        <div className={styles.lastRunBar}>
          <span className={styles.lastRunLabel}>Última carga</span>
          <span className={ultimaCarga.status === 'success' ? styles.statusOk : styles.statusError}>
            {ultimaCarga.status}
          </span>
          <span className={styles.lastRunMeta}>semana {ultimaCarga.week_number} · {fmtDate(ultimaCarga.run_timestamp)}</span>
          <span className={styles.lastRunMeta}>{fmt(ultimaCarga.records_inserted)} insertados</span>
          <span className={styles.lastRunMeta}>{fmtDuration(ultimaCarga.duration_seconds)}</span>
          <RejectionBadge pct={ultimaCarga.tasa_rechazo_pct} requiereRevision={ultimaCarga.requiere_revision} />
        </div>
      )}

      <p className={styles.sectionLabel}>Disparar ingesta</p>
      <div className={styles.panel}>
        <div className={styles.formRow}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="week-number">Semana</label>
            <input
              id="week-number"
              className={styles.inputSm}
              type="number"
              min={1}
              max={16}
              value={weekNumber}
              onChange={(e) => setWeekNumber(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="synthetic-mode">Distribución sintética</label>
            <select
              id="synthetic-mode"
              className={styles.select}
              value={syntheticMode}
              onChange={(e) => setSynthetic(e.target.value as SyntheticMode)}
            >
              <option value="uniform">uniform</option>
              <option value="normal">normal</option>
              <option value="empirical">empirical</option>
            </select>
          </div>
          <label className={styles.checkboxField}>
            <input type="checkbox" checked={forzarRecarga} onChange={(e) => setForzar(e.target.checked)} />
            Forzar recarga (idempotencia)
          </label>
          <button type="button" className={styles.btnPrimary} disabled={triggering} onClick={handleTrigger}>
            {triggering ? 'Disparando…' : 'Disparar ingesta'}
          </button>
        </div>
        {triggerError && <p className={styles.errorText}>{triggerError}</p>}
      </div>

      {ejecucionId && (
        <>
          <p className={styles.sectionLabel} style={{ marginTop: 'var(--space-lg)' }}>
            Ejecución {ejecucionId} — {estado?.estado ?? 'consultando…'}
          </p>
          <div className={styles.stagesGrid}>
            {STAGE_ORDER.map((etapa) => {
              const found = estado?.etapas.find((e) => e.etapa === etapa)
              return <StageBadge key={etapa} etapa={etapa} estado={found?.estado ?? null} />
            })}
          </div>
          {pollError && <p className={styles.errorText}>{pollError}</p>}
        </>
      )}

      <p className={styles.sectionLabel} style={{ marginTop: 'var(--space-xl)' }}>Recalificar catálogo</p>
      <div className={styles.panel}>
        <p className={styles.muted}>
          Corrige en bloque álbumes/artistas con año o país sin informar y tracks (no reales) cuyo
          perfil de audio no es coherente con su género — nunca toca el catálogo de origen.
        </p>
        <div className={styles.formRow}>
          <button type="button" className={styles.btnPrimary} disabled={recalTriggering} onClick={handleRecalificar}>
            {recalTriggering ? 'Disparando…' : 'Recalificar catálogo'}
          </button>
        </div>
        {recalError && <p className={styles.errorText}>{recalError}</p>}

        {recalEjecucionId && (
          <>
            <p className={styles.lastRunMeta} style={{ marginTop: 'var(--space-md)' }}>
              Ejecución {recalEjecucionId} — {recalEstado?.estado ?? 'consultando…'}
            </p>
            {recalPollError && <p className={styles.errorText}>{recalPollError}</p>}
            {recalEstado?.resultado && (
              <p className={styles.lastRunMeta}>
                {fmt(recalEstado.resultado.albumes_corregidos)} álbumes ·{' '}
                {fmt(recalEstado.resultado.artistas_corregidos)} artistas ·{' '}
                {fmt(recalEstado.resultado.tracks_corregidos)} tracks corregidos ·{' '}
                {fmtDuration(recalEstado.resultado.duration_seconds)}
              </p>
            )}
          </>
        )}
      </div>

      <p className={styles.sectionLabel} style={{ marginTop: 'var(--space-xl)' }}>Historial de cargas</p>
      {cargas.isLoading && <div className={styles.panel} style={{ minHeight: 120 }} />}
      {cargas.isError && (
        <div className={styles.panel}><p className={styles.errorText}>No se pudo cargar el historial.</p></div>
      )}
      {historial.length > 0 && (
        <div className={styles.panel}>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.thLeft}>Fecha</th>
                  <th className={styles.thLeft}>Semana</th>
                  <th className={styles.thLeft}>Estado</th>
                  <th className={styles.thRight}>Leídos</th>
                  <th className={styles.thRight}>Insertados</th>
                  <th className={styles.thRight}>Rechazados</th>
                  <th className={styles.thRight}>Duración</th>
                  <th className={styles.thRight}>Tasa de rechazo</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((row) => (
                  <tr key={row.log_id}>
                    <td className={styles.rowLabel}>{fmtDate(row.run_timestamp)}</td>
                    <td className={styles.rowLabel}>{row.week_number}</td>
                    <td className={styles.rowLabel}>
                      <span className={row.status === 'success' ? styles.statusOk : styles.statusError}>{row.status}</span>
                    </td>
                    <td className={styles.rowValue}>{fmt(row.records_read)}</td>
                    <td className={styles.rowValue}>{fmt(row.records_inserted)}</td>
                    <td className={styles.rowValue}>{fmt(row.records_rejected)}</td>
                    <td className={styles.rowValue}>{fmtDuration(row.duration_seconds)}</td>
                    <td className={styles.rowValue}>
                      <RejectionBadge pct={row.tasa_rechazo_pct} requiereRevision={row.requiere_revision} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className={styles.sectionHeaderRow} style={{ marginTop: 'var(--space-xl)' }}>
        <p className={styles.sectionLabel} style={{ marginBottom: 0 }}>Datos generados por semana</p>
        {weekOptions.length > 0 && (
          <select
            className={styles.select}
            aria-label="Semana"
            value={displayedWeek ?? ''}
            onChange={(e) => setSelectedWeek(Number(e.target.value))}
          >
            {weekOptions.map((w) => <option key={w} value={w}>Semana {w}</option>)}
          </select>
        )}
      </div>

      {sinDatosTodavia && (
        <div className={styles.panel}>
          <EmptyState icon="◔" title="Sin cargas todavía" body="Dispare una ingesta para poder inspeccionar lo que produce." />
        </div>
      )}

      {!sinDatosTodavia && (
        <>
          <div className={styles.chartGrid}>
            <div className={styles.panel}>
              <p className={styles.panelTitle}>
                Distribución por género
                {generoChartData.restantes > 0 && (
                  <span className={styles.muted}> · +{generoChartData.restantes} más</span>
                )}
              </p>
              {distribucion.isLoading && <div style={{ minHeight: 220 }} />}
              {!distribucion.isLoading && (
                <MiniBarChart data={generoChartData.top} color={CHART_COLOR_GENRE} />
              )}
            </div>
            <div className={styles.panel}>
              <p className={styles.panelTitle}>Energy (bins de 0.2)</p>
              {!distribucion.isLoading && (
                <MiniBarChart
                  data={(distribucion.data?.atributos.energy ?? []).map((b) => ({ name: b.rango, value: b.n }))}
                  color={CHART_COLOR_ENERGY}
                />
              )}
            </div>
            <div className={styles.panel}>
              <p className={styles.panelTitle}>Valence (bins de 0.2)</p>
              {!distribucion.isLoading && (
                <MiniBarChart
                  data={(distribucion.data?.atributos.valence ?? []).map((b) => ({ name: b.rango, value: b.n }))}
                  color={CHART_COLOR_VALENCE}
                />
              )}
            </div>
            <div className={styles.panel}>
              <p className={styles.panelTitle}>Danceability (bins de 0.2)</p>
              {!distribucion.isLoading && (
                <MiniBarChart
                  data={(distribucion.data?.atributos.danceability ?? []).map((b) => ({ name: b.rango, value: b.n }))}
                  color={CHART_COLOR_DANCE}
                />
              )}
            </div>
          </div>

          <p className={styles.sectionLabel} style={{ marginTop: 'var(--space-lg)' }}>
            Muestra ({muestra.data?.data.length ?? 0} tracks)
          </p>
          {muestra.isLoading && <div className={styles.panel} style={{ minHeight: 120 }} />}
          {muestra.isError && (
            <div className={styles.panel}><p className={styles.errorText}>No se pudo cargar la muestra.</p></div>
          )}
          {muestra.data && muestra.data.data.length > 0 && (
            <div className={styles.panel}>
              <div className={styles.tableScroll} style={{ maxHeight: 420, overflowY: 'auto' }}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.thLeft}>Track</th>
                      <th className={styles.thLeft}>Artista</th>
                      <th className={styles.thLeft}>Género</th>
                      <th className={styles.thRight}>Popularidad</th>
                      <th className={styles.thLeft}>Origen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {muestra.data.data.map((row, i) => (
                      <tr key={i}>
                        <td className={styles.rowLabel}>{row.track_name}</td>
                        <td className={styles.rowLabel}>{row.artist_name}</td>
                        <td className={styles.rowLabel}>{row.genre_name}</td>
                        <td className={styles.rowValue}>{row.popularity}</td>
                        <td className={styles.rowLabel}>
                          <span className={
                            row.source_type === 'real' ? styles.sourceReal :
                            row.source_type === 'synthetic' ? styles.sourceSynthetic :
                            styles.sourceUploaded
                          }>
                            {row.source_type}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}
