import { useQuery } from '@tanstack/react-query'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { MiniLineChart } from '@shared/components/charts/MiniLineChart'
import { CHART_COLORS } from '@shared/components/charts/colors'
import { seguridadApi } from '../api/seguridad.api'
import styles from './SeguridadPages.module.css'

// Dashboard (RT-04, S10 Día 3): antes esta pantalla era una tabla cruda de
// auditoría sin ningún gráfico — se agrega acciones administrativas/día
// (14 días) más 2 KPI reales, sin tocar la tabla existente debajo.
export function AuditoriaPage() {
  useDocumentTitle('Auditoría')
  const { data, isLoading, isError } = useQuery({
    queryKey: ['seguridad', 'auditoria'],
    queryFn:  () => seguridadApi.auditoria(50),
  })
  const dashboard = useQuery({
    queryKey: ['seguridad', 'dashboard'],
    queryFn:  () => seguridadApi.dashboard(),
  })

  const entradas = data?.data ?? []

  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>Auditoría</h1>

      <div className={styles.dashboardGrid}>
        <div className={styles.chartPanel}>
          <p className={styles.panelTitle}>Acciones administrativas por día (14 días)</p>
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
                <tr><td colSpan={6}>Cargando…</td></tr>
              ) : entradas.length === 0 ? (
                <tr><td colSpan={6} className={styles.empty}>Sin registros de auditoría todavía.</td></tr>
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
