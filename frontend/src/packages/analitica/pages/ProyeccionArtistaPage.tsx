import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { ArtistPicker, type ArtistSearchResult } from '@shared/components/ArtistPicker'
import { MiniLineChart } from '@shared/components/charts/MiniLineChart'
import { CHART_COLORS } from '@shared/components/charts/colors'
import { analiticaApi } from '../api/analitica.api'
import { TierUpsell } from '../components/TierUpsell'
import { tierInsuficienteInfo } from '../lib/tierError'
import styles from './ProyeccionArtistaPage.module.css'

const TRAYECTORIA_LABEL: Record<string, string> = {
  ganando_terreno:    'Ganando terreno frente a su género',
  perdiendo_terreno:  'Perdiendo terreno frente a su género',
  estable:            'Estable frente a su género',
}

const TRAYECTORIA_CLASS: Record<string, string> = {
  ganando_terreno:    'trayectoriaGanando',
  perdiendo_terreno:  'trayectoriaPerdiendo',
  estable:            'trayectoriaEstable',
}

// Panel predictivo exclusivo Enterprise (CU-O93, b2b-tier-access-analitica):
// compara la pendiente proyectada del artista contra la de su género
// predominante — misma naturaleza de "proyección estadística estimada" que
// ProyeccionGeneroPage, nunca una predicción de IA.
export function ProyeccionArtistaPage() {
  useDocumentTitle('Proyección de trayectoria de artista')
  const [artista, setArtista] = useState<ArtistSearchResult | null>(null)

  const proyeccionQuery = useQuery({
    queryKey: ['analitica', 'artista-proyeccion', artista?.artist_id],
    queryFn:  () => analiticaApi.artistaProyeccion(artista!.artist_id),
    enabled:  !!artista,
  })

  const proyeccion = proyeccionQuery.data
  const tierInfo = tierInsuficienteInfo(proyeccionQuery.error)

  const chartData = proyeccion
    ? [
        ...proyeccion.serie_historica.map((s) => ({ semana: `S${s.load_week}`, artista: s.avg_popularity })),
        ...(proyeccion.proyeccion_artista.suficiente
          ? proyeccion.proyeccion_artista.horizonte_semanas.map((w, i) => ({
              semana: `S${w}`,
              proyeccion_artista: proyeccion.proyeccion_artista.suficiente
                ? proyeccion.proyeccion_artista.valores_proyectados[i]
                : undefined,
            }))
          : []),
      ]
    : []

  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>Proyección de trayectoria de artista</h1>
      <span className={styles.subtitle}>
        {proyeccion ? '// proyección estadística estimada, no una predicción de IA' : '// selecciona un artista'}
      </span>

      <div className={styles.pickerWrap}>
        <ArtistPicker label="Artista" selected={artista} onSelect={setArtista} onClear={() => setArtista(null)} />
      </div>

      {!artista && (
        <div className={styles.prompt}>
          <p className={styles.promptText}>
            Elige un artista para ver su trayectoria estimada frente a su género predominante.
          </p>
        </div>
      )}

      {artista && proyeccionQuery.isLoading && (
        <div className={styles.panel} style={{ minHeight: 280 }} />
      )}

      {artista && proyeccionQuery.isError && (
        tierInfo ? (
          <TierUpsell tierRequerido={tierInfo.tierRequerido} tierActual={tierInfo.tierActual} />
        ) : (
          <div className={styles.panel}>
            <p className={styles.panelError}>
              No se pudo calcular la proyección — puede que el artista no tenga tracks registrados.
            </p>
          </div>
        )
      )}

      {proyeccion && !proyeccion.proyeccion_artista.suficiente && (
        <div className={styles.panel}>
          <p className={styles.panelError}>{proyeccion.proyeccion_artista.mensaje}</p>
        </div>
      )}

      {proyeccion && proyeccion.proyeccion_artista.suficiente && (
        <div className={styles.panel}>
          {proyeccion.trayectoria && (
            <span className={`${styles.trayectoriaBadge} ${styles[TRAYECTORIA_CLASS[proyeccion.trayectoria]]}`}>
              {TRAYECTORIA_LABEL[proyeccion.trayectoria]}
            </span>
          )}

          <MiniLineChart
            data={chartData}
            xKey="semana"
            series={[
              { key: 'artista',              label: 'Popularidad histórica', color: CHART_COLORS.violeta },
              { key: 'proyeccion_artista',    label: 'Proyección estimada',   color: CHART_COLORS.teal },
            ]}
          />

          {proyeccion.proyeccion_artista.alerta && (
            <div className={styles.alertBanner} role="alert">
              <AlertTriangle size={15} aria-hidden="true" />
              Este artista muestra una caída acumulada proyectada relevante en las próximas semanas.
            </div>
          )}

          <dl className={styles.kv}>
            <dt className={styles.kvLabel}>Pendiente semanal del artista</dt>
            <dd className={styles.kvValue}>{proyeccion.proyeccion_artista.pendiente_semanal.toFixed(4)}</dd>
            {proyeccion.proyeccion_genero.suficiente && (
              <>
                <dt className={styles.kvLabel}>Pendiente semanal del género</dt>
                <dd className={styles.kvValue}>{proyeccion.proyeccion_genero.pendiente_semanal.toFixed(4)}</dd>
              </>
            )}
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
