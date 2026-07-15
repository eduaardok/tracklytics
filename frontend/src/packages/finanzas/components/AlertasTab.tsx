import { useQuery } from '@tanstack/react-query'
import { ErrorState } from '@shared/components/ErrorState'
import { apiErrorMessage } from '@shared/lib/api-client'
import { finanzasApi } from '../api/finanzas.api'
import { ALERTA_LABEL, severidadAlerta } from '../lib/format'
import styles from '../pages/FinanzasPages.module.css'

// Alertas financieras administrativas (CU-O89) — calculadas on-read
// (design.md, Decisión 6: sin tabla de alertas persistida), solo panel
// admin, sin notificaciones externas.
export function AlertasTab() {
  const alertas = useQuery({ queryKey: ['finanzas', 'alertas'], queryFn: () => finanzasApi.alertas() })

  if (alertas.isError) return <ErrorState message={apiErrorMessage(alertas.error, 'No se pudieron cargar las alertas financieras.')} />

  const data = alertas.data?.data ?? []

  return (
    <>
      <p className={styles.subtitle}>
        {alertas.data ? `Periodo evaluado: ${alertas.data.desde} — ${alertas.data.hasta}` : ' '}
      </p>

      {alertas.isLoading ? (
        <p className={styles.kpiLabel}>Evaluando condiciones…</p>
      ) : data.length === 0 ? (
        <div className={styles.emptyState}>Sin alertas activas — ninguna condición vigilada se cumple hoy.</div>
      ) : (
        <div className={styles.alertList}>
          {data.map((a, i) => {
            const sev = severidadAlerta(a.tipo)
            return (
              <div key={`${a.tipo}-${i}`} className={`${styles.alertRow} ${sev === 'error' ? styles['alertRow--error'] : styles['alertRow--warning']}`}>
                <span className={`${styles.alertDot} ${sev === 'error' ? styles['alertDot--error'] : styles['alertDot--warning']}`} aria-hidden="true" />
                <span className={styles.alertText}>
                  <strong>{ALERTA_LABEL[a.tipo] ?? a.tipo}</strong> — {a.detalle}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
