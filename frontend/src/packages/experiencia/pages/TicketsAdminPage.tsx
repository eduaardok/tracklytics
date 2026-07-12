import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ErrorState } from '@shared/components/ErrorState'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { MiniDonutChart } from '@shared/components/charts/MiniDonutChart'
import { STATUS_COLORS, CHART_COLORS } from '@shared/components/charts/colors'
import { apiErrorMessage } from '@shared/lib/api-client'
import { useToast } from '@shared/context/ToastContext'
import { experienciaApi } from '../api/experiencia.api'
import type { EstadoTicket, Ticket } from '../types'
import styles from './ExperienciaPages.module.css'

function fmtDate(iso: string) {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

const ESTADOS: EstadoTicket[] = ['abierto', 'en_proceso', 'resuelto', 'cerrado']

// 4 estados, 4 colores distinguibles: warning (necesita atención) / violeta
// (en curso, no es un color de estado reservado) / good (resuelto) / neutral
// (cerrado, inerte) — evita que dos categorías compartan color en el donut.
const ESTADO_COLOR: Record<string, string> = {
  abierto:    STATUS_COLORS.warning,
  en_proceso: CHART_COLORS.violeta,
  resuelto:   STATUS_COLORS.good,
  cerrado:    STATUS_COLORS.neutral,
}

const FILTROS: { value: string; label: string }[] = [
  { value: '', label: 'Todos' },
  ...ESTADOS.map((e) => ({ value: e, label: e.replace('_', ' ') })),
]

// RF-EXP-005 (CU-O47/CU-O48): admin consulta todos los tickets (filtrables
// por estado) y actualiza su estado — restringido a `require_admin` en el
// backend (`PUT /experiencia/tickets/{id}`).
export function TicketsAdminPage() {
  useDocumentTitle('Soporte — administración')
  const queryClient = useQueryClient()
  const toast = useToast()
  const [estado, setEstado] = useState('')

  const tickets = useQuery({
    queryKey: ['experiencia', 'admin', 'tickets', estado],
    queryFn:  () => experienciaApi.ticketsAdmin(estado || undefined),
  })

  const dashboard = useQuery({
    queryKey: ['experiencia', 'dashboard'],
    queryFn:  () => experienciaApi.dashboard(),
  })

  const actualizar = useMutation({
    mutationFn: ({ factId, nuevoEstado }: { factId: number; nuevoEstado: EstadoTicket }) =>
      experienciaApi.actualizarTicket(factId, nuevoEstado),
    onSuccess: (_res, variables) => {
      queryClient.invalidateQueries({ queryKey: ['experiencia', 'admin', 'tickets'] })
      toast.success(`Ticket actualizado a "${variables.nuevoEstado.replace('_', ' ')}"`)
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo actualizar el ticket.')),
  })

  const pending = actualizar.isPending ? actualizar.variables : undefined
  const data: Ticket[] = tickets.data?.data ?? []

  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>Soporte — administración</h1>

      <div className={styles.dashboardGrid}>
        <div className={styles.chartPanel}>
          <p className={styles.panelTitle}>Tickets por estado</p>
          <MiniDonutChart
            data={(dashboard.data?.tickets_por_estado ?? []).map((t) => ({
              name: t.estado, value: t.total, color: ESTADO_COLOR[t.estado] ?? STATUS_COLORS.neutral,
            }))}
          />
        </div>
        <div className={styles.kpiPanel}>
          <p className={styles.panelTitle}>Resumen</p>
          <div className={styles.kpiRow}>
            <span className={styles.kpiValue}>{dashboard.data?.tickets_abiertos_total ?? '—'}</span>
            <span className={styles.kpiLabel}>Tickets abiertos o en proceso</span>
          </div>
        </div>
      </div>

      <div className={styles.queuePanel}>
        <div className={styles.queueHeader}>
          <span className={styles.queueTitle}>Tickets ({data.length})</span>
          <div className={styles.queueFilters}>
            {FILTROS.map((f) => (
              <button
                key={f.value}
                className={`${styles.filterChip} ${estado === f.value ? styles['filterChip--active'] : ''}`}
                onClick={() => setEstado(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {tickets.isError ? (
          <ErrorState message="No se pudieron cargar los tickets (¿sesión de admin?)." style={{ margin: 'var(--space-md)' }} />
        ) : tickets.isLoading ? (
          <ul className={styles.queueList}>
            <li className={styles.queueRow}><span className={styles.skel} style={{ width: '60%', height: 14 }} /></li>
          </ul>
        ) : data.length === 0 ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyTitle}>Sin tickets</span>
            <span className={styles.emptyBody}>No hay tickets que coincidan con este filtro.</span>
          </div>
        ) : (
          <ul className={styles.queueList}>
            {data.map((t) => {
              const isThisPending = pending?.factId === t.fact_id
              return (
                <li key={t.fact_id} className={styles.queueRow}>
                  <div className={styles.queueRowInfo}>
                    <span className={styles.queueRowMeta}>
                      #{t.fact_id} · {t.usuario_id} · {fmtDate(t.fecha_creacion)}
                      {t.fecha_resolucion && ` · resuelto ${fmtDate(t.fecha_resolucion)}`}
                    </span>
                    <span className={styles.queueRowBody}><strong>{t.asunto}</strong> — {t.descripcion}</span>
                  </div>
                  <select
                    className={styles.select}
                    style={{ height: 32, width: 140 }}
                    value={t.estado}
                    disabled={isThisPending}
                    onChange={(e) => actualizar.mutate({ factId: t.fact_id, nuevoEstado: e.target.value as EstadoTicket })}
                  >
                    {ESTADOS.map((e) => <option key={e} value={e}>{e.replace('_', ' ')}</option>)}
                  </select>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
