import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ErrorState } from '@shared/components/ErrorState'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { MiniDonutChart } from '@shared/components/charts/MiniDonutChart'
import { STATUS_COLORS } from '@shared/components/charts/colors'
import { apiErrorMessage } from '@shared/lib/api-client'
import { useToast } from '@shared/context/ToastContext'
import { creadoresApi } from '../api/creadores.api'
import type { CuentaArtista, SubidaTrack } from '../types'
import styles from './CreadoresPages.module.css'

const ESTADO_COLOR: Record<string, string> = {
  pendiente: STATUS_COLORS.warning,
  aprobado:  STATUS_COLORS.good,
  rechazado: STATUS_COLORS.error,
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M3 7.2l2.7 2.7L11 4.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function TrayIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
      <path d="M5 15.5v3.2a1.4 1.4 0 0 0 1.4 1.4h13.2a1.4 1.4 0 0 0 1.4-1.4v-3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.5 10L13 5.5 17.5 10M13 5.5V16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function SkelQueueRow() {
  return (
    <li className={styles.skelQueueRow} aria-hidden="true">
      <span className={styles.skel} style={{ width: '50%', height: 13 }} />
      <span className={styles.skel} style={{ width: 60, height: 22, borderRadius: 6, marginLeft: 'auto' }} />
      <span className={styles.skel} style={{ width: 60, height: 22, borderRadius: 6 }} />
    </li>
  )
}

function EmptyQueue({ label }: { label: string }) {
  return (
    <div className={styles.emptyState}>
      <TrayIcon />
      <span className={styles.emptyTitle}>Sin {label} pendientes</span>
      <span className={styles.emptyBody}>Todo al día — nada esperando revisión.</span>
    </div>
  )
}

type Decision = 'aprobar' | 'rechazar'

