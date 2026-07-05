import { useState } from 'react'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { SellosTab } from '../components/SellosTab'
import { LicenciasTab } from '../components/LicenciasTab'
import { RestriccionesTab } from '../components/RestriccionesTab'
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

  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>Distribución</h1>

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
