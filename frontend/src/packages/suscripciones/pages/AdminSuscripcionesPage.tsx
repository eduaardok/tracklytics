import { Fragment, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { apiErrorMessage } from '@shared/lib/api-client'
import { useToast } from '@shared/context/ToastContext'
import { ExportPDFButton } from '@shared/components/ExportPDFButton'
import { suscripcionesApi, type SuscripcionAdminRecord } from '../api/suscripciones.api'
import styles from './AdminSuscripcionesPage.module.css'

// "suspendida" no existe como estado real (auditoría de validación): el
// backend nunca escribe ese valor — una suscripción incumplidora se degrada
// a pago_pendiente/se cancela (dunning, CU-O95), nunca queda "suspendida".
// Ese filtro nunca podía devolver resultados; se retira junto con el fix del
// backend (EstadoSuscripcion, api/paquetes/suscripciones/router.py).
const ESTADOS = ['activa', 'cancelada', 'pago_pendiente']

function fmtDate(iso?: string | null) {
  if (!iso) return '—'
  const d = new Date(iso.replace(' ', 'T'))
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}
function fmtMoney(v: number, moneda = 'USD') {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: moneda, maximumFractionDigits: 2 }).format(v)
}

// Administración de suscripciones individuales (change p1-ciclos-vida, rol
// admin_comercial): listado con filtros, detalle con historial de cobros,
// cancelación administrativa y extensión de cortesía.
export function AdminSuscripcionesPage() {
  useDocumentTitle('Suscripciones')
  const queryClient = useQueryClient()
  const toast = useToast()
  const reportRef = useRef<HTMLElement>(null)

  const [estado, setEstado] = useState('')
  const [planId, setPlanId] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [page, setPage] = useState(1)
  const [detalle, setDetalle] = useState<string | null>(null)
  const [cancelar, setCancelar] = useState<SuscripcionAdminRecord | null>(null)
  const [extender, setExtender] = useState<SuscripcionAdminRecord | null>(null)

  const planes = useQuery({ queryKey: ['suscripciones', 'planes-admin'], queryFn: () => suscripcionesApi.preciosAdmin() })

  const lista = useQuery({
    queryKey: ['suscripciones', 'admin', 'list', estado, planId, desde, hasta, page],
    queryFn: () => suscripcionesApi.adminListar({ estado: estado || undefined, plan_id: planId || undefined, fecha_desde: desde || undefined, fecha_hasta: hasta || undefined, page, limit: 15 }),
  })

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ['suscripciones', 'admin'] })

  const data = lista.data?.data ?? []
  const totalPages = lista.data?.total_pages ?? 1
  const planesData = planes.data?.data ?? []

  return (
    <section className={styles.page} ref={reportRef}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
        <h1 className={styles.heading}>Suscripciones</h1>
        <ExportPDFButton targetRef={reportRef} fileName="suscripciones-admin" title="Suscripciones" />
      </div>
      <p className={styles.intro}>Todas las suscripciones de usuarios. Filtra, revisa el historial de cobros, cancela por incidencia o extiende como cortesía.</p>

      <div className={styles.filters} data-pdf-export-ignore="true">
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="f-estado">Estado</label>
          <select id="f-estado" className={styles.select} value={estado} onChange={(e) => { setEstado(e.target.value); setPage(1) }}>
            <option value="">Todos</option>
            {ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="f-plan">Plan</label>
          <select id="f-plan" className={styles.select} value={planId} onChange={(e) => { setPlanId(e.target.value); setPage(1) }}>
            <option value="">Todos</option>
            {planesData.map((p) => <option key={p.plan_id} value={p.plan_id}>{p.nombre}</option>)}
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="f-desde">Creadas desde</label>
          <input id="f-desde" className={styles.select} type="date" value={desde} onChange={(e) => { setDesde(e.target.value); setPage(1) }} />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="f-hasta">Hasta</label>
          <input id="f-hasta" className={styles.select} type="date" value={hasta} onChange={(e) => { setHasta(e.target.value); setPage(1) }} />
        </div>
      </div>

      <div className={styles.tablePanel}>
        <table className={styles.table}>
          <thead><tr><th>Usuario</th><th>Plan</th><th>Monto</th><th>Estado</th><th>Creada</th><th>Vence</th><th className={styles.actionsCol}>Acciones</th></tr></thead>
          <tbody>
            {lista.isLoading ? (
              <tr><td colSpan={7} className={styles.emptyState}>Cargando…</td></tr>
            ) : data.length === 0 ? (
              <tr><td colSpan={7} className={styles.emptyState}>Sin suscripciones que coincidan.</td></tr>
            ) : data.map((s) => {
              const activa = s.estado === 'activa' || s.estado === 'pago_pendiente'
              return (
                <Fragment key={s.id}>
                  <tr>
                    <td className={styles.mono}>{s.usuario_o_cliente.slice(0, 10)}…</td>
                    <td style={{ textTransform: 'capitalize' }}>{s.tipo_plan}</td>
                    <td>{fmtMoney(s.monto, s.moneda)}</td>
                    <td><span className={`${styles.badge} ${activa ? styles.badgeOk : styles.badgeOff}`}>{s.estado}</span></td>
                    <td>{fmtDate(s.created)}</td>
                    <td>{fmtDate(s.fecha_vencimiento)}</td>
                    <td className={styles.actionsCol}>
                      <div className={styles.actions}>
                        <button className={styles.btnGhost} onClick={() => setDetalle(detalle === s.id ? null : s.id)}>{detalle === s.id ? 'Ocultar' : 'Detalle'}</button>
                        <button className={styles.btnGhost} onClick={() => setExtender(s)}>Extender</button>
                        {activa && <button className={styles.btnGhostDanger} onClick={() => setCancelar(s)}>Cancelar</button>}
                      </div>
                    </td>
                  </tr>
                  {detalle === s.id && (
                    <tr><td colSpan={7} className={styles.detailCell}><CobrosDetalle suscripcionId={s.id} /></td></tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className={styles.pager} data-pdf-export-ignore="true">
        <button className={styles.btnGhost} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</button>
        <span className={styles.pagerLabel}>Página {page} de {totalPages}</span>
        <button className={styles.btnGhost} disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Siguiente</button>
      </div>

      {cancelar && (
        <CancelarDialog
          sus={cancelar}
          onClose={() => setCancelar(null)}
          onDone={() => { setCancelar(null); invalidar() }}
          onError={(m: string) => toast.error(m)}
          onSuccess={() => toast.success('Suscripción cancelada')}
        />
      )}
      {extender && (
        <ExtenderDialog
          sus={extender}
          onClose={() => setExtender(null)}
          onDone={() => { setExtender(null); invalidar() }}
          onError={(m: string) => toast.error(m)}
          onSuccess={() => toast.success('Suscripción extendida')}
        />
      )}
    </section>
  )
}

function CobrosDetalle({ suscripcionId }: { suscripcionId: string }) {
  const q = useQuery({ queryKey: ['suscripciones', 'admin', 'detalle', suscripcionId], queryFn: () => suscripcionesApi.adminDetalle(suscripcionId) })
  const cobros = q.data?.cobros ?? []
  if (q.isLoading) return <span className={styles.detailMuted}>Cargando historial de cobros…</span>
  if (cobros.length === 0) return <span className={styles.detailMuted}>Sin cobros registrados para esta suscripción.</span>
  return (
    <table className={styles.subTable}>
      <thead><tr><th>Fecha</th><th>Monto</th><th>Estado</th><th>Concepto</th></tr></thead>
      <tbody>
        {cobros.map((c) => (
          <tr key={c.transaccion_id}>
            <td>{fmtDate(c.fecha)}</td><td>{fmtMoney(c.monto, c.moneda)}</td><td>{c.estado}</td><td>{c.concepto}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function CancelarDialog({ sus, onClose, onDone, onError, onSuccess }: {
  sus: SuscripcionAdminRecord; onClose: () => void; onDone: () => void; onError: (m: string) => void; onSuccess: () => void
}) {
  const [motivo, setMotivo] = useState('')
  const m = useMutation({
    mutationFn: () => suscripcionesApi.adminCancelar(sus.id, motivo.trim()),
    onSuccess: () => { onSuccess(); onDone() },
    onError: (err) => onError(apiErrorMessage(err, 'No se pudo cancelar la suscripción.')),
  })
  return (
    <div className={styles.modalBackdrop} onMouseDown={onClose}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Cancelar suscripción" onMouseDown={(e) => e.stopPropagation()}>
        <p className={styles.modalTitle}>Cancelar suscripción</p>
        <p className={styles.modalBody}>Se cancelará la suscripción del usuario <span className={styles.mono}>{sus.usuario_o_cliente.slice(0, 10)}…</span> (plan {sus.tipo_plan}). Indica el motivo:</p>
        <form className={styles.modalForm} onSubmit={(e) => { e.preventDefault(); if (motivo.trim()) m.mutate() }}>
          <textarea className={styles.textarea} rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: fraude, solicitud del usuario…" autoFocus />
          <div className={styles.modalActions}>
            <button type="button" className={styles.btnGhost} onClick={onClose}>Cerrar</button>
            <button type="submit" className={styles.btnGhostDanger} disabled={m.isPending || !motivo.trim()}>{m.isPending ? 'Cancelando…' : 'Cancelar suscripción'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ExtenderDialog({ sus, onClose, onDone, onError, onSuccess }: {
  sus: SuscripcionAdminRecord; onClose: () => void; onDone: () => void; onError: (m: string) => void; onSuccess: () => void
}) {
  const [dias, setDias] = useState('30')
  const [motivo, setMotivo] = useState('')
  const m = useMutation({
    mutationFn: () => suscripcionesApi.adminExtender(sus.id, Number(dias), motivo.trim()),
    onSuccess: () => { onSuccess(); onDone() },
    onError: (err) => onError(apiErrorMessage(err, 'No se pudo extender la suscripción.')),
  })
  return (
    <div className={styles.modalBackdrop} onMouseDown={onClose}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Extender suscripción" onMouseDown={(e) => e.stopPropagation()}>
        <p className={styles.modalTitle}>Extender suscripción</p>
        <p className={styles.modalBody}>Cortesía por incidente — desplaza la fecha de vencimiento del usuario <span className={styles.mono}>{sus.usuario_o_cliente.slice(0, 10)}…</span>.</p>
        <form className={styles.modalForm} onSubmit={(e) => { e.preventDefault(); if (Number(dias) > 0) m.mutate() }}>
          <label className={styles.field}><span className={styles.fieldLabel}>Días</span>
            <input className={styles.select} type="number" min="1" max="365" value={dias} onChange={(e) => setDias(e.target.value)} />
          </label>
          <label className={styles.field}><span className={styles.fieldLabel}>Motivo</span>
            <input className={styles.select} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: caída del servicio" />
          </label>
          <div className={styles.modalActions}>
            <button type="button" className={styles.btnGhost} onClick={onClose}>Cerrar</button>
            <button type="submit" className={styles.btnPrimary} disabled={m.isPending || Number(dias) <= 0}>{m.isPending ? 'Extendiendo…' : `Extender ${dias} días`}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
