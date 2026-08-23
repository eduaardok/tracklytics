import { useQuery } from '@tanstack/react-query'
import { ErrorState } from '@shared/components/ErrorState'
import { apiErrorMessage } from '@shared/lib/api-client'
import { CHART_COLORS, STATUS_COLORS } from '@shared/components/charts/colors'
import { finanzasApi } from '../api/finanzas.api'
import { RadialGauge } from './charts/RadialGauge'
import { fmtMoney, fmtDate } from '../lib/format'
import { SkeletonTableRows } from '@shared/components/SkeletonLoader'
import styles from '../pages/FinanzasPages.module.css'

// Cuentas por cobrar / por pagar (CU-O84) — on-read sobre FACT_INVOICE +
// FACT_RETIRO_REGALIA + saldo de regalías (design.md, Decisión 3): sin tabla
// de estado propia, así que esta vista solo lee, nunca muta.
export function CuentasTab() {
  const cuentas = useQuery({ queryKey: ['finanzas', 'cuentas'], queryFn: () => finanzasApi.cuentas() })

  if (cuentas.isError) return <ErrorState message={apiErrorMessage(cuentas.error, 'No se pudo cargar cuentas por cobrar/pagar.')} />

  const cobrar = cuentas.data?.cuentas_por_cobrar
  const pagar = cuentas.data?.cuentas_por_pagar
  const pctVencido = cobrar && cobrar.total_por_cobrar > 0 ? cobrar.total_vencido / cobrar.total_por_cobrar : 0

  return (
    <>
      <div className={styles.dashboardGrid}>
        <div className={styles.kpiPanel}>
          <p className={styles.panelTitle}>Por cobrar</p>
          <div className={styles.kpiGrid}>
            <div className={styles.kpiRow}>
              <span className={styles.kpiValueSm}>{cuentas.isLoading ? '…' : fmtMoney(cobrar?.total_por_cobrar)}</span>
              <span className={styles.kpiLabel}>Total pendiente ({cobrar?.num_invoices_pendientes ?? 0} invoices)</span>
            </div>
            <div className={styles.kpiRow}>
              <span className={styles.kpiValueSm}>{cuentas.isLoading ? '…' : fmtMoney(cobrar?.total_vencido)}</span>
              <span className={styles.kpiLabel}>Vencido ({cobrar?.num_invoices_vencidas ?? 0} invoices)</span>
            </div>
          </div>
          <p className={styles.panelTitle} style={{ marginTop: 'var(--space-md)' }}>Por pagar</p>
          <div className={styles.kpiGrid}>
            <div className={styles.kpiRow}>
              <span className={styles.kpiValueSm}>{cuentas.isLoading ? '…' : fmtMoney(pagar?.total_por_pagar)}</span>
              <span className={styles.kpiLabel}>Retiros pendientes ({pagar?.num_retiros_pendientes ?? 0})</span>
            </div>
            <div className={styles.kpiRow}>
              <span className={styles.kpiValueSm}>{cuentas.isLoading ? '…' : fmtMoney(pagar?.regalias_liquidadas_no_retiradas)}</span>
              <span className={styles.kpiLabel}>Regalías liquidadas sin retirar (contexto)</span>
            </div>
          </div>
        </div>

        <div className={styles.gaugePanel}>
          <p className={styles.panelTitle}>% de lo por cobrar que está vencido</p>
          {cuentas.isLoading ? <span className={styles.kpiLabel}>Calculando…</span> : (
            <RadialGauge
              pct={pctVencido}
              color={pctVencido >= 0.5 ? STATUS_COLORS.error : pctVencido >= 0.2 ? STATUS_COLORS.warning : CHART_COLORS.teal}
              label="vencido / por cobrar"
            />
          )}
        </div>
      </div>

      <p className={styles.sectionLabel}>Próximos vencimientos (invoices no vencidas, ordenadas por antigüedad)</p>
      <div className={styles.tablePanel}>
        <table className={styles.table}>
          <thead><tr><th>Invoice</th><th>Usuario</th><th>Monto + IVA</th><th>Emitida</th><th>Días desde emisión</th></tr></thead>
          <tbody>
            {cuentas.isLoading ? (
              <SkeletonTableRows columns={5} rows={5} />
            ) : (cobrar?.proximos_vencimientos.length ?? 0) === 0 ? (
              <tr><td colSpan={5} className={styles.emptyState}>Sin invoices pendientes.</td></tr>
            ) : cobrar!.proximos_vencimientos.map((i) => (
              <tr key={i.invoice_id}>
                <td>{i.invoice_id.slice(0, 8)}…</td>
                <td>{i.usuario_id.slice(0, 8)}…</td>
                <td>{fmtMoney(i.monto + i.iva)}</td>
                <td>{fmtDate(i.fecha_emision)}</td>
                <td>{i.dias_desde_emision}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className={styles.sectionLabel}>Retiros de regalía pendientes</p>
      <div className={styles.tablePanel}>
        <table className={styles.table}>
          <thead><tr><th>Retiro</th><th>Tipo</th><th>Rightsholder</th><th>Monto</th><th>Solicitado</th></tr></thead>
          <tbody>
            {cuentas.isLoading ? (
              <SkeletonTableRows columns={5} rows={5} />
            ) : (pagar?.aging_retiros.length ?? 0) === 0 ? (
              <tr><td colSpan={5} className={styles.emptyState}>Sin retiros pendientes.</td></tr>
            ) : pagar!.aging_retiros.map((r) => (
              <tr key={r.retiro_id}>
                <td>{r.retiro_id.slice(0, 8)}…</td>
                <td>{r.tipo_rightsholder}</td>
                <td>{r.rightsholder_id.slice(0, 8)}…</td>
                <td>{fmtMoney(r.monto)}</td>
                <td>{fmtDate(r.fecha_solicitud)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
