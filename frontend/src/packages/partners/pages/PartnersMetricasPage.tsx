import { useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { metricasApi } from '../api/metricas.api'
import { ErrorState } from '@shared/components/ErrorState'
import { EmptyState } from '@shared/components/EmptyState'
import { ExportPDFButton } from '@shared/components/ExportPDFButton'
import styles from './PartnersMetricasPage.module.css'

// CU-O56: agregación de `LOG_LLAMADAS_PARTNER` por partner — vista de solo
// lectura para staff (`role=admin`), separada de `PartnersConsolePage` (esa
// prueba una llamada individual con la API key del partner, sin sesión; esta
// consulta el historial ya acumulado de todas las llamadas reales).
function tasaClass(pct: number): string {
  if (pct >= 95) return styles.badgeOk
  if (pct >= 80) return styles.badgeWarn
  return styles.badgeError
}

export function PartnersMetricasPage() {
  useDocumentTitle('Métricas de partners')
  const reportRef = useRef<HTMLElement>(null)
  const { data, isLoading, isError } = useQuery({
    queryKey: ['partners', 'metricas'],
    queryFn:  () => metricasApi.porPartner(),
  })

  const partners = data?.data ?? []

  return (
    <section className={styles.page} ref={reportRef}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
        <h1 className={styles.heading}>Métricas de partners</h1>
        <ExportPDFButton targetRef={reportRef} fileName="partners-metricas" title="Métricas de partners" />
      </div>

      {isError && (
        <ErrorState
          title="No se pudieron cargar las métricas"
          message="Comprueba que la API esté activa e intenta de nuevo."
        />
      )}

      {!isError && isLoading && <div className={styles.panel} style={{ minHeight: 200 }} />}

      {!isError && !isLoading && partners.length === 0 && (
        <EmptyState
          icon="( ∅ )"
          title="Sin llamadas registradas todavía"
          body="En cuanto un partner consuma /partners/v1/*, sus métricas aparecerán aquí."
        />
      )}

      {!isError && !isLoading && partners.length > 0 && (
        <div className={styles.grid}>
          {partners.map((p) => (
            <div key={p.partner_id} className={styles.card}>
              <div className={styles.cardHead}>
                <span className={styles.nombre}>{p.nombre}</span>
                <span className={`${styles.badge} ${tasaClass(p.tasa_exito_pct)}`}>
                  {p.tasa_exito_pct.toFixed(2)}% éxito
                </span>
              </div>

              <div className={styles.statsRow}>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>Total llamadas</span>
                  <span className={styles.statValue}>{p.total_llamadas.toLocaleString('es')}</span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>Exitosas</span>
                  <span className={styles.statValue}>{p.llamadas_exitosas.toLocaleString('es')}</span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>Con error</span>
                  <span className={styles.statValue}>{p.llamadas_error.toLocaleString('es')}</span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>Latencia prom. (éxito)</span>
                  <span className={styles.statValue}>{p.latencia_promedio_ms_exitosas.toFixed(0)} ms</span>
                </div>
              </div>

              {p.desglose_por_tier.length > 0 && (
                <div className={styles.tierRow}>
                  <span className={styles.tierLabel}>Por tier</span>
                  <div className={styles.tierChips}>
                    {p.desglose_por_tier.map((t) => (
                      <span key={t.tier} className={styles.tierChip}>
                        {t.tier}: {t.total_llamadas.toLocaleString('es')}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
