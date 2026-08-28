import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, LayoutDashboard, Sparkles, TrendingDown, TrendingUp } from 'lucide-react'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { ExportPDFButton } from '@shared/components/ExportPDFButton'
import { EmptyState } from '@shared/components/EmptyState'
import { SkeletonCard } from '@shared/components/SkeletonLoader'
import { Sparkline } from '@shared/components/charts/Sparkline'
import { analiticaApi } from '../api/analitica.api'
import type { BscKpi, BscSemaforo, BscDiagnostico } from '../types'
import { InfoHint } from '@shared/components/InfoHint'
import styles from './BalancedScorecardPage.module.css'

const SEMAFORO_COLOR: Record<BscSemaforo, string> = {
  verde:     'var(--color-success)',
  amarillo:  'var(--color-warning)',
  rojo:      'var(--color-error)',
  sin_datos: 'var(--color-muted)',
}

// El color nunca es la única señal (DESIGN.md, accesibilidad) — cada
// semáforo lleva también esta etiqueta de texto visible.
const SEMAFORO_LABEL: Record<BscSemaforo, string> = {
  verde:     'Cumple meta',
  amarillo:  'Desviación leve',
  rojo:      'Incumple meta',
  sin_datos: 'Sin datos',
}

function fmtValor(kpi: BscKpi): string {
  if (kpi.valor_actual == null) return '—'
  const num = kpi.unidad.trim() === 'USD'
    ? new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(kpi.valor_actual)
    : kpi.valor_actual.toLocaleString('es-ES', { maximumFractionDigits: 1 })
  return `${num}${kpi.unidad}`
}

