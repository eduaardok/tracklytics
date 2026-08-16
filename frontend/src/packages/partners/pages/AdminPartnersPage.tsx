import { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2 } from 'lucide-react'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { apiErrorMessage } from '@shared/lib/api-client'
import { useToast } from '@shared/context/ToastContext'
import { CrudModal } from '@shared/components/CrudModal'
import { CrudActionButtons } from '@shared/components/CrudActionButtons'
import { SkeletonTableRows } from '@shared/components/SkeletonLoader'
import { EmptyState } from '@shared/components/EmptyState'
import { ExportPDFButton } from '@shared/components/ExportPDFButton'
import { partnersAdminApi, type Partner, type EditarPartnerBody } from '../api/partnersAdmin.api'
import { metricasApi } from '../api/metricas.api'
import type { PartnerTier } from '../types'
import styles from './AdminPartnersPage.module.css'

const TIERS: { value: PartnerTier; label: string }[] = [
  { value: 'basico', label: 'Básico' },
  { value: 'pro', label: 'Pro' },
  { value: 'enterprise', label: 'Enterprise' },
]

type ModalState =
  | { mode: 'create' }
  | { mode: 'edit'; partner: Partner }
  | { mode: 'view'; partner: Partner }
  | { mode: 'delete'; partner: Partner }
  | null

