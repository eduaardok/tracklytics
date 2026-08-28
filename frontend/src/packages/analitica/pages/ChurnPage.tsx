import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { EmptyState } from '@shared/components/EmptyState'
import { analiticaApi } from '../api/analitica.api'
import { SkeletonChart } from '@shared/components/SkeletonLoader'
import styles from './ChurnPage.module.css'
import { ErrorState } from '@shared/components/ErrorState'
import { InfoHint } from '@shared/components/InfoHint'

function isoMesesAtras(n: number): string {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - n)
  return d.toISOString().slice(0, 10)
}

function fmtPct(n: number | null): string {
  return n == null ? '—' : `${(n * 100).toFixed(1)}%`
}

// CU-O72 (monetizacion-retencion-mejoras): ocupa el placeholder que ya
// reservaba /analitica/suscripciones para "conversiones y retención por
// cohorte" — solo staff/admin (`require_staff` en backend).
export function ChurnPage() {
  useDocumentTitle('Churn de suscripciones')
  const [desde, setDesde] = useState(() => isoMesesAtras(5))
  const [hasta, setHasta] = useState(() => new Date().toISOString().slice(0, 10))
  const [porMotivo, setPorMotivo] = useState(false)

  const churn = useQuery({
    queryKey: ['analitica', 'churn', desde, hasta, porMotivo],
    queryFn:  () => analiticaApi.churn(desde, hasta, porMotivo),
  })

  const meses = churn.data?.data ?? []
  const motivos = porMotivo
    ? Array.from(new Set(meses.flatMap((m) => Object.keys(m.por_motivo ?? {})))).sort()
    : []

  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>
        Churn de suscripciones
        <InfoHint text="Cancelaciones vs. suscripciones activas por mes, para medir retención y detectar picos de fuga de clientes." />
      </h1>
      <span className={styles.subtitle}>// cancelaciones vs. suscripciones activas por mes</span>

      <div className={styles.filters}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Desde</span>
          <input type="date" className={styles.input} value={desde} onChange={(e) => setDesde(e.target.value)} />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Hasta</span>
          <input type="date" className={styles.input} value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </label>
        <label className={styles.checkboxField}>
          <input type="checkbox" checked={porMotivo} onChange={(e) => setPorMotivo(e.target.checked)} />
          <span>Desglosar por motivo</span>
        </label>
      </div>

      {churn.isLoading && <div className={styles.panel}><SkeletonChart height={160} /></div>}

      {churn.isError && (
        <ErrorState message="No se pudo cargar la tasa de churn." />
      )}

      {!churn.isLoading && !churn.isError && meses.length === 0 && (
        <EmptyState icon="◔" title="Sin datos para el rango seleccionado" />
      )}

      {meses.length > 0 && (
        <div className={styles.panel}>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>Mes</th>
                  <th className={styles.th}>Cancelaciones</th>
                  {motivos.map((motivo) => (
                    <th key={motivo} className={styles.th}>{motivo}</th>
                  ))}
                  <th className={styles.th}>Activas al inicio</th>
                  <th className={styles.th} style={{ display: 'table-cell' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      Tasa de churn
                      <InfoHint text="Churn: porcentaje de suscripciones activas al inicio del mes que se cancelaron durante ese mes." />
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {meses.map((m) => (
                  <tr key={m.mes}>
                    <td className={styles.rowLabel}>{m.mes}</td>
                    <td className={styles.rowValue}>{m.cancelaciones}</td>
                    {motivos.map((motivo) => (
                      <td key={motivo} className={styles.rowValue}>{m.por_motivo?.[motivo] ?? 0}</td>
                    ))}
                    <td className={styles.rowValue}>{m.activas_al_inicio}</td>
                    <td className={styles.rowValue}>{fmtPct(m.tasa_churn)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {churn.data?.nota && <p className={styles.nota}>{churn.data.nota}</p>}
    </section>
  )
}
