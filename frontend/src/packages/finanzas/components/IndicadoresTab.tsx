import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ErrorState } from '@shared/components/ErrorState'
import { apiErrorMessage } from '@shared/lib/api-client'
import { finanzasApi } from '../api/finanzas.api'
import { IndicadoresRadar } from './charts/IndicadoresRadar'
import { fmtMoney, fmtPct, isoDaysAgo, isoToday, CATEGORIA_LABEL } from '../lib/format'
import styles from '../pages/FinanzasPages.module.css'

// Indicadores empresariales (CU-O88) — reutiliza MRR/ARR/churn ya existentes
// en `analitica` (no se reimplementan aquí); estos son los nuevos: ARPU,
// % de ingreso a regalías/gastos, ingreso promedio por anunciante,
// crecimiento vs. periodo anterior equivalente.
export function IndicadoresTab() {
  const [desde, setDesde] = useState(isoDaysAgo(30))
  const [hasta, setHasta] = useState(isoToday())

  const indicadores = useQuery({
    queryKey: ['finanzas', 'indicadores', desde, hasta],
    queryFn: () => finanzasApi.indicadores(desde, hasta),
  })

  if (indicadores.isError) return <ErrorState message={apiErrorMessage(indicadores.error, 'No se pudieron cargar los indicadores.')} />
  const d = indicadores.data

  return (
    <>
      <form className={styles.form} onSubmit={(e) => e.preventDefault()}>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="ind-desde">Desde</label>
          <input id="ind-desde" type="date" className={styles.input} value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="ind-hasta">Hasta</label>
          <input id="ind-hasta" type="date" className={styles.input} value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
      </form>

      <div className={styles.kpiGrid}>
        <div className={styles.kpiRow}>
          <span className={styles.kpiValue}>{indicadores.isLoading ? '…' : fmtMoney(d?.arpu)}</span>
          <span className={styles.kpiLabel}>ARPU ({d?.usuarios_pago_activos ?? 0} usuarios de pago)</span>
        </div>
        <div className={styles.kpiRow}>
          <span className={styles.kpiValue}>{indicadores.isLoading ? '…' : fmtMoney(d?.ingreso_promedio_por_anunciante)}</span>
          <span className={styles.kpiLabel}>Ingreso promedio por anunciante ({d?.num_anunciantes_con_ingreso ?? 0})</span>
        </div>
        <div className={styles.kpiRow}>
          <span className={styles.kpiValue}>{indicadores.isLoading ? '…' : fmtPct(d?.crecimiento_ingreso_pct)}</span>
          <span className={styles.kpiLabel}>Crecimiento de ingreso vs. periodo anterior</span>
        </div>
      </div>

      <div className={styles.dashboardGrid}>
        <div className={styles.chartPanel}>
          <p className={styles.panelTitle}>Proporciones del periodo (% del ingreso total)</p>
          <IndicadoresRadar pctRegalias={d?.pct_ingresos_regalias ?? null} pctGastos={d?.pct_ingresos_gastos ?? null} crecimiento={d?.crecimiento_ingreso_pct ?? null} />
        </div>
        <div className={styles.kpiPanel}>
          <p className={styles.panelTitle}>Gasto por categoría</p>
          {(d?.gasto_por_categoria.length ?? 0) === 0 ? (
            <span className={styles.kpiLabel}>Sin gastos en este rango.</span>
          ) : d!.gasto_por_categoria.map((g) => (
            <div className={styles.kpiRow} key={g.categoria}>
              <span className={styles.kpiValueSm}>{fmtMoney(g.total)}</span>
              <span className={styles.kpiLabel}>{CATEGORIA_LABEL[g.categoria] ?? g.categoria}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
