import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { MiniLineChart } from '@shared/components/charts/MiniLineChart'
import { CHART_COLORS } from '@shared/components/charts/colors'
import { analiticaApi } from '../api/analitica.api'
import { TierUpsell } from '../components/TierUpsell'
import { tierInsuficienteInfo } from '../lib/tierError'
import styles from './ProyeccionGeneroPage.module.css'

// Panel predictivo exclusivo Enterprise (CU-O92, b2b-tier-access-analitica):
// extrapolación estadística simple (regresión lineal) sobre la serie semanal
// de popularidad de un género — deliberadamente presentada como "proyección
// estimada", nunca como predicción de IA (ver design.md, decisión 3).
export function ProyeccionGeneroPage() {
  useDocumentTitle('Proyección de tendencia de género')
  const [generoId, setGeneroId] = useState<number | null>(null)

  const generosQuery = useQuery({
    queryKey: ['analitica', 'generos-list'],
    queryFn:  () => analiticaApi.generos(),
  })

  const proyeccionQuery = useQuery({
    queryKey: ['analitica', 'genero-proyeccion', generoId],
    queryFn:  () => analiticaApi.generoProyeccion(generoId!),
    enabled:  generoId !== null,
  })

  const generos = generosQuery.data?.data ?? []
  const proyeccion = proyeccionQuery.data
  const tierInfo = tierInsuficienteInfo(proyeccionQuery.error)

  const chartData = proyeccion
    ? [
        ...proyeccion.serie_historica.map((s) => ({ semana: `S${s.load_week}`, real: s.avg_popularity })),
        ...(proyeccion.suficiente
          ? proyeccion.horizonte_semanas.map((w, i) => ({
              semana: `S${w}`,
              proyectado: proyeccion.valores_proyectados[i],
            }))
          : []),
      ]
    : []

  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>Proyección de tendencia de género</h1>
      <span className={styles.subtitle}>
        {proyeccion ? '// proyección estadística estimada, no una predicción de IA' : '// selecciona un género'}
      </span>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="genero-proyeccion-select">Género</label>
        <select
          id="genero-proyeccion-select"
          className={styles.select}
          value={generoId ?? ''}
          onChange={(e) => setGeneroId(e.target.value ? Number(e.target.value) : null)}
          disabled={generosQuery.isLoading}
        >
          <option value="">
            {generosQuery.isLoading ? 'Cargando géneros…' : 'Selecciona un género…'}
          </option>
          {generos.map((g) => (
            <option key={g.genre_id} value={g.genre_id}>{g.name}</option>
          ))}
        </select>
      </div>

      {generoId === null && (
        <div className={styles.prompt}>
          <p className={styles.promptText}>
            Elige un género para ver su tendencia histórica y una proyección estimada a 4 semanas.
          </p>
        </div>
      )}

      {generoId !== null && proyeccionQuery.isLoading && (
        <div className={styles.panel} style={{ minHeight: 280 }} />
      )}

      {generoId !== null && proyeccionQuery.isError && (
        tierInfo ? (
          <TierUpsell tierRequerido={tierInfo.tierRequerido} tierActual={tierInfo.tierActual} />
        ) : (
          <div className={styles.panel}>
            <p className={styles.panelError}>No se pudo calcular la proyección de este género.</p>
          </div>
        )
      )}

      {proyeccion && !proyeccion.suficiente && (
        <div className={styles.panel}>
          <p className={styles.panelError}>{proyeccion.mensaje}</p>
        </div>
      )}

      {proyeccion && proyeccion.suficiente && (
        <div className={styles.panel}>
          <MiniLineChart
            data={chartData}
            xKey="semana"
            series={[
              { key: 'real',        label: 'Popularidad histórica', color: CHART_COLORS.violeta },
              { key: 'proyectado',  label: 'Proyección estimada',   color: CHART_COLORS.teal },
            ]}
          />

          {proyeccion.alerta && (
            <div className={styles.alertBanner} role="alert">
              <AlertTriangle size={15} aria-hidden="true" />
              Tendencia sostenida a la baja — este género muestra una caída acumulada proyectada
              relevante en las próximas semanas.
            </div>
          )}

          <dl className={styles.kv}>
            <dt className={styles.kvLabel}>Pendiente semanal estimada</dt>
            <dd className={styles.kvValue}>{proyeccion.pendiente_semanal.toFixed(4)}</dd>
          </dl>

          <p className={styles.disclosure}>
            Proyección estadística simple (regresión lineal) sobre la serie histórica disponible —
            no es un modelo de inteligencia artificial ni garantiza el comportamiento futuro real.
          </p>
        </div>
      )}
    </section>
  )
}
