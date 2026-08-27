import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ScrollText } from 'lucide-react'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { MiniLineChart } from '@shared/components/charts/MiniLineChart'
import { CHART_COLORS } from '@shared/components/charts/colors'
import { SkeletonTableRows } from '@shared/components/SkeletonLoader'
import { EmptyState } from '@shared/components/EmptyState'
import { ErrorState } from '@shared/components/ErrorState'
import { ExportPDFButton } from '@shared/components/ExportPDFButton'
import { apiErrorMessage } from '@shared/lib/api-client'
import { seguridadApi } from '../api/seguridad.api'
import styles from './SeguridadPages.module.css'

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

// Dashboard (RT-04, S10 Día 3): antes esta pantalla era una tabla cruda de
// auditoría sin ningún gráfico — se agrega acciones administrativas/día
// más 2 KPI reales, sin tocar la tabla existente debajo. Rango de fechas
// customizable (S17): antes la ventana de 14 días era fija, mismo patrón
// `desde`/`hasta` de ChurnPage/MrrArrPage (analitica).
export function AuditoriaPage() {
  useDocumentTitle('Auditoría')
  const reportRef = useRef<HTMLElement>(null)
  const [desde, setDesde] = useState(() => isoDiasAtras(13))
  const [hasta, setHasta] = useState(() => new Date().toISOString().slice(0, 10))
  const { data, isLoading, isError } = useQuery({
    queryKey: ['seguridad', 'auditoria'],
    queryFn:  () => seguridadApi.auditoria(50),
  })
  const dashboard = useQuery({
    queryKey: ['seguridad', 'dashboard', desde, hasta],
    queryFn:  () => seguridadApi.dashboard(desde, hasta),
  })

  const entradas = data?.data ?? []

  return (
    <section className={styles.page} ref={reportRef}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
        <h1 className={styles.heading}>Auditoría</h1>
        <ExportPDFButton targetRef={reportRef} fileName="auditoria" title="Auditoría" />
      </div>

      <div className={styles.form} data-pdf-export-ignore="true">
        <label className={styles.field}>
          Desde
          <input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} />
        </label>
        <label className={styles.field}>
          Hasta
          <input type="date" value={hasta} min={desde} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setHasta(e.target.value)} />
        </label>
      </div>

      {dashboard.isError ? (
        <ErrorState message={apiErrorMessage(dashboard.error, 'No se pudo cargar el rango seleccionado.')} />
      ) : (
        <div className={styles.dashboardGrid}>
          <div className={styles.chartPanel}>
            <p className={styles.panelTitle}>Acciones administrativas por día ({diasEntre(desde, hasta)} días)</p>
            <MiniLineChart
              data={dashboard.data?.acciones_por_dia ?? []}
              xKey="dia"
              series={[{ key: 'total', label: 'Acciones', color: CHART_COLORS.violeta }]}
              denseDates
            />
          </div>
          <div className={styles.kpiPanel}>
            <p className={styles.panelTitle}>Últimas 24 horas</p>
            <div className={styles.kpiRow}>
              <span className={styles.kpiValue}>{dashboard.data?.errores_24h ?? '—'}</span>
              <span className={styles.kpiLabel}>Errores de sistema</span>
            </div>
            <div className={styles.kpiRow}>
              <span className={styles.kpiValue}>{dashboard.data?.sesiones_abiertas_total ?? '—'}</span>
              <span className={styles.kpiLabel}>Sesiones abiertas ahora</span>
            </div>
          </div>
        </div>
      )}

      {isError && <div className={styles.errorBox}>No se pudo cargar la auditoría (¿sesión de admin?).</div>}

      {!isError && (
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Usuario</th>
                <th>Acción</th>
                <th>Tabla afectada</th>
                <th>Antes</th>
                <th>Después</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <SkeletonTableRows columns={6} />
              ) : entradas.length === 0 ? (
                <tr><td colSpan={6}><EmptyState icon={<ScrollText size={22} aria-hidden="true" />} title="Sin registros de auditoría todavía." /></td></tr>
              ) : (
                entradas.map((e) => (
                  <tr key={e.audit_id}>
                    <td>{e.timestamp}</td>
                    <td>
                      {e.usuario_nombre ? (
                        <span className={styles.userCell}>
                          <span className={styles.userCellName}>{e.usuario_nombre}</span>
                          <span className={styles.userCellMeta}>{e.usuario_email ?? e.usuario_id}</span>
                        </span>
                      ) : (
                        <span className={styles.userCellMeta}>{e.usuario_id || 'Sistema'}</span>
                      )}
                    </td>
                    <td>{e.accion}</td>
                    <td>{e.tabla_afectada}</td>
                    <td>{e.antes}</td>
                    <td>{e.despues}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
