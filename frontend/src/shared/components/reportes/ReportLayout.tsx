import { useRef, type ReactNode } from 'react'
import { AlertCircle, BarChart3 } from 'lucide-react'
import { SkeletonLoader } from '@shared/components/SkeletonLoader'
import { EmptyState } from '@shared/components/EmptyState'
import { ExportPDFButton } from '@shared/components/ExportPDFButton'
import { genreAccent } from '@shared/lib/genre-colors'
import styles from './ReportLayout.module.css'

type Props = {
  titulo:              string
  departamento:        string
  codigoInforme:       string
  codigoObjetivo:      string
  children:            ReactNode
  periodosDisponibles: string[]
  periodoInicio:       string | null
  periodoFin:          string | null
  onPeriodoChange:     (inicio: string | null, fin: string | null) => void
  loading:             boolean
  error:               string | null
  sinDatos:            boolean
  hayEstimados:        boolean
  ultimaActualizacion: string | null
}

function fmtFecha(iso: string) {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

// Wrapper común de los 30 informes compuestos (S13-P3b) — cada página de
// informe es SOLO `ReportLayout` + las plantillas de contenido
// (KpiCards/TrendChart/RankingTable/DistributionChart/PredictionChart); este
// componente nunca conoce las métricas de ningún informe puntual, solo el
// estado de carga/error/filtro que los 30 comparten.
export function ReportLayout({
  titulo, departamento, codigoInforme, codigoObjetivo, children,
  periodosDisponibles, periodoInicio, periodoFin, onPeriodoChange,
  loading, error, sinDatos, hayEstimados, ultimaActualizacion,
}: Props) {
  const colorDepto = genreAccent(departamento)
  const reportRef = useRef<HTMLElement>(null)
  const hayContenido = !loading && !error && !sinDatos

  return (
    <section className={styles.page} ref={reportRef}>
      <header className={styles.head}>
        <div className={styles.headTop}>
          <span className={styles.badgeDepto} style={{ color: colorDepto, borderColor: colorDepto }}>
            {departamento}
          </span>
          <span className={styles.codigos}>{codigoInforme} · {codigoObjetivo}</span>
          {hayContenido && (
            <span className={styles.exportSlot}>
              <ExportPDFButton targetRef={reportRef} fileName={`informe-${codigoInforme}`} title={titulo} />
            </span>
          )}
        </div>
        <h1 className={styles.heading}>{titulo}</h1>

        {periodosDisponibles.length > 0 && (
          <div className={styles.filtros}>
            <label className={styles.filtroField}>
              Desde
              <select
                value={periodoInicio ?? ''}
                onChange={(e) => onPeriodoChange(e.target.value || null, periodoFin)}
              >
                <option value="">{periodosDisponibles[0]}</option>
                {periodosDisponibles.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label className={styles.filtroField}>
              Hasta
              <select
                value={periodoFin ?? ''}
                onChange={(e) => onPeriodoChange(periodoInicio, e.target.value || null)}
              >
                <option value="">{periodosDisponibles[periodosDisponibles.length - 1]}</option>
                {periodosDisponibles.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
          </div>
        )}
      </header>

      {loading && (
        <div className={styles.skeletonWrap}>
          <SkeletonLoader count={4} height={90} />
          <SkeletonLoader count={1} height={280} />
        </div>
      )}

      {!loading && error && (
        <EmptyState icon={<AlertCircle size={22} aria-hidden="true" />} title="No se pudo cargar el informe" body={error} />
      )}

      {!loading && !error && sinDatos && (
        <EmptyState
          icon={<BarChart3 size={22} aria-hidden="true" />}
          title="Sin datos para este período"
          body="Prueba ampliando el rango de fechas del filtro."
        />
      )}

      {!loading && !error && !sinDatos && (
        <div className={styles.fadeIn}>
          {children}
        </div>
      )}

      {!loading && !error && !sinDatos && (
        <footer className={styles.footer}>
          {ultimaActualizacion && <span>Última actualización: {fmtFecha(ultimaActualizacion)}</span>}
          {hayEstimados && (
            <span className={styles.badgeEstimado} title="Algunos períodos no tenían datos reales suficientes y se completaron con una estimación con seed fija (ver docs/BITACORA_S13.md).">
              Datos estimados
            </span>
          )}
        </footer>
      )}
    </section>
  )
}
