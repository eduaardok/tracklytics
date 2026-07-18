import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { apiErrorMessage } from '@shared/lib/api-client'
import { useToast } from '@shared/context/ToastContext'
import { useConfirm } from '@shared/context/ConfirmContext'
import { partnersAdminApi, type Partner } from '../api/partnersAdmin.api'
import type { PartnerTier } from '../types'
import styles from './AdminPartnersPage.module.css'

const TIERS: { value: PartnerTier; label: string }[] = [
  { value: 'basico', label: 'Básico' },
  { value: 'pro', label: 'Pro' },
  { value: 'enterprise', label: 'Enterprise' },
]

// Gestión de partners B2B (change p1-ciclos-vida, rol admin_comercial): alta,
// listado, rotación y desactivación de API keys. La key en claro solo se
// muestra UNA vez (al crear o rotar) — no se puede recuperar luego.
export function AdminPartnersPage() {
  useDocumentTitle('Partners · Gestión')
  const queryClient = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()

  const [nombre, setNombre] = useState('')
  const [tier, setTier] = useState<PartnerTier>('basico')
  const [email, setEmail] = useState('')
  // Key recién revelada (creación o rotación) — se muestra una sola vez.
  const [revealKey, setRevealKey] = useState<{ nombre: string; key: string } | null>(null)

  const partners = useQuery({ queryKey: ['partners', 'admin', 'list'], queryFn: () => partnersAdminApi.listar() })
  const invalidar = () => queryClient.invalidateQueries({ queryKey: ['partners', 'admin', 'list'] })

  const crear = useMutation({
    mutationFn: () => partnersAdminApi.crear({ nombre: nombre.trim(), tier, email_contacto: email.trim() }),
    onSuccess: (res) => {
      setNombre(''); setEmail(''); setTier('basico')
      setRevealKey({ nombre: res.partner.nombre, key: res.api_key })
      invalidar()
      toast.success('Partner creado')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo crear el partner.')),
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
    onSuccess: () => { invalidar(); toast.success('Partner desactivado') },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo desactivar el partner.')),
  })

  async function pedirRotar(p: Partner) {
    if (await confirm(`La API key actual de "${p.nombre}" dejará de funcionar de inmediato y se generará una nueva.`, { title: 'Rotar API key', danger: true })) {
      rotar.mutate(p)
    }
  }
  async function pedirDesactivar(p: Partner) {
    if (await confirm(`"${p.nombre}" perderá el acceso a la API: su key dejará de autenticar.`, { title: 'Desactivar partner', danger: true })) {
      desactivar.mutate(p)
    }
  }

  const data: Partner[] = partners.data?.data ?? []

  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>Partners B2B</h1>
      <p className={styles.intro}>Alta y ciclo de vida de partners de la API. La API key se guarda hasheada y solo se muestra una vez — al crear o rotar. Guárdala en ese momento.</p>

      {revealKey && (
        <div className={styles.keyPanel} role="alert">
          <div>
            <p className={styles.keyTitle}>API key de {revealKey.nombre}</p>
            <p className={styles.keyHint}>Cópiala ahora — no se puede recuperar después.</p>
            <code className={styles.keyValue}>{revealKey.key}</code>
          </div>
          <div className={styles.keyActions}>
            <button className={styles.btnGhost} onClick={() => { navigator.clipboard?.writeText(revealKey.key); toast.success('Key copiada') }}>Copiar</button>
            <button className={styles.btnGhost} onClick={() => setRevealKey(null)}>Ocultar</button>
          </div>
        </div>
      )}

      <p className={styles.sectionLabel}>Nuevo partner</p>
      <form className={styles.form} onSubmit={(e) => { e.preventDefault(); if (nombre.trim()) crear.mutate() }}>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="p-nombre">Nombre</label>
          <input id="p-nombre" className={styles.input} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Acme Data Inc." />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="p-tier">Tier</label>
          <select id="p-tier" className={styles.select} value={tier} onChange={(e) => setTier(e.target.value as PartnerTier)}>
            {TIERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="p-email">Email de contacto</label>
          <input id="p-email" className={styles.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="data@acme.com" />
        </div>
        <button type="submit" className={styles.btnPrimary} disabled={crear.isPending || !nombre.trim()}>
          {crear.isPending ? 'Creando…' : 'Crear partner'}
        </button>
      </form>

      <div className={styles.tablePanel}>
        <table className={styles.table}>
          <thead><tr><th>Nombre</th><th>Tier</th><th>Contacto</th><th>Estado</th><th className={styles.actionsCol}>Acciones</th></tr></thead>
          <tbody>
            {partners.isLoading ? (
              <tr><td colSpan={5} className={styles.emptyState}>Cargando…</td></tr>
            ) : data.length === 0 ? (
              <tr><td colSpan={5} className={styles.emptyState}>Sin partners todavía.</td></tr>
            ) : data.map((p) => {
              const activo = p.estado === 'vigente'
              return (
                <tr key={p.id}>
                  <td>{p.nombre}</td>
                  <td style={{ textTransform: 'capitalize' }}>{p.tier}</td>
                  <td>{p.email_contacto || '—'}</td>
                  <td><span className={`${styles.badge} ${activo ? styles.badgeOk : styles.badgeOff}`}>{activo ? 'Vigente' : 'Inactivo'}</span></td>
                  <td className={styles.actionsCol}>
                    <div className={styles.actions}>
                      <button className={styles.btnGhost} onClick={() => pedirRotar(p)} disabled={!activo}>Rotar key</button>
                      {activo && <button className={styles.btnGhostDanger} onClick={() => pedirDesactivar(p)}>Desactivar</button>}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
