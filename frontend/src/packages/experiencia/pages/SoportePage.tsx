import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ErrorState } from '@shared/components/ErrorState'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { apiErrorMessage } from '@shared/lib/api-client'
import { useToast } from '@shared/context/ToastContext'
import { experienciaApi } from '../api/experiencia.api'
import type { EstadoTicket, Ticket } from '../types'
import styles from './ExperienciaPages.module.css'

function fmtDate(iso: string) {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

const ESTADO_CLS: Record<EstadoTicket, string> = {
  abierto:     styles.badgePending,
  en_proceso:  styles.badgePending,
  resuelto:    styles.badgeOk,
  cerrado:     styles.badgeOk,
}

function EstadoBadge({ estado }: { estado: EstadoTicket }) {
  return <span className={`${styles.badge} ${ESTADO_CLS[estado]}`}>{estado.replace('_', ' ')}</span>
}

// RF-EXP-004/005 (CU-O45/CU-O46): Usuario B2C crea tickets de soporte y ve
// el estado de los propios — el resto de la gestión (consulta global,
// actualización de estado) es exclusiva de admin y vive en `TicketsAdminPage`.
export function SoportePage() {
  useDocumentTitle('Soporte')
  const queryClient = useQueryClient()
  const toast = useToast()
  const [asunto, setAsunto] = useState('')
  const [descripcion, setDescripcion] = useState('')

  const tickets = useQuery({
    queryKey: ['experiencia', 'mis-tickets'],
    queryFn:  () => experienciaApi.misTickets(),
  })

  const crear = useMutation({
    mutationFn: () => experienciaApi.crearTicket({ asunto, descripcion }),
    onSuccess: () => {
      setAsunto('')
      setDescripcion('')
      queryClient.invalidateQueries({ queryKey: ['experiencia', 'mis-tickets'] })
      toast.success('Ticket creado')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo crear el ticket.')),
  })

  const data: Ticket[] = tickets.data?.data ?? []
  const puedeEnviar = asunto.trim() && descripcion.trim()

  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>Soporte</h1>

      <p className={styles.sectionLabel}>Nuevo ticket</p>
      <form
        className={styles.form}
        onSubmit={(e) => { e.preventDefault(); if (puedeEnviar) crear.mutate() }}
      >
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="ticket-asunto">Asunto</label>
          <input
            id="ticket-asunto"
            className={styles.input}
            value={asunto}
            onChange={(e) => setAsunto(e.target.value)}
            placeholder="No puedo reproducir un track"
          />
        </div>
        <div className={styles.field} style={{ gridColumn: '1 / -1' }}>
          <label className={styles.fieldLabel} htmlFor="ticket-descripcion">Descripción</label>
          <textarea
            id="ticket-descripcion"
            className={styles.textarea}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Describe el problema con el mayor detalle posible…"
          />
        </div>
        <button className={styles.btnPrimary} type="submit" disabled={crear.isPending || !puedeEnviar}>
          {crear.isPending ? 'Enviando…' : 'Crear ticket'}
        </button>
      </form>
      {crear.isError && <ErrorState message="No se pudo crear el ticket. Intenta de nuevo." />}
      {crear.isSuccess && <div className={styles.bannerOk} role="status">Ticket creado — te avisaremos cuando haya novedades.</div>}

      <p className={styles.sectionLabel}>Mis tickets ({data.length})</p>
      <div className={styles.tablePanel}>
        {tickets.isError ? (
          <ErrorState message="No se pudieron cargar tus tickets." style={{ margin: 'var(--space-md)' }} />
        ) : tickets.isLoading ? (
          <div style={{ padding: 'var(--space-md)' }}><span className={styles.skel} style={{ width: '40%', height: 14 }} /></div>
        ) : data.length === 0 ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyTitle}>Sin tickets</span>
            <span className={styles.emptyBody}>Cuando crees un ticket, aparecerá aquí con su estado.</span>
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr><th>Asunto</th><th>Creado</th><th>Estado</th></tr>
            </thead>
            <tbody>
              {data.map((t) => (
                <tr key={t.fact_id}>
                  <td>{t.asunto}</td>
                  <td>{fmtDate(t.fecha_creacion)}</td>
                  <td><EstadoBadge estado={t.estado} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}
