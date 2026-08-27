import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ErrorState } from '@shared/components/ErrorState'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { UserPicker, type UserSearchResult } from '@shared/components/UserPicker'
import { MiniLineChart } from '@shared/components/charts/MiniLineChart'
import { CHART_COLORS } from '@shared/components/charts/colors'
import { ExportPDFButton } from '@shared/components/ExportPDFButton'
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

function isoDiasAtras(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

// Rango en días entre dos fechas ISO (inclusive) — para el título del
// gráfico, que antes decía "(14 días)" fijo sin reflejar el selector real.
function diasEntre(desde: string, hasta: string): number {
  const ms = new Date(hasta).getTime() - new Date(desde).getTime()
  return Math.max(1, Math.round(ms / 86_400_000) + 1)
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

const PAGE_SIZE = 50

export function AuditoriaFacturacionPage() {
  useDocumentTitle('Auditoría de facturación')
  const reportRef = useRef<HTMLElement>(null)
  const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(null)
  const [page, setPage] = useState(1)
  const [userPage, setUserPage] = useState(1)
  const buscado = selectedUser?.usuario_id ?? ''

  // Rango de fechas customizable (S17): antes la ventana de 14 días era
  // fija, mismo patrón `desde`/`hasta` de ChurnPage/MrrArrPage (analitica).
  const [desde, setDesde] = useState(() => isoDiasAtras(13))
  const [hasta, setHasta] = useState(() => new Date().toISOString().slice(0, 10))

  const dashboard = useQuery({
    queryKey: ['facturacion', 'dashboard', desde, hasta],
    queryFn:  () => facturacionApi.dashboard(desde, hasta),
  })

  // Últimas 20 transacciones globales (S12): carga sola al montar, sin
  // depender de la búsqueda de usuario de abajo — antes la página no tenía
  // ningún contenido de transacciones hasta buscar a alguien.
  const recientes = useQuery({
    queryKey: ['facturacion', 'admin', 'transacciones-recientes', page],
    queryFn:  () => facturacionApi.transaccionesRecientes(page, PAGE_SIZE),
  })
  const recientesData = recientes.data?.data ?? []
  const recientesTotal = recientes.data?.total ?? 0
  const recientesTotalPages = Math.max(1, Math.ceil(recientesTotal / PAGE_SIZE))

  const transacciones = useQuery({
    queryKey: ['facturacion', 'auditoria', 'transacciones', buscado, userPage],
    queryFn:  () => facturacionApi.transacciones(buscado, userPage, PAGE_SIZE),
    enabled:  buscado.length > 0,
  })

  const invoices = useQuery({
    queryKey: ['facturacion', 'auditoria', 'invoices', buscado],
    queryFn:  () => facturacionApi.invoices(buscado),
    enabled:  buscado.length > 0,
  })

  const transaccionesData = transacciones.data?.data ?? []
  const transaccionesTotal = transacciones.data?.total ?? 0
  const transaccionesTotalPages = Math.max(1, Math.ceil(transaccionesTotal / PAGE_SIZE))
  const invoicesData      = invoices.data?.data ?? []
  const isLoading         = transacciones.isLoading || invoices.isLoading
  const isError           = transacciones.isError   || invoices.isError

  return (
    <section className={styles.page} ref={reportRef}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
        <h1 className={styles.heading}>Auditoría de facturación</h1>
        <ExportPDFButton targetRef={reportRef} fileName="auditoria-facturacion" title="Auditoría de facturación" />
      </div>

      <div className={styles.searchForm} data-pdf-export-ignore="true">
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Desde</span>
          <input className={styles.input} type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Hasta</span>
          <input className={styles.input} type="date" value={hasta} min={desde} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setHasta(e.target.value)} />
        </label>
      </div>

      <div className={styles.dashboardGrid}>
        <div className={styles.chartPanel}>
          <p className={styles.panelTitle}>Ingreso real por día ({diasEntre(desde, hasta)} días)</p>
          <MiniLineChart
            data={dashboard.data?.ingreso_por_dia ?? []}
            xKey="dia"
            series={[{ key: 'total', label: 'Ingreso (USD)', color: CHART_COLORS.teal }]}
            denseDates
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

      <div className={styles.searchForm} data-pdf-export-ignore="true">
        <UserPicker
          label="Usuario"
          selected={selectedUser}
          onSelect={(u) => { setSelectedUser(u); setUserPage(1) }}
          onClear={() => { setSelectedUser(null); setUserPage(1) }}
        />
      </div>

      <div className={styles.auditBlock}>
        <p className={styles.sectionLabel}>Últimas transacciones</p>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Monto</th>
              <th>Moneda</th>
              <th>Estado</th>
              <th>Método de pago</th>
              <th>Fecha</th>
            </tr>
          </thead>
          <tbody>
            {recientes.isError ? (
              <tr>
                <td colSpan={6} className={styles.tableEmpty}>
                  No se pudieron cargar las transacciones recientes.
                </td>
              </tr>
            ) : recientes.isLoading ? (
              <SkelRows cols={6} n={6} />
            ) : recientesData.length === 0 ? (
              <tr>
                <td colSpan={6} className={styles.tableEmpty}>
                  Sin transacciones todavía.
                </td>
              </tr>
            ) : (
              recientesData.map((t) => (
                <tr key={t.transaccion_id}>
                  <td>{t.usuario_nombre || t.usuario_email || t.usuario_id}</td>
                  <td>{fmt(t.monto, t.moneda)}</td>
                  <td>{t.moneda}</td>
                  <td><StatusBadge estado={t.estado} /></td>
                  <td>{t.metodo_pago || '—'}</td>
                  <td>{fmtDate(t.fecha)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {recientesTotalPages > 1 && !recientes.isLoading && (
          <div className={styles.tableFooter} data-pdf-export-ignore="true">
            <button className={styles.btnGhost} type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              ← Anterior
            </button>
            <span className={styles.tableFooterText}>Página {page} / {recientesTotalPages} · {recientesTotal} transacciones</span>
            <button className={styles.btnGhost} type="button" disabled={page >= recientesTotalPages} onClick={() => setPage((p) => p + 1)}>
              Siguiente →
            </button>
          </div>
        )}
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
                        {t.suscripcion_id?.slice(0, 12)}…
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            {transaccionesTotalPages > 1 && !isLoading && (
              <div className={styles.tableFooter} data-pdf-export-ignore="true">
                <button className={styles.btnGhost} type="button" disabled={userPage <= 1} onClick={() => setUserPage((p) => p - 1)}>
                  ← Anterior
                </button>
                <span className={styles.tableFooterText}>Página {userPage} / {transaccionesTotalPages} · {transaccionesTotal} transacciones</span>
                <button className={styles.btnGhost} type="button" disabled={userPage >= transaccionesTotalPages} onClick={() => setUserPage((p) => p + 1)}>
                  Siguiente →
                </button>
              </div>
            )}
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
