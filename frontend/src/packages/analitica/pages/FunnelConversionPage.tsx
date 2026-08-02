import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { ExportPDFButton } from '@shared/components/ExportPDFButton'
import { analiticaApi } from '../api/analitica.api'
import styles from './FunnelConversionPage.module.css'

function isoMesesAtras(n: number): string {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - n)
  return d.toISOString().slice(0, 10)
}

// CU-O73 (monetizacion-retencion-mejoras): funnel free → vio anuncio → se
// suscribió — solo staff/admin (`require_staff` en backend).
export function FunnelConversionPage() {
  useDocumentTitle('Funnel de conversión')
  const reportRef = useRef<HTMLElement>(null)
  const [desde, setDesde] = useState(() => isoMesesAtras(1))
  const [hasta, setHasta] = useState(() => new Date().toISOString().slice(0, 10))

  const funnel = useQuery({
    queryKey: ['analitica', 'funnel-conversion', desde, hasta],
    queryFn:  () => analiticaApi.funnelConversion(desde, hasta),
  })

  const etapas = funnel.data
    ? [
        { label: 'Usuarios free activos',         valor: funnel.data.free_activos },
        { label: 'Vieron al menos un anuncio',     valor: funnel.data.vieron_anuncio },
        { label: 'Se suscribieron a plan de pago', valor: funnel.data.se_suscribieron },
      ]
    : []

  return (
    <section className={styles.page} ref={reportRef}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
        <h1 className={styles.heading}>Funnel de conversión</h1>
        <ExportPDFButton targetRef={reportRef} fileName="analitica-funnel-conversion" title="Funnel de conversión" />
      </div>
      <span className={styles.subtitle}>// free → vio anuncio → se suscribió</span>

      <div className={styles.filters}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Desde</span>
          <input type="date" className={styles.input} value={desde} onChange={(e) => setDesde(e.target.value)} />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Hasta</span>
          <input type="date" className={styles.input} value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </label>
      </div>

      {funnel.isLoading && <div className={styles.panel} style={{ minHeight: 160 }} />}

      {funnel.isError && (
        <div className={styles.panel}>
          <p className={styles.panelError}>No se pudo cargar el funnel de conversión.</p>
        </div>
      )}

      {funnel.data && (
        <div className={styles.panel}>
          {/* Ancho proporcional al valor real de cada etapa, no un taper
              decorativo fijo — `se_suscribieron` (altas en el rango) y
              `free_activos` (snapshot actual) no son necesariamente un
              subconjunto uno del otro, así que la barra puede no ser
              estrictamente decreciente; el ancho debe reflejar eso en vez de
              simular un funnel que siempre se angosta (ver design.md). */}
          <div className={styles.funnel}>
            {etapas.map((etapa) => {
              const max = Math.max(...etapas.map((e) => e.valor), 1)
              return (
                <div key={etapa.label} className={styles.stage}>
                  <div className={styles.stageBar} style={{ width: `${Math.max((etapa.valor / max) * 100, 4)}%` }}>
                    <span className={styles.stageValue}>{etapa.valor}</span>
                  </div>
                  <span className={styles.stageLabel}>{etapa.label}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}
