import { useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity } from 'lucide-react'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { ErrorState } from '@shared/components/ErrorState'
import { EmptyState } from '@shared/components/EmptyState'
import { ExportPDFButton } from '@shared/components/ExportPDFButton'
import { SkeletonChart } from '@shared/components/SkeletonLoader'
import { metricasApi } from '@packages/partners/api/metricas.api'
import { ENDPOINTS } from '@packages/partners/api/partners.api'
import type { PartnerTier } from '@packages/partners/types'
import styles from './PartnersAnaliticaPage.module.css'

const TIER_LABEL: Record<PartnerTier, string> = {
  basico: 'Básico', pro: 'Pro', enterprise: 'Enterprise',
}

function tasaClass(pct: number): string {
  if (pct >= 95) return styles.badgeOk
  if (pct >= 80) return styles.badgeWarn
  return styles.badgeError
}

// P13/S17 (ComingSoonPage residual): la analítica de rendimiento por partner
// ya existía en `/seguridad/partners/metricas` (`PartnersMetricasPage`,
// `GET /app/v1/partners/metricas`) — esta vista reutiliza los mismos datos
// (sin duplicar backend) y le agrega lo único que faltaba de verdad: la
// cobertura de catálogo por tier, derivada de `ENDPOINTS` (la misma lista que
// usa la consola de prueba de `PartnersConsolePage`, no una tabla inventada).
export function PartnersAnaliticaPage() {
  useDocumentTitle('Partners')
  const reportRef = useRef<HTMLElement>(null)
  const { data, isLoading, isError } = useQuery({
    queryKey: ['analitica', 'partners-metricas'],
    queryFn:  () => metricasApi.porPartner(),
  })

  const partners = data?.data ?? []
  const promedioTasaExito = partners.length
    ? partners.reduce((acc, p) => acc + p.tasa_exito_pct, 0) / partners.length
    : 0
  const promedioLatencia = partners.length
    ? partners.reduce((acc, p) => acc + p.latencia_promedio_ms_exitosas, 0) / partners.length
    : 0

  return (
    <section className={styles.page} ref={reportRef}>
      <div className={styles.headRow} data-pdf-export-ignore="true">
        <div>
          <h1 className={styles.heading}>Partners</h1>
          <span className={styles.subtitle}>// rendimiento, SLA de entrega y cobertura de catálogo</span>
        </div>
        <ExportPDFButton targetRef={reportRef} fileName="partners-analitica" title="Partners" />
      </div>

      {isError && (
        <ErrorState title="No se pudieron cargar las métricas" message="Comprueba que la API esté activa e intenta de nuevo." />
      )}

      {!isError && isLoading && <div className={styles.panel}><SkeletonChart height={200} /></div>}

      {!isError && !isLoading && (
        <>
          <div className={styles.kpiRow}>
            <div className={styles.kpiCard}>
              <span className={styles.kpiLabel}>Partners activos</span>
              <span className={styles.kpiValue}>{partners.length}</span>
            </div>
            <div className={styles.kpiCard}>
              <span className={styles.kpiLabel}>Tasa de éxito promedio</span>
              <span className={styles.kpiValue}>{promedioTasaExito.toFixed(1)}%</span>
            </div>
            <div className={styles.kpiCard}>
              <span className={styles.kpiLabel}>Latencia promedio (éxito)</span>
              <span className={styles.kpiValue}>{promedioLatencia.toFixed(0)} ms</span>
            </div>
          </div>

          {partners.length === 0 ? (
            <EmptyState
              icon={<Activity size={22} aria-hidden="true" />}
              title="Sin llamadas registradas todavía"
              body="En cuanto un partner consuma /partners/v1/*, su rendimiento aparecerá aquí."
            />
          ) : (
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
                      <span className={styles.statLabel}>Con error</span>
                      <span className={styles.statValue}>{p.llamadas_error.toLocaleString('es')}</span>
                    </div>
                    <div className={styles.stat}>
                      <span className={styles.statLabel}>Latencia prom. (SLA)</span>
                      <span className={styles.statValue}>{p.latencia_promedio_ms_exitosas.toFixed(0)} ms</span>
                    </div>
                    <div className={styles.stat}>
                      <span className={styles.statLabel}>Última llamada</span>
                      <span className={styles.statValue}>{p.ultima_llamada ?? '—'}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className={styles.sectionLabel}>Cobertura de catálogo por tier</p>
          <div className={styles.panel}>
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>Recurso</th>
                    <th className={styles.th}>Tier mínimo requerido</th>
                  </tr>
                </thead>
                <tbody>
                  {ENDPOINTS.map((ep) => (
                    <tr key={ep.id}>
                      <td className={styles.rowLabel}>{ep.label}</td>
                      <td className={styles.rowValue}>
                        <span className={`${styles.tierChip} ${styles[`tier_${ep.minTier}`]}`}>
                          {TIER_LABEL[ep.minTier]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={styles.nota}>
              Básico y Pro comparten hoy el mismo acceso (catálogo paginado, hasta 100 filas
              por página) — el único salto real de cobertura es a Enterprise, que además
              desbloquea la exportación masiva (hasta 5.000 filas por llamada).
            </p>
          </div>
        </>
      )}
    </section>
  )
}
