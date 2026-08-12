import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ErrorState } from '@shared/components/ErrorState'
import { apiErrorMessage } from '@shared/lib/api-client'
import { useToast } from '@shared/context/ToastContext'
import { ExportPDFButton } from '@shared/components/ExportPDFButton'
import { distribucionApi } from '../api/distribucion.api'
import type { EstadoLicencia, Licencia } from '../types'
import styles from '../pages/DistribucionPages.module.css'

function fmtDate(iso: string | null) {
  if (!iso) return '— (indefinida)'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

function EstadoBadge({ estado }: { estado: EstadoLicencia }) {
  const cls = estado === 'activa' ? styles.badgeOk
    : estado === 'vencida' ? styles.badgeError
    : estado === 'revocada' ? styles.badgeError
    : styles.badgePending
  return <span className={`${styles.badge} ${cls}`}>{estado}</span>
}

export function LicenciasTab() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const reportRef = useRef<HTMLDivElement>(null)
  const [selloId, setSelloId] = useState('')
  const [paisId, setPaisId] = useState('')
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')
  const [filtroSello, setFiltroSello] = useState('')
  const [filtroPais, setFiltroPais] = useState('')

  const [revocando, setRevocando] = useState<Licencia | null>(null)
  const [motivo, setMotivo] = useState('')

  const sellos = useQuery({ queryKey: ['distribucion', 'sellos'], queryFn: () => distribucionApi.sellos() })
  const paises  = useQuery({ queryKey: ['distribucion', 'paises'],  queryFn: () => distribucionApi.paises() })

  const revocar = useMutation({
    mutationFn: () => distribucionApi.revocarLicencia(revocando!.licencia_id, motivo.trim()),
    onSuccess: () => {
      setRevocando(null); setMotivo('')
      queryClient.invalidateQueries({ queryKey: ['distribucion', 'licencias'] })
      toast.success('Licencia revocada')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo revocar la licencia.')),
  })

  const licencias = useQuery({
    queryKey: ['distribucion', 'licencias', filtroSello, filtroPais],
    queryFn:  () => distribucionApi.licencias({
      selloId: filtroSello ? Number(filtroSello) : undefined,
      paisId:  filtroPais  ? Number(filtroPais)  : undefined,
    }),
  })

  const fechaFinInvalida = fechaFin !== '' && fechaInicio !== '' && fechaFin <= fechaInicio

  const crear = useMutation({
    mutationFn: () => distribucionApi.crearLicencia({
      sello_id: Number(selloId),
      pais_id:  Number(paisId),
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin || null,
    }),
    onSuccess: () => {
      setFechaInicio(''); setFechaFin('')
      queryClient.invalidateQueries({ queryKey: ['distribucion', 'licencias'] })
      toast.success('Licencia creada')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo crear la licencia.')),
  })

  const sellosData = sellos.data?.data ?? []
  const paisesData = paises.data?.data ?? []
  const data = licencias.data?.data ?? []

  return (
    <div ref={reportRef}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-sm)' }}>
        <ExportPDFButton targetRef={reportRef} fileName="distribucion-licencias" title="Distribución — Licencias" />
      </div>
      <p className={styles.sectionLabel} data-pdf-export-ignore="true">Nueva licencia</p>
      <form
        className={styles.form}
        onSubmit={(e) => { e.preventDefault(); if (selloId && paisId && fechaInicio && !fechaFinInvalida) crear.mutate() }}
        data-pdf-export-ignore="true"
      >
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="lic-sello">Sello</label>
          <select id="lic-sello" className={styles.select} value={selloId} onChange={(e) => setSelloId(e.target.value)}>
            <option value="">Selecciona…</option>
            {sellosData.map((s) => <option key={s.sello_id} value={s.sello_id}>{s.nombre}</option>)}
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="lic-pais">País</label>
          <select id="lic-pais" className={styles.select} value={paisId} onChange={(e) => setPaisId(e.target.value)}>
            <option value="">Selecciona…</option>
            {paisesData.map((p) => <option key={p.pais_id} value={p.pais_id}>{p.nombre}</option>)}
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="lic-inicio">Fecha inicio</label>
          <input id="lic-inicio" className={styles.input} type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="lic-fin">Fecha fin (opcional)</label>
          <input
            id="lic-fin"
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
        <button className={styles.btnPrimary} type="submit" disabled={crear.isPending || !selloId || !paisId || !fechaInicio || fechaFinInvalida}>
          {crear.isPending ? 'Creando…' : 'Crear licencia'}
        </button>
      </form>

      <p className={styles.sectionLabel}>Licencias</p>
      <div className={styles.form} style={{ marginBottom: 'var(--space-md)' }} data-pdf-export-ignore="true">
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="filtro-sello">Filtrar por sello</label>
          <select id="filtro-sello" className={styles.select} value={filtroSello} onChange={(e) => setFiltroSello(e.target.value)}>
            <option value="">Todos</option>
            {sellosData.map((s) => <option key={s.sello_id} value={s.sello_id}>{s.nombre}</option>)}
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="filtro-pais">Filtrar por país</label>
          <select id="filtro-pais" className={styles.select} value={filtroPais} onChange={(e) => setFiltroPais(e.target.value)}>
            <option value="">Todos</option>
            {paisesData.map((p) => <option key={p.pais_id} value={p.pais_id}>{p.nombre}</option>)}
          </select>
        </div>
      </div>

      <div className={styles.tablePanel}>
        {licencias.isError ? (
          <ErrorState message="No se pudieron cargar las licencias (¿sesión de admin?)." />
        ) : licencias.isLoading ? (
          <div style={{ padding: 'var(--space-md)' }}><span className={styles.skel} style={{ width: '40%', height: 14 }} /></div>
        ) : data.length === 0 ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyTitle}>Sin licencias</span>
            <span className={styles.emptyBody}>No hay licencias que coincidan con este filtro.</span>
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr><th>Sello</th><th>País</th><th>Inicio</th><th>Fin</th><th>Estado</th><th className={styles.actionsCol}>Acciones</th></tr>
            </thead>
            <tbody>
              {data.map((l) => (
                <tr key={l.licencia_id}>
                  <td>{l.sello_nombre}</td>
                  <td>{l.pais_nombre}</td>
                  <td>{fmtDate(l.fecha_inicio)}</td>
                  <td>{fmtDate(l.fecha_fin)}</td>
                  <td><EstadoBadge estado={l.estado} /></td>
                  <td className={styles.actionsCol}>
                    {l.estado === 'activa'
                      ? <button className={styles.btnGhostDanger} onClick={() => { setRevocando(l); setMotivo('') }}>Revocar</button>
                      : <span className={styles.muted}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {revocando && (
        <div className={styles.modalBackdrop} onMouseDown={() => setRevocando(null)}>
          <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Revocar licencia" onMouseDown={(e) => e.stopPropagation()}>
            <p className={styles.modalTitle}>Revocar licencia</p>
            <p className={styles.modalBody}>
              La licencia de <strong>{revocando.sello_nombre}</strong> en <strong>{revocando.pais_nombre}</strong> dejará de estar activa y no contará para la disponibilidad. Indica el motivo:
            </p>
            <form className={styles.modalForm} onSubmit={(e) => { e.preventDefault(); if (motivo.trim()) revocar.mutate() }}>
              <textarea
                className={styles.textarea}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej.: incumplimiento de contrato"
                rows={3}
                maxLength={500}
                autoFocus
              />
              <div className={styles.modalActions}>
                <button type="button" className={styles.btnGhost} onClick={() => setRevocando(null)}>Cancelar</button>
                <button type="submit" className={styles.btnGhostDanger} disabled={revocar.isPending || !motivo.trim()}>
                  {revocar.isPending ? 'Revocando…' : 'Revocar licencia'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
