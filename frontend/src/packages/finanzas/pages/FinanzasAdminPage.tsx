import { useState } from 'react'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { DashboardTab } from '../components/DashboardTab'
import { GastosTab } from '../components/GastosTab'
import { ReembolsosTab } from '../components/ReembolsosTab'
import { CuentasTab } from '../components/CuentasTab'
import { PresupuestoTab } from '../components/PresupuestoTab'
import { IndicadoresTab } from '../components/IndicadoresTab'
import { AlertasTab } from '../components/AlertasTab'
import { ReporteTab } from '../components/ReporteTab'
import styles from './FinanzasPages.module.css'

const TABS = [
  { id: 'dashboard',    label: 'Dashboard' },
  { id: 'gastos',       label: 'Gastos operativos' },
  { id: 'reembolsos',   label: 'Reembolsos' },
  { id: 'cuentas',      label: 'Cuentas por cobrar/pagar' },
  { id: 'presupuesto',  label: 'Presupuesto de campañas' },
  { id: 'indicadores',  label: 'Indicadores' },
  { id: 'alertas',      label: 'Alertas' },
  { id: 'reporte',      label: 'Reporte' },
] as const

type TabId = typeof TABS[number]['id']

// Panel admin de `finanzas` (CU-O82-O90): gastos operativos, reembolsos,
// cuentas por cobrar/pagar, presupuesto de campañas publicitarias,
// indicadores empresariales, alertas administrativas y reporte por periodo
// — ver openspec/specs/finanzas/spec.md para el detalle de cada requirement.
export function FinanzasAdminPage() {
  useDocumentTitle('Finanzas')
  const [tab, setTab] = useState<TabId>('dashboard')

  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>Finanzas</h1>
      <span className={styles.subtitle}>Gastos, reembolsos, cuentas por cobrar/pagar, presupuesto publicitario y salud financiera de la plataforma.</span>

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

      {tab === 'dashboard' && <DashboardTab />}
      {tab === 'gastos' && <GastosTab />}
      {tab === 'reembolsos' && <ReembolsosTab />}
      {tab === 'cuentas' && <CuentasTab />}
      {tab === 'presupuesto' && <PresupuestoTab />}
      {tab === 'indicadores' && <IndicadoresTab />}
      {tab === 'alertas' && <AlertasTab />}
      {tab === 'reporte' && <ReporteTab />}
    </section>
  )
}
