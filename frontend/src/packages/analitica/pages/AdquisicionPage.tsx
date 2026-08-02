import { useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { analiticaApi } from '../api/analitica.api'
import { TierUpsell } from '../components/TierUpsell'
import { tierInsuficienteInfo } from '../lib/tierError'
import { ExportPDFButton } from '@shared/components/ExportPDFButton'
import type { AdquisicionCanal } from '../types'
import styles from './AdquisicionPage.module.css'

// Tabla (no gráfico de barras apiladas) — evita introducir una paleta
// categórica nueva de 4 colores sin pasar por la validación de contraste del
// skill `dataviz` (ya aplicada a las paletas existentes de 2-3 colores del
// proyecto); design.md de `completar-modelo-base` deja la tabla como opción
// válida para esta vista.
function pivotByCanal(rows: AdquisicionCanal[]) {
  const canales = Array.from(new Set(rows.map((r) => r.canal))).sort()
  const semanas = Array.from(new Set(rows.map((r) => r.semana))).sort()
  const porSemana = new Map<string, Map<string, number>>()
  for (const r of rows) {
    if (!porSemana.has(r.semana)) porSemana.set(r.semana, new Map())
    porSemana.get(r.semana)!.set(r.canal, r.usuarios_nuevos)
  }
  return { canales, semanas, porSemana }
}

export function AdquisicionPage() {
  useDocumentTitle('Adquisición de usuarios')
  const reportRef = useRef<HTMLElement>(null)
  const adquisicion = useQuery({
    queryKey: ['analitica', 'adquisicion'],
    queryFn:  () => analiticaApi.adquisicion(),
  })

  const data = adquisicion.data?.data ?? []
  const { canales, semanas, porSemana } = pivotByCanal(data)
  const tierInfo = tierInsuficienteInfo(adquisicion.error)

  return (
    <section className={styles.page} ref={reportRef}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
        <h1 className={styles.heading}>Adquisición de usuarios</h1>
        <ExportPDFButton targetRef={reportRef} fileName="analitica-adquisicion" title="Adquisición de usuarios" />
      </div>
      <span className={styles.subtitle}>
        {semanas.length > 0 ? `// ${semanas.length} semanas` : '// usuarios nuevos por canal de marketing'}
      </span>

      {adquisicion.isLoading && <div className={styles.panel} style={{ minHeight: 200 }} />}

      {adquisicion.isError && (
        tierInfo ? (
          <TierUpsell tierRequerido={tierInfo.tierRequerido} tierActual={tierInfo.tierActual} />
        ) : (
          <div className={styles.panel}>
            <p className={styles.panelError}>No se pudo cargar la adquisición de usuarios.</p>
          </div>
        )
      )}

      {!adquisicion.isLoading && !adquisicion.isError && semanas.length === 0 && (
        <div className={styles.prompt}>
          <p className={styles.promptText}>Sin datos de adquisición todavía.</p>
        </div>
      )}

      {semanas.length > 0 && (
        <div className={styles.panel}>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>Semana</th>
                  {canales.map((canal) => (
                    <th key={canal} className={styles.th}>{canal}</th>
                  ))}
                  <th className={styles.th}>Total</th>
                </tr>
              </thead>
              <tbody>
                {semanas.map((semana) => {
                  const fila = porSemana.get(semana)!
                  const total = canales.reduce((acc, c) => acc + (fila.get(c) ?? 0), 0)
                  return (
                    <tr key={semana}>
                      <td className={styles.rowLabel}>{semana}</td>
                      {canales.map((canal) => (
                        <td key={canal} className={styles.rowValue}>{fila.get(canal) ?? 0}</td>
                      ))}
                      <td className={styles.rowValue}><strong>{total}</strong></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}