export function RevisionCreadoresPage() {
  useDocumentTitle('Revisión de creadores')
  const queryClient = useQueryClient()
  const toast = useToast()

  const cuentas = useQuery({
    queryKey: ['creadores', 'admin', 'cuentas', 'pendiente'],
    queryFn:  () => creadoresApi.cuentasAdmin('pendiente'),
  })

  const tracks = useQuery({
    queryKey: ['creadores', 'admin', 'tracks', 'pendiente'],
    queryFn:  () => creadoresApi.tracksAdmin('pendiente'),
  })

  const dashboard = useQuery({
    queryKey: ['creadores', 'dashboard'],
    queryFn:  () => creadoresApi.dashboard(),
  })

  const resolverCuenta = useMutation({
    mutationFn: ({ cuentaArtistaId, decision }: { cuentaArtistaId: string; decision: Decision }) =>
      creadoresApi.resolverCuenta(cuentaArtistaId, { decision }),
    onSuccess: (_res, variables) => {
      queryClient.invalidateQueries({ queryKey: ['creadores', 'admin', 'cuentas', 'pendiente'] })
      toast.success(variables.decision === 'aprobar' ? 'Cuenta de artista aprobada' : 'Cuenta de artista rechazada')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo resolver la cuenta de artista.')),
  })

  const resolverTrack = useMutation({
    mutationFn: ({ subidaId, decision }: { subidaId: string; decision: Decision }) =>
      creadoresApi.resolverTrack(subidaId, { decision }),
    onSuccess: (_res, variables) => {
      queryClient.invalidateQueries({ queryKey: ['creadores', 'admin', 'tracks', 'pendiente'] })
      toast.success(variables.decision === 'aprobar' ? 'Track aprobado' : 'Track rechazado')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo resolver el track.')),
  })

  // Per-row pending state: only the row + action actually in flight is
  // disabled/labeled "…", not every row sharing the mutation object.
  const cuentaPending = resolverCuenta.isPending ? resolverCuenta.variables : undefined
  const trackPending  = resolverTrack.isPending  ? resolverTrack.variables  : undefined

  const cuentasData: CuentaArtista[] = cuentas.data?.data ?? []
  const tracksData: SubidaTrack[]   = tracks.data?.data ?? []

  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>Revisión de creadores</h1>

      <div className={styles.dashboardGrid}>
        <div className={styles.chartPanel}>
          <p className={styles.panelTitle}>Subidas por estado de revisión</p>
          <MiniDonutChart
            data={(dashboard.data?.subidas_por_estado ?? []).map((d) => ({
              name: d.estado, value: d.total, color: ESTADO_COLOR[d.estado] ?? STATUS_COLORS.neutral,
            }))}
          />
        </div>
        <div className={styles.kpiPanel}>
          <p className={styles.panelTitle}>Resumen</p>
          <div className={styles.kpiRow}>
            <span className={styles.kpiValue}>{dashboard.data?.cuentas_artista_total ?? '—'}</span>
            <span className={styles.kpiLabel}>Cuentas de artista totales</span>
          </div>
        </div>
      </div>

      <div className={styles.queueGrid}>
        <div className={styles.queuePanel}>
          <div className={styles.queueHeader}>
            <span className={styles.queueTitle}>Cuentas de artista</span>
            <span className={styles.queueCount}>{cuentasData.length}</span>
          </div>

          {cuentas.isError ? (
            <ErrorState
              message="No se pudieron cargar las cuentas pendientes (¿sesión de admin?)."
              style={{ margin: 'var(--space-md)' }}
            />
          ) : cuentas.isLoading ? (
            <ul className={styles.queueList}>
              <SkelQueueRow /><SkelQueueRow /><SkelQueueRow />
            </ul>
          ) : cuentasData.length === 0 ? (
            <EmptyQueue label="cuentas" />
          ) : (
            <ul className={styles.queueList}>
              {cuentasData.map((c) => {
                const isThisPending = cuentaPending?.cuentaArtistaId === c.cuenta_artista_id
                return (
                  <li key={c.cuenta_artista_id} className={styles.queueRow}>
                    <div className={styles.queueRowInfo}>
                      <span className={styles.queueRowName}>{c.nombre_artistico}</span>
                      <span className={styles.queueRowMeta}>{fmtDate(c.fecha_solicitud)}</span>
                    </div>
                    <div className={styles.queueRowActions}>
                      <button
                        className={styles.btnPrimary}
                        disabled={isThisPending}
                        onClick={() => resolverCuenta.mutate({ cuentaArtistaId: c.cuenta_artista_id, decision: 'aprobar' })}
                      >
                        {isThisPending && cuentaPending?.decision === 'aprobar' ? '…' : <><CheckIcon /> Aprobar</>}
                      </button>
                      <button
                        className={styles.btnGhostDanger}
                        disabled={isThisPending}
                        onClick={() => resolverCuenta.mutate({ cuentaArtistaId: c.cuenta_artista_id, decision: 'rechazar' })}
                      >
                        {isThisPending && cuentaPending?.decision === 'rechazar' ? '…' : <><XIcon /> Rechazar</>}
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className={styles.queuePanel}>
          <div className={styles.queueHeader}>
            <span className={styles.queueTitle}>Tracks subidos</span>
            <span className={styles.queueCount}>{tracksData.length}</span>
          </div>

          {tracks.isError ? (
            <ErrorState
              message="No se pudieron cargar los tracks pendientes (¿sesión de admin?)."
              style={{ margin: 'var(--space-md)' }}
            />
          ) : tracks.isLoading ? (
            <ul className={styles.queueList}>
              <SkelQueueRow /><SkelQueueRow /><SkelQueueRow />
            </ul>
          ) : tracksData.length === 0 ? (
            <EmptyQueue label="tracks" />
          ) : (
            <ul className={styles.queueList}>
              {tracksData.map((t) => {
                const isThisPending = trackPending?.subidaId === t.subida_id
                return (
                  <li key={t.subida_id} className={styles.queueRow}>
                    <div className={styles.queueRowInfo}>
                      <span className={styles.queueRowName}>{t.track_name}</span>
                      <span className={styles.queueRowMeta}>{fmtDate(t.fecha_subida)}</span>
                    </div>
                    <div className={styles.queueRowActions}>
                      <button
                        className={styles.btnPrimary}
                        disabled={isThisPending}
                        onClick={() => resolverTrack.mutate({ subidaId: t.subida_id, decision: 'aprobar' })}
                      >
                        {isThisPending && trackPending?.decision === 'aprobar' ? '…' : <><CheckIcon /> Aprobar</>}
                      </button>
                      <button
                        className={styles.btnGhostDanger}
                        disabled={isThisPending}
                        onClick={() => resolverTrack.mutate({ subidaId: t.subida_id, decision: 'rechazar' })}
                      >
                        {isThisPending && trackPending?.decision === 'rechazar' ? '…' : <><XIcon /> Rechazar</>}
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}
