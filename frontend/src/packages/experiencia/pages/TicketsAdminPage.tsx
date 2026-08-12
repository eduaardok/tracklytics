import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ErrorState } from '@shared/components/ErrorState'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { MiniDonutChart } from '@shared/components/charts/MiniDonutChart'
import { STATUS_COLORS, CHART_COLORS } from '@shared/components/charts/colors'
import { apiErrorMessage } from '@shared/lib/api-client'
import { useToast } from '@shared/context/ToastContext'
import { CrudModal } from '@shared/components/CrudModal'
import { CrudActionButtons } from '@shared/components/CrudActionButtons'
import { SkeletonLoader } from '@shared/components/SkeletonLoader'
import { EmptyState } from '@shared/components/EmptyState'
import { ExportPDFButton } from '@shared/components/ExportPDFButton'
import { UserPicker, type UserSearchResult } from '@shared/components/UserPicker'
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

type ModalState =
  | { mode: 'create' }
  | { mode: 'edit'; ticket: Ticket }
  | { mode: 'view'; ticket: Ticket }
  | { mode: 'resolver'; ticket: Ticket }
  | null

// RF-EXP-005 (CU-O47/CU-O48): admin consulta todos los tickets (filtrables
// por estado) y actualiza su estado.
//
// S13-P2 (patrón CRUD docente): la auditoría de S13-P1 encontró que esta era
// la entidad con más brechas — solo edición inline de un <select>, sin
// Insertar/Ver detalle ni patrón modal. Se completa el ciclo con
// `CrudModal`/`CrudActionButtons` compartidos. Sin campos "categoría" ni
// "prioridad": `FACT_TICKET_SOPORTE` (ClickHouse) no los tiene y esta semana
// no se permite alterar tablas existentes del catálogo — el formulario solo
// ofrece asunto/descripción/usuario/estado, que sí son reales.
export function TicketsAdminPage() {
  useDocumentTitle('Soporte — administración')
  const queryClient = useQueryClient()
  const toast = useToast()
  const reportRef = useRef<HTMLElement>(null)
  const [estado, setEstado] = useState('')
  const [modal, setModal]   = useState<ModalState>(null)

  const tickets = useQuery({
    queryKey: ['experiencia', 'admin', 'tickets', estado],
    queryFn:  () => experienciaApi.ticketsAdmin(estado || undefined),
  })

  const dashboard = useQuery({
    queryKey: ['experiencia', 'dashboard'],
    queryFn:  () => experienciaApi.dashboard(),
  })

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ['experiencia', 'admin', 'tickets'] })

  const crear = useMutation({
    mutationFn: (vars: { asunto: string; descripcion: string; usuarioId: string }) =>
      experienciaApi.crearTicket({ asunto: vars.asunto, descripcion: vars.descripcion, usuario_id: vars.usuarioId }),
    onSuccess: () => { invalidar(); setModal(null); toast.success('Ticket creado') },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo crear el ticket.')),
  })

  const actualizar = useMutation({
    mutationFn: ({ factId, nuevoEstado }: { factId: number; nuevoEstado: EstadoTicket }) =>
      experienciaApi.actualizarTicket(factId, nuevoEstado),
    onSuccess: (_res, variables) => {
      invalidar()
      setModal(null)
      toast.success(`Ticket actualizado a "${variables.nuevoEstado.replace('_', ' ')}"`)
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo actualizar el ticket.')),
  })

  const data: Ticket[] = tickets.data?.data ?? []

  return (
    <section className={styles.page} ref={reportRef}>
      <div className={styles.headRow}>
        <h1 className={styles.heading}>Soporte — administración</h1>
        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          <ExportPDFButton targetRef={reportRef} fileName="soporte-tickets" title="Soporte — administración" />
          <button type="button" className={styles.btnPrimary} onClick={() => setModal({ mode: 'create' })} data-pdf-export-ignore="true">
            + Nuevo ticket
          </button>
        </div>
      </div>

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
          <div className={styles.queueFilters} data-pdf-export-ignore="true">
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
          <div style={{ padding: 'var(--space-md)' }}>
            <SkeletonLoader count={4} height={40} />
          </div>
        ) : data.length === 0 ? (
          <EmptyState icon="( ∅ )" title="Sin tickets" body="No hay tickets que coincidan con este filtro." />
        ) : (
          <ul className={styles.queueList}>
            {data.map((t) => (
              <li key={t.fact_id} className={styles.queueRow}>
                <div className={styles.queueRowInfo}>
                  <span className={styles.queueRowMeta}>
                    #{t.fact_id} · {t.usuario_id} · {fmtDate(t.fecha_creacion)}
                    {t.fecha_resolucion && ` · resuelto ${fmtDate(t.fecha_resolucion)}`}
                    {' · '}
                    <span className={`${styles.badge}`} style={{ color: ESTADO_COLOR[t.estado] }}>{t.estado.replace('_', ' ')}</span>
                  </span>
                  <span className={styles.queueRowBody}><strong>{t.asunto}</strong> — {t.descripcion}</span>
                </div>
                <CrudActionButtons
                  onView={() => setModal({ mode: 'view', ticket: t })}
                  onEdit={() => setModal({ mode: 'edit', ticket: t })}
                  onDelete={t.estado !== 'resuelto' && t.estado !== 'cerrado' ? () => setModal({ mode: 'resolver', ticket: t }) : undefined}
                  deleteLabel="Resolver"
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {modal?.mode === 'create' && (
        <CreateTicketModal pending={crear.isPending} onClose={() => setModal(null)} onSave={(v) => crear.mutate(v)} />
      )}

      {modal?.mode === 'edit' && (
        <EditTicketModal
          ticket={modal.ticket}
          pending={actualizar.isPending}
          onClose={() => setModal(null)}
          onSave={(nuevoEstado) => actualizar.mutate({ factId: modal.ticket.fact_id, nuevoEstado })}
        />
      )}

      {modal?.mode === 'view' && (
        <ViewTicketModal factId={modal.ticket.fact_id} onClose={() => setModal(null)} />
      )}

      {modal?.mode === 'resolver' && (
        <CrudModal
          isOpen
          mode="delete"
          title="Resolver ticket"
          confirmLabel="Marcar como resuelto"
          loading={actualizar.isPending}
          onClose={() => setModal(null)}
          onConfirm={() => actualizar.mutate({ factId: modal.ticket.fact_id, nuevoEstado: 'resuelto' })}
        >
          <p>
            El ticket <strong>#{modal.ticket.fact_id}</strong> (&quot;{modal.ticket.asunto}&quot;) se marcará como resuelto
            y quedará registrada la fecha de resolución.
          </p>
        </CrudModal>
      )}
    </section>
  )
}

function CreateTicketModal({ pending, onClose, onSave }: {
  pending: boolean
  onClose: () => void
  onSave: (vals: { asunto: string; descripcion: string; usuarioId: string }) => void
}) {
  const [asunto, setAsunto]         = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [usuario, setUsuario]       = useState<UserSearchResult | null>(null)
  const valido = asunto.trim().length > 0 && descripcion.trim().length > 0 && !!usuario

  return (
    <CrudModal
      isOpen
      mode="create"
      title="Nuevo ticket"
      confirmLabel="Crear ticket"
      loading={pending}
      onClose={onClose}
      onConfirm={() => valido && onSave({ asunto, descripcion, usuarioId: usuario!.usuario_id })}
    >
      <UserPicker
        label="Usuario afectado"
        selected={usuario}
        onSelect={setUsuario}
        onClear={() => setUsuario(null)}
      />
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="tk-asunto">Asunto</label>
        <input id="tk-asunto" className={styles.input} maxLength={200} value={asunto} onChange={(e) => setAsunto(e.target.value)} placeholder="No puedo reproducir un track" />
      </div>
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="tk-desc">Descripción</label>
        <textarea id="tk-desc" className={styles.textarea} rows={4} maxLength={5000} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
      </div>
      <p className={styles.queueRowMeta}>El ticket se crea con estado "abierto".</p>
    </CrudModal>
  )
}

function EditTicketModal({ ticket, pending, onClose, onSave }: {
  ticket: Ticket
  pending: boolean
  onClose: () => void
  onSave: (estado: EstadoTicket) => void
}) {
  const [estado, setEstado] = useState<EstadoTicket>(ticket.estado)

  return (
    <CrudModal
      isOpen
      mode="edit"
      title={`Editar ticket #${ticket.fact_id}`}
      loading={pending}
      onClose={onClose}
      onConfirm={() => onSave(estado)}
    >
      <div className={styles.field}>
        <label className={styles.fieldLabel}>Asunto</label>
        <input className={styles.input} value={ticket.asunto} disabled />
      </div>
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="tk-estado">Estado</label>
        <select id="tk-estado" className={styles.select} value={estado} onChange={(e) => setEstado(e.target.value as EstadoTicket)}>
          {ESTADOS.map((e) => <option key={e} value={e}>{e.replace('_', ' ')}</option>)}
        </select>
      </div>
    </CrudModal>
  )
}

function ViewTicketModal({ factId, onClose }: { factId: number; onClose: () => void }) {
  const detalle = useQuery({
    queryKey: ['experiencia', 'admin', 'ticket', factId],
    queryFn:  () => experienciaApi.ticketPorId(factId),
  })
  const t = detalle.data

  return (
    <CrudModal isOpen mode="view" title={`Ticket #${factId}`} onClose={onClose} onConfirm={onClose}>
      {detalle.isLoading || !t ? (
        <SkeletonLoader count={5} height={16} />
      ) : (
        <>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Usuario</label>
            <input className={styles.input} value={t.usuario_id ?? '—'} readOnly />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Asunto</label>
            <input className={styles.input} value={t.asunto} readOnly />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Descripción</label>
            <textarea className={styles.textarea} rows={4} value={t.descripcion} readOnly />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Estado</label>
            <input className={styles.input} value={t.estado.replace('_', ' ')} readOnly />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Fecha de creación</label>
            <input className={styles.input} value={fmtDate(t.fecha_creacion)} readOnly />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Fecha de resolución</label>
            <input className={styles.input} value={t.fecha_resolucion ? fmtDate(t.fecha_resolucion) : 'Sin resolver'} readOnly />
          </div>
        </>
      )}
    </CrudModal>
  )
}
