import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ErrorState } from '@shared/components/ErrorState'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { UserPicker, type UserSearchResult } from '@shared/components/UserPicker'
import { MiniLineChart } from '@shared/components/charts/MiniLineChart'
import { CHART_COLORS } from '@shared/components/charts/colors'
import { facturacionApi } from '../api/facturacion.api'
import styles from './FacturacionPages.module.css'

function fmt(monto: number, moneda = 'EUR') {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: moneda }).format(monto)
}

function fmtDate(iso: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('es-ES')
}

function StatusBadge({ estado }: { estado: string }) {
  const cls =
    estado === 'exitosa' || estado === 'emitido'
      ? styles.badgeOk
      : estado === 'fallida' || estado === 'anulado'
      ? styles.badgeDenied
      : styles.badgePending
  return <span className={`${styles.badge} ${cls}`}>{estado}</span>
}

function SkelRows({ cols, n = 4 }: { cols: number; n?: number }) {
  return (
    <>
      {Array.from({ length: n }).map((_, i) => (
        <tr key={i}>
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} className={styles.skelCell}>
              <span
                className={styles.skel}
                style={{
                  width: j === 0 ? '80px' : j === cols - 1 ? '56px' : '100%',
                  height: '13px',
                }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

export function AuditoriaFacturacionPage() {
  useDocumentTitle('Auditoría de facturación')
  const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(null)
  const buscado = selectedUser?.usuario_id ?? ''

  const dashboard = useQuery({
    queryKey: ['facturacion', 'dashboard'],
    queryFn:  () => facturacionApi.dashboard(),
  })

  const transacciones = useQuery({
    queryKey: ['facturacion', 'auditoria', 'transacciones', buscado],
    queryFn:  () => facturacionApi.transacciones(buscado),
    enabled:  buscado.length > 0,
  })

  const invoices = useQuery({
    queryKey: ['facturacion', 'auditoria', 'invoices', buscado],
    queryFn:  () => facturacionApi.invoices(buscado),
    enabled:  buscado.length > 0,
  })

  const transaccionesData = transacciones.data?.data ?? []
  const invoicesData      = invoices.data?.data ?? []
  const isLoading         = transacciones.isLoading || invoices.isLoading
  const isError           = transacciones.isError   || invoices.isError

  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>Auditoría de facturación</h1>

      <div className={styles.dashboardGrid}>
        <div className={styles.chartPanel}>
          <p className={styles.panelTitle}>Ingreso real por día (14 días)</p>
          <MiniLineChart
            data={dashboard.data?.ingreso_por_dia ?? []}
            xKey="dia"
            series={[{ key: 'total', label: 'Ingreso (USD)', color: CHART_COLORS.teal }]}
          />
        </div>
        <div className={styles.kpiPanel}>
          <p className={styles.panelTitle}>Resumen</p>
          <div className={styles.kpiRow}>
            <span className={styles.kpiValue}>{fmt(dashboard.data?.ingreso_total_historico ?? 0, 'USD')}</span>
            <span className={styles.kpiLabel}>Ingreso histórico total</span>
          </div>
          <div className={styles.kpiRow}>
            <span className={styles.kpiValue}>{dashboard.data?.transacciones_24h ?? '—'}</span>
            <span className={styles.kpiLabel}>Transacciones últimas 24h</span>
          </div>
        </div>
      </div>

      <div className={styles.searchForm}>
        <UserPicker
          label="Usuario"
          selected={selectedUser}
          onSelect={setSelectedUser}
          onClear={() => setSelectedUser(null)}
        />
      </div>

      {!buscado && (
        <div className={styles.prompt}>
          <p className={styles.promptText}>
            Busca un usuario para ver su historial de facturación.
          </p>
        </div>
      )}

      {buscado && isError && (
        <ErrorState message="No se pudo cargar la facturación — verifica que sea una sesión de admin y que el ID exista." />
      )}

      {buscado && !isError && (
        <div className={styles.auditGrid}>
          <div className={styles.auditBlock}>
            <p className={styles.sectionLabel}>Transacciones</p>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Monto</th>
                  <th>Estado</th>
                  <th>Suscripción</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <SkelRows cols={4} />
                ) : transaccionesData.length === 0 ? (
                  <tr>
                    <td colSpan={4} className={styles.tableEmpty}>
                      Sin transacciones para este usuario.
                    </td>
                  </tr>
                ) : (
                  transaccionesData.map((t) => (
                    <tr key={t.transaccion_id}>
                      <td>{fmtDate(t.fecha)}</td>
                      <td>{fmt(t.monto, t.moneda)}</td>
                      <td><StatusBadge estado={t.estado} /></td>
                      <td
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.75rem',
                          color: 'var(--color-muted)',
                        }}
                      >
                        {t.suscripcion_id.slice(0, 8)}…
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className={styles.auditBlock}>
            <p className={styles.sectionLabel}>Invoices</p>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Emitido</th>
                  <th>Monto</th>
                  <th>IVA</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <SkelRows cols={4} />
                ) : invoicesData.length === 0 ? (
                  <tr>
                    <td colSpan={4} className={styles.tableEmpty}>
                      Sin invoices para este usuario.
                    </td>
                  </tr>
                ) : (
                  invoicesData.map((inv) => (
                    <tr key={inv.invoice_id}>
                      <td>{fmtDate(inv.fecha_emision)}</td>
                      <td>{fmt(inv.monto, inv.moneda ?? undefined)}</td>
                      <td>{fmt(inv.iva, inv.moneda ?? undefined)}</td>
                      <td><StatusBadge estado={inv.estado} /></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}
