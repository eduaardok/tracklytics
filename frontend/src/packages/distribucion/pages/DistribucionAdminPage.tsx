import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { MiniBarChart } from '@shared/components/charts/MiniBarChart'
import { CHART_COLORS } from '@shared/components/charts/colors'
import { SellosTab } from '../components/SellosTab'
import { LicenciasTab } from '../components/LicenciasTab'
import { RestriccionesTab } from '../components/RestriccionesTab'
import { distribucionApi } from '../api/distribucion.api'
import styles from './DistribucionPages.module.css'

const TABS = [
  { id: 'sellos',        label: 'Sellos' },
  { id: 'licencias',     label: 'Licencias' },
  { id: 'restricciones', label: 'Restricciones' },
] as const

type TabId = typeof TABS[number]['id']

export function DistribucionAdminPage() {
  useDocumentTitle('Distribución')
  const [tab, setTab] = useState<TabId>('sellos')

  const dashboard = useQuery({
    queryKey: ['distribucion', 'dashboard'],
    queryFn:  () => distribucionApi.dashboard(),
  })

  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>Distribución</h1>

      <div className={styles.dashboardGrid}>
        <div className={styles.chartPanel}>
          <p className={styles.panelTitle}>Reproducciones bloqueadas por país (real)</p>
          <MiniBarChart
            data={(dashboard.data?.restricciones_por_pais ?? []).map((r) => ({ name: r.pais, value: r.total }))}
            color={CHART_COLORS.violeta}
          />
        </div>
        <div className={styles.kpiPanel}>
          <p className={styles.panelTitle}>Resumen</p>
          <div className={styles.kpiRow}>
            <span className={styles.kpiValue}>{dashboard.data?.licencias_activas_total ?? '—'}</span>
            <span className={styles.kpiLabel}>Licencias activas</span>
          </div>
        </div>
      </div>

      <div className={styles.tabBar} role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`${styles.tab} ${tab === t.id ? styles['tab--active'] : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'sellos' && <SellosTab />}
      {tab === 'licencias' && <LicenciasTab />}
      {tab === 'restricciones' && <RestriccionesTab />}
    </section>
  )
}
