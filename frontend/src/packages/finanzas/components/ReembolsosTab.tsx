import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiErrorMessage } from '@shared/lib/api-client'
import { useToast } from '@shared/context/ToastContext'
import { ExportPDFButton } from '@shared/components/ExportPDFButton'
import { finanzasApi } from '../api/finanzas.api'
import { ReembolsosScatter } from './charts/ReembolsosScatter'
import { fmtMoney, fmtDate, isoDaysAgo, isoToday } from '../lib/format'
import type { ReembolsoBody } from '../types'
import styles from '../pages/FinanzasPages.module.css'

const UMBRAL_ELEVADO = 500 // REEMBOLSO_MONTO_ALTO_USD en finanzas/deps.py — mismo umbral que dispara la alerta

const emptyForm: ReembolsoBody = { transaccion_id: '', monto: 0, tipo: 'total', motivo: '' }

// Reembolsos (CU-O85/O86) — el backend valida (no exceder lo pagado menos
// reembolsos previos, transacción `exitosa`) y rechaza antes de insertar; el
// formulario no duplica esa lógica, solo muestra el error real del backend.
export function ReembolsosTab() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const reportRef = useRef<HTMLDivElement>(null)

  const [form, setForm] = useState<ReembolsoBody>(emptyForm)
  const procesar = useMutation({
    mutationFn: () => finanzasApi.procesarReembolso(form),
    onSuccess: () => {
      setForm(emptyForm)
      queryClient.invalidateQueries({ queryKey: ['finanzas', 'reembolsos'] })
      toast.success('Reembolso procesado')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo procesar el reembolso.')),
  })

  const [desde, setDesde] = useState(isoDaysAgo(30))
  const [hasta, setHasta] = useState(isoToday())
  const historial = useQuery({
    queryKey: ['finanzas', 'reembolsos', desde, hasta],
    queryFn: () => finanzasApi.historialReembolsosPorRango(desde, hasta),
  })
  const data = historial.data?.data ?? []
  const procesados = data.filter((r) => r.estado === 'procesado')

  return (
    <div ref={reportRef}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-sm)' }}>
        <ExportPDFButton targetRef={reportRef} fileName="finanzas-reembolsos" title="Finanzas — Reembolsos" />
      </div>
      <p className={styles.sectionLabel} data-pdf-export-ignore="true">Procesar reembolso</p>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault()
          if (form.transaccion_id.trim() && form.monto > 0) procesar.mutate()
        }}
        data-pdf-export-ignore="true"
      >
        <div className={styles.field} style={{ minWidth: 240 }}>
          <label className={styles.fieldLabel} htmlFor="reemb-tx">ID de transacción</label>
          <input id="reemb-tx" className={styles.input} value={form.transaccion_id} onChange={(e) => setForm({ ...form, transaccion_id: e.target.value })} placeholder="UUID de FACT_TRANSACCION_PAGO" />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="reemb-monto">Monto</label>
          <input id="reemb-monto" type="number" min="0.01" step="0.01" className={styles.input} value={form.monto || ''} onChange={(e) => setForm({ ...form, monto: Number(e.target.value) })} />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="reemb-tipo">Tipo</label>
          <select id="reemb-tipo" className={styles.select} value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as 'total' | 'parcial' })}>
            <option value="total">Total</option>
            <option value="parcial">Parcial</option>
          </select>
        </div>
        <div className={styles.field} style={{ minWidth: 220 }}>
          <label className={styles.fieldLabel} htmlFor="reemb-motivo">Motivo</label>
          <input id="reemb-motivo" className={styles.input} value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} placeholder="Ej. Reclamo de usuario" />
        </div>
        <button type="submit" className={styles.btnPrimary} disabled={procesar.isPending || !form.transaccion_id.trim() || form.monto <= 0}>
          {procesar.isPending ? 'Procesando…' : 'Procesar reembolso'}
        </button>
      </form>
      {procesar.isError && (
        <p className={styles.bannerError}>{apiErrorMessage(procesar.error, 'No se pudo procesar el reembolso — revisa el saldo disponible de la transacción.')}</p>
      )}

      <form className={styles.form} onSubmit={(e) => e.preventDefault()} data-pdf-export-ignore="true">
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="reemb-desde">Historial desde</label>
          <input id="reemb-desde" type="date" className={styles.input} value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="reemb-hasta">Hasta</label>
          <input id="reemb-hasta" type="date" className={styles.input} value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
      </form>

      <div className={styles.dashboardGrid}>
        <div className={styles.chartPanel}>
          <p className={styles.panelTitle}>Reembolsos procesados por fecha y monto (naranja = supera {fmtMoney(UMBRAL_ELEVADO)})</p>
          <ReembolsosScatter data={procesados} umbral={UMBRAL_ELEVADO} />
        </div>
        <div className={styles.kpiPanel}>
          <p className={styles.panelTitle}>Resumen del rango</p>
          <div className={styles.kpiRow}>
            <span className={styles.kpiValue}>{fmtMoney(procesados.reduce((s, r) => s + r.monto, 0))}</span>
            <span className={styles.kpiLabel}>Total reembolsado (procesado)</span>
          </div>
          <div className={styles.kpiRow}>
            <span className={styles.kpiValue}>{procesados.filter((r) => r.monto > UMBRAL_ELEVADO).length}</span>
            <span className={styles.kpiLabel}>Reembolsos elevados</span>
          </div>
        </div>
      </div>

      <div className={styles.tablePanel}>
        <table className={styles.table}>
          <thead><tr><th>Transacción</th><th>Monto</th><th>Tipo</th><th>Motivo</th><th>Estado</th><th>Fecha</th></tr></thead>
          <tbody>
            {historial.isLoading ? (
              <tr><td colSpan={6} className={styles.emptyState}>Cargando…</td></tr>
            ) : data.length === 0 ? (
              <tr><td colSpan={6} className={styles.emptyState}>Sin reembolsos en este rango.</td></tr>
            ) : data.map((r) => (
              <tr key={r.reembolso_id}>
                <td>{r.transaccion_id.slice(0, 8)}…</td>
                <td>{fmtMoney(r.monto)}</td>
                <td>{r.tipo}</td>
                <td>{r.motivo || '—'}</td>
                <td><span className={`${styles.badge} ${r.estado === 'procesado' ? styles.badgeOk : styles.badgeNeutral}`}>{r.estado}</span></td>
                <td>{fmtDate(r.fecha)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
