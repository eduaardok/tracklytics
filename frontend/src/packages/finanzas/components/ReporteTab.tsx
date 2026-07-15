import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ErrorState } from '@shared/components/ErrorState'
import { apiErrorMessage } from '@shared/lib/api-client'
import { CHART_COLORS, STATUS_COLORS } from '@shared/components/charts/colors'
import { finanzasApi } from '../api/finanzas.api'
import { RadialGauge } from './charts/RadialGauge'
import { CategoriaTreemap } from './charts/CategoriaTreemap'
import { fmtMoney, fmtPct, isoDaysAgo, isoToday } from '../lib/format'
import type { CategoriaGasto } from '../types'
import styles from '../pages/FinanzasPages.module.css'

// Reporte financiero por periodo (CU-O90) — un solo payload que compone
// dashboard + cuentas por cobrar/pagar + indicadores (design.md); esta vista
// solo pinta ese payload, no reimplementa ningún cálculo.
export function ReporteTab() {
  const [desde, setDesde] = useState(isoDaysAgo(30))
  const [hasta, setHasta] = useState(isoToday())
  const [rango, setRango] = useState({ desde, hasta })

  const reporte = useQuery({
    queryKey: ['finanzas', 'reporte', rango.desde, rango.hasta],
    queryFn: () => finanzasApi.reporte(rango.desde, rango.hasta),
  })

  const r = reporte.data

  return (
    <>
      <form className={styles.form} onSubmit={(e) => { e.preventDefault(); setRango({ desde, hasta }) }}>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="rep-desde">Desde</label>
          <input id="rep-desde" type="date" className={styles.input} value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="rep-hasta">Hasta</label>
          <input id="rep-hasta" type="date" className={styles.input} value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
        <button type="submit" className={styles.btnPrimary} disabled={reporte.isFetching}>
          {reporte.isFetching ? 'Generando…' : 'Generar reporte'}
        </button>
      </form>

      {reporte.isError && <ErrorState message={apiErrorMessage(reporte.error, 'No se pudo generar el reporte financiero.')} />}

      {r && (
        <>
          <div className={styles.dashboardGrid}>
            <div className={styles.kpiPanel}>
              <p className={styles.panelTitle}>Periodo {r.periodo.desde} — {r.periodo.hasta}</p>
              <div className={styles.kpiGrid}>
                <div className={styles.kpiRow}>
                  <span className={styles.kpiValueSm}>{fmtMoney(r.ingresos.total)}</span>
                  <span className={styles.kpiLabel}>Ingreso total (susc. {fmtMoney(r.ingresos.suscripciones)} + publicidad {fmtMoney(r.ingresos.publicitario)})</span>
                </div>
                <div className={styles.kpiRow}>
                  <span className={styles.kpiValueSm}>{fmtMoney(r.gastos.total)}</span>
                  <span className={styles.kpiLabel}>Gastos operativos</span>
                </div>
                <div className={styles.kpiRow}>
                  <span className={styles.kpiValueSm}>{fmtMoney(r.regalias.pagadas)}</span>
                  <span className={styles.kpiLabel}>Regalías pagadas ({fmtMoney(r.regalias.retiros_procesados)} retirados)</span>
                </div>
                <div className={styles.kpiRow}>
                  <span className={styles.kpiValueSm}>{fmtMoney(r.reembolsos_procesados)}</span>
                  <span className={styles.kpiLabel}>Reembolsos procesados</span>
                </div>
                <div className={styles.kpiRow}>
                  <span className={styles.kpiValueSm}>{fmtMoney(r.cuentas_por_cobrar.total_por_cobrar)}</span>
                  <span className={styles.kpiLabel}>Por cobrar (vencido {fmtMoney(r.cuentas_por_cobrar.total_vencido)})</span>
                </div>
                <div className={styles.kpiRow}>
                  <span className={styles.kpiValueSm}>{fmtMoney(r.cuentas_por_pagar.total_por_pagar)}</span>
                  <span className={styles.kpiLabel}>Por pagar</span>
                </div>
                <div className={styles.kpiRow}>
                  <span className={styles.kpiValueSm}>{fmtMoney(r.utilidad_estimada)}</span>
                  <span className={styles.kpiLabel}>Utilidad estimada</span>
                </div>
                <div className={styles.kpiRow}>
                  <span className={styles.kpiValueSm}>{fmtMoney(r.indicadores.arpu)}</span>
                  <span className={styles.kpiLabel}>ARPU · crecimiento {fmtPct(r.indicadores.crecimiento_ingreso_pct)}</span>
                </div>
              </div>
            </div>
            <div className={styles.gaugePanel}>
              <p className={styles.panelTitle}>Margen</p>
              <RadialGauge
                pct={r.margen ?? 0}
                color={(r.margen ?? 0) >= 0 ? CHART_COLORS.teal : STATUS_COLORS.error}
                label="utilidad / ingreso"
                valueLabel={fmtPct(r.margen, { fromRatio: true })}
              />
            </div>
          </div>

          <p className={styles.sectionLabel}>Gastos por categoría del periodo</p>
          <CategoriaTreemap data={r.gastos.por_categoria.map((g) => ({ categoria: g.categoria as CategoriaGasto, total: g.total }))} />
        </>
      )}

      {!r && !reporte.isFetching && !reporte.isError && (
        <div className={styles.emptyState}>Elegí un rango de fechas y generá el reporte.</div>
      )}
    </>
  )
}