function KpiRow({ kpi }: { kpi: BscKpi }) {
  const color = SEMAFORO_COLOR[kpi.semaforo]
  return (
    <div className={styles.kpiRow}>
      <span className={styles.semaforo} style={{ background: color }} aria-hidden="true" />
      <div className={styles.kpiBody}>
        <div className={styles.kpiHead}>
          <span className={styles.kpiLabel}>{kpi.indicador}</span>
          <span className={styles.kpiValue}>{fmtValor(kpi)}</span>
        </div>
        {kpi.semaforo === 'sin_datos' ? (
          <span className={styles.sinDatos}>{kpi.nota}</span>
        ) : (
          <>
            <div className={styles.progressTrack}>
              <div
                className={styles.progressFill}
                style={{ transform: `scaleX(${Math.max(0, Math.min(100, kpi.porcentaje_meta ?? 0)) / 100})`, background: color }}
              />
            </div>
            <div className={styles.kpiFoot}>
              <span className={styles.metaLabel}>
                <span className={styles.semaforoTextLabel} style={{ color }}>{SEMAFORO_LABEL[kpi.semaforo]}</span>
                {' · meta: '}{kpi.meta} ({(kpi.porcentaje_meta ?? 0).toFixed(0)}%)
              </span>
              {kpi.tendencia.length > 1 && <Sparkline data={kpi.tendencia} color={color} width={56} height={18} />}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function DiagnosticoCard({ diag }: { diag: BscDiagnostico }) {
  const color = SEMAFORO_COLOR[diag.semaforo]
  const desviacionIcon = diag.desviacion_pct == null ? null : diag.desviacion_pct >= 0
    ? <TrendingUp size={14} aria-hidden="true" />
    : <TrendingDown size={14} aria-hidden="true" />

  return (
    <div className={styles.diagCard}>
      <div className={styles.diagHead}>
        <span className={styles.semaforo} style={{ background: color }} aria-hidden="true" />
        <span className={styles.diagIndicador}>{diag.indicador}</span>
        <span className={styles.semaforoTextLabel} style={{ color }}>{SEMAFORO_LABEL[diag.semaforo]}</span>
      </div>

      {diag.semaforo === 'sin_datos' ? (
        <p className={styles.sinDatos}>{diag.nota}</p>
      ) : (
        <div className={styles.diagBody}>
          {diag.desviacion_pct != null && (
            <span className={styles.diagStat}>
              {desviacionIcon}
              Desviación vs. meta: <strong>{diag.desviacion_pct > 0 ? '+' : ''}{diag.desviacion_pct.toFixed(1)}%</strong>
            </span>
          )}
          <span className={styles.diagStat}>
            Proyección próximo período: {' '}
            <strong>{diag.proyeccion == null ? 'datos insuficientes para proyección' : diag.proyeccion.toLocaleString('es-ES', { maximumFractionDigits: 2 })}</strong>
          </span>
          {diag.anomalias.length > 0 && (
            <span className={`${styles.diagStat} ${styles.diagAnomalia}`}>
              <AlertTriangle size={14} aria-hidden="true" />
              {diag.anomalias.length} valor{diag.anomalias.length > 1 ? 'es' : ''} atípico{diag.anomalias.length > 1 ? 's' : ''} detectado{diag.anomalias.length > 1 ? 's' : ''} (Z-score)
            </span>
          )}
          {diag.proyeccion_horizonte && diag.proyeccion_horizonte.length > 1 && (
            <Sparkline data={diag.proyeccion_horizonte} color={color} width={90} height={22} />
          )}
          {diag.nota && <span className={styles.diagNota}>{diag.nota}</span>}
        </div>
      )}
    </div>
  )
}

// Balanced Scorecard estratégico (S16, Prompt 05) — dos vistas con toggle:
// "Vista Dashboard" (cuadrante 2×2 clásico) y "Vista Asistida" (mismo
// cuadrante + panel de diagnóstico algorítmico). No se reemplaza una por
// otra — el toggle solo cambia qué se renderiza, ambas queries de
// react-query quedan cacheadas así que alternar no recarga ni pierde el
// estado ya renderizado del cuadrante.
export function BalancedScorecardPage() {
  useDocumentTitle('Balanced Scorecard')
  const pageRef = useRef<HTMLElement>(null)
  const [vista, setVista] = useState<'dashboard' | 'asistida'>('dashboard')

  const resumen = useQuery({
    queryKey: ['analitica', 'bsc', 'resumen'],
    queryFn:  analiticaApi.bsc,
  })

  const asistida = useQuery({
    queryKey: ['analitica', 'bsc', 'analisis-inteligente'],
    queryFn:  analiticaApi.bscAnalisisInteligente,
    enabled:  vista === 'asistida',
  })

  const data = resumen.data

  return (
    <section className={styles.page} ref={pageRef}>
      <div className={styles.headTop}>
        <div>
          <h1 className={styles.heading}>
            Balanced Scorecard
            <InfoHint text="Vista estratégica del negocio en 13 KPIs agrupados en 4 perspectivas: Financiera, Cliente, Procesos Internos, y Aprendizaje y Crecimiento." />
          </h1>
          <span className={styles.subtitle}>// Tracklytics — visión estratégica de las 4 perspectivas</span>
        </div>
        <div className={styles.headActions}>
          <div className={styles.toggle} role="tablist" aria-label="Vista del Balanced Scorecard">
            <button
              type="button"
              role="tab"
              aria-selected={vista === 'dashboard'}
              className={vista === 'dashboard' ? `${styles.toggleBtn} ${styles.toggleBtnActive}` : styles.toggleBtn}
              onClick={() => setVista('dashboard')}
            >
              <LayoutDashboard size={14} aria-hidden="true" />
              Vista Dashboard
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={vista === 'asistida'}
              className={vista === 'asistida' ? `${styles.toggleBtn} ${styles.toggleBtnActive}` : styles.toggleBtn}
              onClick={() => setVista('asistida')}
            >
              <Sparkles size={14} aria-hidden="true" />
              Vista Asistida
            </button>
          </div>
          {data && <ExportPDFButton targetRef={pageRef} fileName="bsc-estrategico" title="Balanced Scorecard" />}
        </div>
      </div>

      {resumen.isLoading && (
        <div className={styles.grid}>
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} height={220} />)}
        </div>
      )}

      {resumen.isError && (
        <EmptyState
          icon={<AlertTriangle size={22} aria-hidden="true" />}
          title="No se pudo cargar el Balanced Scorecard"
          body="Reintenta en unos segundos."
        />
      )}

      {data && (
        <div className={styles.grid}>
          {data.perspectivas.map((persp) => (
            <div key={persp.nombre} className={styles.card}>
              <h2 className={styles.cardTitle}>{persp.nombre}</h2>
              <div className={styles.kpiList}>
                {persp.kpis.map((kpi) => <KpiRow key={kpi.indicador} kpi={kpi} />)}
              </div>
            </div>
          ))}
        </div>
      )}

      {vista === 'asistida' && (
        <div className={styles.asistidaPanel}>
          <div className={styles.asistidaHead}>
            <h2 className={styles.asistidaTitle}>
              <Sparkles size={16} aria-hidden="true" />
              Análisis Inteligente
            </h2>
            {asistida.data && <p className={styles.metodologia}>{asistida.data.metodologia}</p>}
          </div>

          {asistida.isLoading && <SkeletonCard height={280} />}

          {asistida.isError && (
            <EmptyState
              icon={<AlertTriangle size={22} aria-hidden="true" />}
              title="No se pudo cargar el análisis inteligente"
              body="Reintenta en unos segundos."
            />
          )}

          {asistida.data && (
            <>
              {asistida.data.correlaciones.length > 0 && (
                <div className={styles.correlaciones}>
                  {asistida.data.correlaciones.map((c) => (
                    <div key={c.regla} className={styles.correlacionCard}>
                      <AlertTriangle size={16} aria-hidden="true" className={styles.correlacionIcon} />
                      <div>
                        <p className={styles.correlacionMsg}>{c.mensaje}</p>
                        <span className={styles.correlacionKpis}>{c.kpis_involucrados.join(' · ')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className={styles.diagGrid}>
                {asistida.data.diagnosticos.map((diag) => <DiagnosticoCard key={diag.indicador} diag={diag} />)}
              </div>

              {asistida.data.indice_desempeno_relativo && (
                <div className={styles.indiceCard}>
                  <span className={styles.cardTitle}>{asistida.data.indice_desempeno_relativo.indicador}</span>
                  <div className={styles.indiceRow}>
                    <span className={styles.kpiValue}>{asistida.data.indice_desempeno_relativo.valor_actual}</span>
                    <Sparkline data={asistida.data.indice_desempeno_relativo.tendencia} color="var(--color-primary-light)" width={90} height={22} />
                  </div>
                  <span className={styles.diagNota}>{asistida.data.indice_desempeno_relativo.nota}</span>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  )
}
