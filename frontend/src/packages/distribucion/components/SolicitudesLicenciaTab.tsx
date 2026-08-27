import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ErrorState } from '@shared/components/ErrorState'
import { apiErrorMessage } from '@shared/lib/api-client'
import { useToast } from '@shared/context/ToastContext'
import { useConfirm } from '@shared/context/ConfirmContext'
import { ExportPDFButton } from '@shared/components/ExportPDFButton'
import { distribucionApi } from '../api/distribucion.api'
import type { EstadoSolicitudLicencia, SolicitudLicencia } from '../types'
import styles from '../pages/DistribucionPages.module.css'

function fmtDate(iso: string | null) {
  if (!iso) return '— (indefinida)'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

function EstadoBadge({ estado }: { estado: EstadoSolicitudLicencia }) {
  const cls = estado === 'aprobada' ? styles.badgeOk : estado === 'rechazada' ? styles.badgeError : styles.badgePending
  return <span className={`${styles.badge} ${cls}`}>{estado}</span>
}

export function SolicitudesLicenciaTab() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const reportRef = useRef<HTMLDivElement>(null)

  // ── Nueva solicitud ──────────────────────────────────────────────────────
  const [selloId, setSelloId] = useState('')
  const [paisesSel, setPaisesSel] = useState<number[]>([])
  const [canalesSel, setCanalesSel] = useState<number[]>([])
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')

  // ── Ver solicitudes de un sello (interino, sin login de sello) ──────────
  const [selloConsultado, setSelloConsultado] = useState('')

  // ── Rechazo inline (motivo) ──────────────────────────────────────────────
  const [rechazandoId, setRechazandoId] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')

  const sellos = useQuery({ queryKey: ['distribucion', 'sellos'], queryFn: () => distribucionApi.sellos() })
  const paises = useQuery({ queryKey: ['distribucion', 'paises'], queryFn: () => distribucionApi.paises() })
  const canales = useQuery({ queryKey: ['distribucion', 'canales'], queryFn: () => distribucionApi.canales() })

  const pendientes = useQuery({
    queryKey: ['distribucion', 'solicitudes-licencia', 'pendiente'],
    queryFn: () => distribucionApi.solicitudesLicencia('pendiente'),
  })

  const solicitudesSello = useQuery({
    queryKey: ['distribucion', 'solicitudes-licencia', 'sello', selloConsultado],
    queryFn: () => distribucionApi.solicitudesLicenciaDeSello(Number(selloConsultado)),
    enabled: selloConsultado !== '',
  })

  const crear = useMutation({
    mutationFn: () => distribucionApi.crearSolicitudLicencia({
      sello_id: Number(selloId),
      paises_solicitados: paisesSel,
      canales_solicitados: canalesSel,
      fecha_inicio_propuesta: fechaInicio,
      fecha_fin_propuesta: fechaFin || null,
    }),
    onSuccess: () => {
      setSelloId(''); setPaisesSel([]); setCanalesSel([]); setFechaInicio(''); setFechaFin('')
      queryClient.invalidateQueries({ queryKey: ['distribucion', 'solicitudes-licencia'] })
      toast.success('Solicitud de licencia enviada')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo crear la solicitud de licencia.')),
  })

  const aprobar = useMutation({
    mutationFn: (solicitudId: string) => distribucionApi.aprobarSolicitudLicencia(solicitudId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['distribucion', 'solicitudes-licencia'] })
      queryClient.invalidateQueries({ queryKey: ['distribucion', 'licencias'] })
      queryClient.invalidateQueries({ queryKey: ['distribucion', 'dashboard'] })
      toast.success('Solicitud aprobada: licencia(s) creada(s)')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo aprobar la solicitud.')),
  })

  const rechazar = useMutation({
    mutationFn: ({ solicitudId, motivo }: { solicitudId: string; motivo: string }) =>
      distribucionApi.rechazarSolicitudLicencia(solicitudId, { motivo }),
    onSuccess: () => {
      setRechazandoId(null); setMotivo('')
      queryClient.invalidateQueries({ queryKey: ['distribucion', 'solicitudes-licencia'] })
      toast.success('Solicitud rechazada')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo rechazar la solicitud.')),
  })

  const sellosData = sellos.data?.data ?? []
  const paisesData = paises.data?.data ?? []
  const canalesData = canales.data?.data ?? []
  const pendientesData = pendientes.data?.data ?? []
  const solicitudesSelloData = solicitudesSello.data?.data ?? []

  // Fix S17 (auditoría, sección 3.3): "Aprobar" crea licencias reales de
  // inmediato (ver `onSuccess` de `aprobar` arriba) y disparaba sin
  // confirmación — a diferencia de "Rechazar", que ya pide un motivo escrito
  // antes de confirmar (fricción equivalente a un `useConfirm()`).
  async function handleAprobar(s: SolicitudLicencia) {
    const sello = sellosData.find((x) => x.sello_id === s.sello_id)
    const ok = await confirm(
      `Se crearán licencias reales para ${sello?.nombre ?? `sello #${s.sello_id}`} en los países y canales solicitados.`,
      { title: 'Aprobar solicitud de licencia', confirmLabel: 'Aprobar' },
    )
    if (ok) aprobar.mutate(s.solicitud_id)
  }

  function togglePais(id: number) {
    setPaisesSel((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]))
  }
  function toggleCanal(id: number) {
    setCanalesSel((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]))
  }

  const fechaFinInvalida = fechaFin !== '' && fechaInicio !== '' && fechaFin <= fechaInicio
  const puedeCrear = selloId !== '' && paisesSel.length > 0 && canalesSel.length > 0 && fechaInicio !== '' && !fechaFinInvalida

  return (
    <div ref={reportRef}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-sm)' }}>
        <ExportPDFButton targetRef={reportRef} fileName="distribucion-solicitudes-licencia" title="Distribución — Solicitudes de licencia" />
      </div>
      <p className={styles.sectionLabel}>Nueva solicitud de licencia</p>
      <p className={styles.emptyBody} style={{ marginBottom: 'var(--space-sm)' }}>
        Todavía no existe un login propio de sello: el admin la registra en nombre del sello. Un admin la aprueba
        o rechaza más abajo.
      </p>
      <form
        className={styles.form}
        onSubmit={(e) => { e.preventDefault(); if (puedeCrear) crear.mutate() }}
        data-pdf-export-ignore="true"
      >
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="sol-sello">Sello</label>
          <select id="sol-sello" className={styles.select} value={selloId} onChange={(e) => setSelloId(e.target.value)}>
            <option value="">Selecciona…</option>
            {sellosData.map((s) => <option key={s.sello_id} value={s.sello_id}>{s.nombre}</option>)}
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="sol-inicio">Fecha inicio propuesta</label>
          <input id="sol-inicio" className={styles.input} type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="sol-fin">Fecha fin propuesta (opcional)</label>
          <input
            id="sol-fin"
            className={styles.input}
            type="date"
            value={fechaFin}
            min={fechaInicio || undefined}
            onChange={(e) => setFechaFin(e.target.value)}
          />
          {fechaFinInvalida && (
            <span className={styles.errorText}>La fecha fin debe ser posterior a la fecha de inicio.</span>
          )}
        </div>
        <div className={styles.field} style={{ gridColumn: '1 / -1' }}>
          <span className={styles.fieldLabel}>Países solicitados</span>
          <div className={styles.checkboxGroup}>
            {paisesData.map((p) => (
              <label key={p.pais_id} className={styles.checkboxItem}>
                <input type="checkbox" checked={paisesSel.includes(p.pais_id)} onChange={() => togglePais(p.pais_id)} />
                {p.nombre}
              </label>
            ))}
          </div>
        </div>
        <div className={styles.field} style={{ gridColumn: '1 / -1' }}>
          <span className={styles.fieldLabel}>Canales solicitados</span>
          <div className={styles.checkboxGroup}>
            {canalesData.map((c) => (
              <label key={c.canal_id} className={styles.checkboxItem}>
                <input type="checkbox" checked={canalesSel.includes(c.canal_id)} onChange={() => toggleCanal(c.canal_id)} />
                {c.nombre}
              </label>
            ))}
          </div>
        </div>
        <button className={styles.btnPrimary} type="submit" disabled={crear.isPending || !puedeCrear}>
          {crear.isPending ? 'Enviando…' : 'Enviar solicitud'}
        </button>
      </form>

      <p className={styles.sectionLabel}>Solicitudes pendientes</p>
      <div className={styles.tablePanel} style={{ marginBottom: 'var(--space-xl)' }}>
        {pendientes.isError ? (
          <ErrorState message="No se pudieron cargar las solicitudes (¿sesión de admin?)." />
        ) : pendientes.isLoading ? (
          <div style={{ padding: 'var(--space-md)' }}><span className={styles.skel} style={{ width: '40%', height: 14 }} /></div>
        ) : pendientesData.length === 0 ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyTitle}>Sin solicitudes pendientes</span>
            <span className={styles.emptyBody}>No hay solicitudes de licencia esperando resolución.</span>
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr><th>Sello</th><th>Países</th><th>Canales</th><th>Inicio</th><th>Fin</th><th>Solicitada</th><th></th></tr>
            </thead>
            <tbody>
              {pendientesData.map((s) => {
                const sello = sellosData.find((x) => x.sello_id === s.sello_id)
                const isPending = (aprobar.isPending && aprobar.variables === s.solicitud_id)
                  || (rechazar.isPending && rechazar.variables?.solicitudId === s.solicitud_id)
                return (
                  <tr key={s.solicitud_id}>
                    <td>{sello?.nombre ?? `Sello #${s.sello_id}`}</td>
                    <td>{s.paises_solicitados.map((id) => paisesData.find((p) => p.pais_id === id)?.nombre ?? id).join(', ')}</td>
                    <td>{s.canales_solicitados.map((id) => canalesData.find((c) => c.canal_id === id)?.nombre ?? id).join(', ')}</td>
                    <td>{fmtDate(s.fecha_inicio_propuesta)}</td>
                    <td>{fmtDate(s.fecha_fin_propuesta)}</td>
                    <td>{fmtDate(s.fecha_solicitud)}</td>
                    <td className={styles.tableActions}>
                      {rechazandoId === s.solicitud_id ? (
                        <form
                          className={styles.inlineRejectForm}
                          onSubmit={(e) => { e.preventDefault(); if (motivo.trim()) rechazar.mutate({ solicitudId: s.solicitud_id, motivo: motivo.trim() }) }}
                        >
                          <input
                            className={styles.inlineRejectInput}
                            placeholder="Motivo del rechazo…"
                            value={motivo}
                            onChange={(e) => setMotivo(e.target.value)}
                            maxLength={500}
                            autoFocus
                          />
                          <button className={styles.btnGhostDanger} type="submit" disabled={isPending || !motivo.trim()}>
                            {isPending ? '…' : 'Confirmar'}
                          </button>
                          <button
                            type="button"
                            className={styles.btnGhost}
                            onClick={() => { setRechazandoId(null); setMotivo('') }}
                          >
                            Cancelar
                          </button>
                        </form>
                      ) : (
                        <>
                          <button
                            className={styles.btnPrimary}
                            disabled={isPending}
                            onClick={() => handleAprobar(s)}
                          >
                            {aprobar.isPending && aprobar.variables === s.solicitud_id ? '…' : 'Aprobar'}
                          </button>
                          <button
                            className={styles.btnGhostDanger}
                            disabled={isPending}
                            onClick={() => { setRechazandoId(s.solicitud_id); setMotivo('') }}
                          >
                            Rechazar
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className={styles.sectionLabel} data-pdf-export-ignore="true">Ver solicitudes de un sello</p>
      <div className={styles.form} style={{ marginBottom: 'var(--space-md)' }} data-pdf-export-ignore="true">
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="sol-sello-consulta">Sello</label>
          <select id="sol-sello-consulta" className={styles.select} value={selloConsultado} onChange={(e) => setSelloConsultado(e.target.value)}>
            <option value="">Selecciona…</option>
            {sellosData.map((s) => <option key={s.sello_id} value={s.sello_id}>{s.nombre}</option>)}
          </select>
        </div>
      </div>

      {selloConsultado !== '' && (
        <div className={styles.tablePanel}>
          {solicitudesSello.isError ? (
            <ErrorState message="No se pudieron cargar las solicitudes de este sello." />
          ) : solicitudesSello.isLoading ? (
            <div style={{ padding: 'var(--space-md)' }}><span className={styles.skel} style={{ width: '40%', height: 14 }} /></div>
          ) : solicitudesSelloData.length === 0 ? (
            <div className={styles.emptyState}>
              <span className={styles.emptyTitle}>Sin solicitudes</span>
              <span className={styles.emptyBody}>Este sello no tiene solicitudes de licencia registradas.</span>
            </div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr><th>Países</th><th>Canales</th><th>Inicio</th><th>Fin</th><th>Solicitada</th><th>Estado</th><th>Motivo rechazo</th></tr>
              </thead>
              <tbody>
                {solicitudesSelloData.map((s) => (
                  <tr key={s.solicitud_id}>
                    <td>{s.paises_solicitados.map((id) => paisesData.find((p) => p.pais_id === id)?.nombre ?? id).join(', ')}</td>
                    <td>{s.canales_solicitados.map((id) => canalesData.find((c) => c.canal_id === id)?.nombre ?? id).join(', ')}</td>
                    <td>{fmtDate(s.fecha_inicio_propuesta)}</td>
                    <td>{fmtDate(s.fecha_fin_propuesta)}</td>
                    <td>{fmtDate(s.fecha_solicitud)}</td>
                    <td><EstadoBadge estado={s.estado} /></td>
                    <td>{s.motivo_rechazo ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