// Gestión de partners B2B (change p1-ciclos-vida, rol admin_comercial): alta,
// listado, rotación y desactivación de API keys. La key en claro solo se
// muestra UNA vez (al crear o rotar) — no se puede recuperar luego.
//
// S13-P2 (patrón CRUD docente): la auditoría de S13-P1 encontró que esta
// página tenía Insertar y Desactivar pero no Editar ni Ver detalle, y sin
// filtros de tabla — se completa el ciclo con `CrudModal`/`CrudActionButtons`
// compartidos, igual que publicidad/tickets.
export function AdminPartnersPage() {
  useDocumentTitle('Partners · Gestión')
  const queryClient = useQueryClient()
  const toast = useToast()
  const reportRef = useRef<HTMLElement>(null)

  const [modal, setModal] = useState<ModalState>(null)
  const [filtroTier, setFiltroTier]     = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')

  // Key recién revelada (creación o rotación) — se muestra una sola vez.
  const [revealKey, setRevealKey] = useState<{ nombre: string; key: string } | null>(null)

  const partners = useQuery({ queryKey: ['partners', 'admin', 'list'], queryFn: () => partnersAdminApi.listar() })
  const invalidar = () => queryClient.invalidateQueries({ queryKey: ['partners', 'admin', 'list'] })

  const crear = useMutation({
    mutationFn: (vals: { nombre: string; tier: PartnerTier; email: string }) =>
      partnersAdminApi.crear({ nombre: vals.nombre.trim(), tier: vals.tier, email_contacto: vals.email.trim() }),
    onSuccess: (res) => {
      setRevealKey({ nombre: res.partner.nombre, key: res.api_key })
      invalidar()
      setModal(null)
      toast.success('Partner creado')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo crear el partner.')),
  })

  const editar = useMutation({
    mutationFn: (vars: { id: string; body: EditarPartnerBody }) => partnersAdminApi.editar(vars.id, vars.body),
    onSuccess: () => { invalidar(); setModal(null); toast.success('Partner actualizado') },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo editar el partner.')),
  })

  const rotar = useMutation({
    mutationFn: (p: Partner) => partnersAdminApi.rotarKey(p.id),
    onSuccess: (res) => {
      setRevealKey({ nombre: res.partner.nombre, key: res.api_key })
      invalidar()
      toast.success('API key rotada')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo rotar la key.')),
  })

  const desactivar = useMutation({
    mutationFn: (p: Partner) => partnersAdminApi.desactivar(p.id),
    onSuccess: () => { invalidar(); setModal(null); toast.success('Partner desactivado') },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo desactivar el partner.')),
  })

  const data: Partner[] = partners.data?.data ?? []
  const filtrados = data.filter((p) =>
    (!filtroTier || p.tier === filtroTier) && (!filtroEstado || p.estado === filtroEstado),
  )
  const estados = useMemo(() => Array.from(new Set(data.map((p) => p.estado))), [data])

  return (
    <section className={styles.page} ref={reportRef}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
        <h1 className={styles.heading}>Partners B2B</h1>
        <ExportPDFButton targetRef={reportRef} fileName="partners-gestion" title="Partners B2B" />
      </div>
      <p className={styles.intro}>Alta y ciclo de vida de partners de la API. La API key se guarda hasheada y solo se muestra una vez — al crear o rotar. Guárdala en ese momento.</p>

      {revealKey && (
        <div className={styles.keyPanel} role="alert">
          <div>
            <p className={styles.keyTitle}>API key de {revealKey.nombre}</p>
            <p className={styles.keyHint}>Cópiala ahora — no se puede recuperar después.</p>
            <code className={styles.keyValue}>{revealKey.key}</code>
          </div>
          <div className={styles.keyActions} data-pdf-export-ignore="true">
            <button className={styles.btnGhost} onClick={() => { navigator.clipboard?.writeText(revealKey.key); toast.success('Key copiada') }}>Copiar</button>
            <button className={styles.btnGhost} onClick={() => setRevealKey(null)}>Ocultar</button>
          </div>
        </div>
      )}

      <div className={styles.form} style={{ marginBottom: 'var(--space-md)' }} data-pdf-export-ignore="true">
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="f-tier">Tier</label>
          <select id="f-tier" className={styles.select} value={filtroTier} onChange={(e) => setFiltroTier(e.target.value)}>
            <option value="">Todos</option>
            {TIERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="f-estado">Estado</label>
          <select id="f-estado" className={styles.select} value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
            <option value="">Todos</option>
            {estados.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        <button type="button" className={styles.btnPrimary} onClick={() => setModal({ mode: 'create' })}>
          + Nuevo partner
        </button>
      </div>

      <div className={styles.tablePanel}>
        <table className={styles.table}>
          <thead><tr><th>Nombre</th><th>Tier</th><th>Contacto</th><th>Estado</th><th className={styles.actionsCol}>Acciones</th></tr></thead>
          <tbody>
            {partners.isLoading ? (
              <SkeletonTableRows columns={5} />
            ) : filtrados.length === 0 ? (
              <tr><td colSpan={5}><EmptyState icon={<Building2 size={22} aria-hidden="true" />} title="Sin partners" body={data.length === 0 ? 'Todavía no hay partners registrados.' : 'Prueba con otro filtro.'} /></td></tr>
            ) : filtrados.map((p) => {
              const activo = p.estado === 'vigente'
              return (
                <tr key={p.id}>
                  <td>{p.nombre}</td>
                  <td style={{ textTransform: 'capitalize' }}>{p.tier}</td>
                  <td>{p.email_contacto || '—'}</td>
                  <td><span className={`${styles.badge} ${activo ? styles.badgeOk : styles.badgeOff}`}>{activo ? 'Vigente' : 'Inactivo'}</span></td>
                  <td className={styles.actionsCol}>
                    <div className={styles.actions}>
                      <CrudActionButtons
                        onView={() => setModal({ mode: 'view', partner: p })}
                        onEdit={() => setModal({ mode: 'edit', partner: p })}
                        onDelete={activo ? () => setModal({ mode: 'delete', partner: p }) : undefined}
                        deleteLabel="Desactivar"
                      />
                      <button className={styles.btnGhost} onClick={() => rotar.mutate(p)} disabled={!activo || rotar.isPending}>
                        Rotar key
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {modal?.mode === 'create' && (
        <CreatePartnerModal
          pending={crear.isPending}
          error={crear.isError ? apiErrorMessage(crear.error, 'No se pudo crear el partner.') : null}
          onClose={() => setModal(null)}
          onSave={(vals) => crear.mutate(vals)}
        />
      )}

      {modal?.mode === 'edit' && (
        <EditPartnerModal
          partner={modal.partner}
          pending={editar.isPending}
          error={editar.isError ? apiErrorMessage(editar.error, 'No se pudo editar el partner.') : null}
          onClose={() => setModal(null)}
          onSave={(body) => editar.mutate({ id: modal.partner.id, body })}
        />
      )}

      {modal?.mode === 'view' && (
        <ViewPartnerModal partner={modal.partner} onClose={() => setModal(null)} />
      )}

      {modal?.mode === 'delete' && (
        <CrudModal
          isOpen
          mode="delete"
          title="Desactivar partner"
          confirmLabel="Desactivar"
          loading={desactivar.isPending}
          error={desactivar.isError ? apiErrorMessage(desactivar.error, 'No se pudo desactivar el partner.') : null}
          onClose={() => setModal(null)}
          onConfirm={() => desactivar.mutate(modal.partner)}
        >
          <p>
            <strong>{modal.partner.nombre}</strong> perderá el acceso a la API: su key dejará de autenticar.
            Esta acción se puede revertir editando el estado más tarde.
          </p>
        </CrudModal>
      )}
    </section>
  )
}

function CreatePartnerModal({ pending, error, onClose, onSave }: {
  pending: boolean
  error?: string | null
  onClose: () => void
  onSave: (vals: { nombre: string; tier: PartnerTier; email: string }) => void
}) {
  const [nombre, setNombre] = useState('')
  const [tier, setTier]     = useState<PartnerTier>('basico')
  const [email, setEmail]   = useState('')
  const valido = nombre.trim().length > 0

  return (
    <CrudModal
      isOpen
      mode="create"
      title="Nuevo partner"
      confirmLabel="Crear partner"
      loading={pending}
      error={error}
      onClose={onClose}
      onConfirm={() => valido && onSave({ nombre, tier, email })}
    >
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="p-nombre">Nombre</label>
        <input id="p-nombre" className={styles.input} maxLength={200} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Acme Data Inc." />
      </div>
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="p-tier">Tier</label>
        <select id="p-tier" className={styles.select} value={tier} onChange={(e) => setTier(e.target.value as PartnerTier)}>
          {TIERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="p-email">Email de contacto</label>
        <input id="p-email" className={styles.input} type="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="data@acme.com" />
      </div>
    </CrudModal>
  )
}

function EditPartnerModal({ partner, pending, error, onClose, onSave }: {
  partner: Partner
  pending: boolean
  error?: string | null
  onClose: () => void
  onSave: (body: EditarPartnerBody) => void
}) {
  const [nombre, setNombre] = useState(partner.nombre)
  const [tier, setTier]     = useState<PartnerTier>(partner.tier)
  const [email, setEmail]   = useState(partner.email_contacto)
  const [estado, setEstado] = useState<'vigente' | 'inactivo'>(partner.estado === 'vigente' ? 'vigente' : 'inactivo')
  const valido = nombre.trim().length > 0

  return (
    <CrudModal
      isOpen
      mode="edit"
      title={`Editar partner — ${partner.nombre}`}
      loading={pending}
      error={error}
      onClose={onClose}
      onConfirm={() => valido && onSave({ nombre: nombre.trim(), tier, email_contacto: email.trim(), estado })}
    >
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="pe-nombre">Nombre</label>
        <input id="pe-nombre" className={styles.input} maxLength={200} value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </div>
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="pe-tier">Tier</label>
        <select id="pe-tier" className={styles.select} value={tier} onChange={(e) => setTier(e.target.value as PartnerTier)}>
          {TIERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="pe-email">Email de contacto</label>
        <input id="pe-email" className={styles.input} type="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="pe-estado">Estado</label>
        <select id="pe-estado" className={styles.select} value={estado} onChange={(e) => setEstado(e.target.value as 'vigente' | 'inactivo')}>
          <option value="vigente">Vigente</option>
          <option value="inactivo">Inactivo</option>
        </select>
      </div>
    </CrudModal>
  )
}

function ViewPartnerModal({ partner, onClose }: { partner: Partner; onClose: () => void }) {
  // Último acceso API (S13-P2): no vive en el partner mismo (PocketBase) sino
  // agregado desde `LOG_LLAMADAS_PARTNER` (ClickHouse) — mismo endpoint que
  // PartnersMetricasPage, solo se busca la fila de este partner puntual.
  const metricas = useQuery({ queryKey: ['partners', 'metricas'], queryFn: () => metricasApi.porPartner() })
  const metrica = metricas.data?.data.find((m) => m.partner_id === partner.id)

  return (
    <CrudModal isOpen mode="view" title={`Partner — ${partner.nombre}`} onClose={onClose} onConfirm={onClose}>
      <div className={styles.field}>
        <label className={styles.fieldLabel}>Nombre</label>
        <input className={styles.input} value={partner.nombre} readOnly />
      </div>
      <div className={styles.field}>
        <label className={styles.fieldLabel}>Tier</label>
        <input className={styles.input} value={TIERS.find((t) => t.value === partner.tier)?.label ?? partner.tier} readOnly />
      </div>
      <div className={styles.field}>
        <label className={styles.fieldLabel}>Estado</label>
        <input className={styles.input} value={partner.estado} readOnly />
      </div>
      <div className={styles.field}>
        <label className={styles.fieldLabel}>Email de contacto</label>
        <input className={styles.input} value={partner.email_contacto || '—'} readOnly />
      </div>
      <div className={styles.field}>
        <label className={styles.fieldLabel}>Fecha de alta</label>
        <input className={styles.input} value={String(partner.created).slice(0, 16).replace('T', ' ')} readOnly />
      </div>
      <div className={styles.field}>
        <label className={styles.fieldLabel}>Fecha de expiración</label>
        <input className={styles.input} value={partner.fecha_expiracion ? String(partner.fecha_expiracion).slice(0, 10) : 'Sin expiración'} readOnly />
      </div>
      <div className={styles.field}>
        <label className={styles.fieldLabel}>Último acceso API</label>
        <input
          className={styles.input}
          value={metricas.isLoading ? 'Cargando…' : metrica?.ultima_llamada ? String(metrica.ultima_llamada).slice(0, 16).replace('T', ' ') : 'Sin llamadas registradas'}
          readOnly
        />
      </div>
    </CrudModal>
  )
}
