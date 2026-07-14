import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { ingestaApi, IngestaApiError } from '../api/ingesta.api'
import type { SyntheticMode, EjecucionEstado, RecalificacionEstado } from '../types'
import styles from './EtlPage.module.css'

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
    <section className={styles.page}>
      <h1 className={styles.heading}>Ingesta de catálogo</h1>

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
    </section>
  )
}
