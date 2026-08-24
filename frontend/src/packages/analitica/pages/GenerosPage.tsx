import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { analiticaApi } from '../api/analitica.api'
import { AudioRadarChart, RADAR_COLOR_A } from '../components/AudioRadarChart'
import { genreToAudioValues } from '../lib/audioFeatures'
import { SkeletonChart } from '@shared/components/SkeletonLoader'
import styles from './GenerosPage.module.css'
import { ErrorState } from '@shared/components/ErrorState'

const fmt    = (n: number)     => n.toLocaleString('es-ES')
const fmtDec = (n: number, d = 2) => n.toFixed(d)

export function GenerosPage() {
  useDocumentTitle('Perfil de audio por género')
  const [generoId, setGeneroId] = useState<number | null>(null)

  const generosQuery = useQuery({
    queryKey: ['analitica', 'generos-list'],
    queryFn:  () => analiticaApi.generos(),
  })

  const perfilQuery = useQuery({
    queryKey: ['analitica', 'genero-perfil', generoId],
    queryFn:  () => analiticaApi.generoPerfil(generoId!),
    enabled:  generoId !== null,
  })

  const generos = generosQuery.data?.data ?? []
  const perfil  = perfilQuery.data

  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>Perfil de audio por género</h1>
      <span className={styles.subtitle}>
        {perfil ? `// ${perfil.name} · ${fmt(perfil.track_count)} tracks` : '// selecciona un género'}
      </span>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="genero-select">Género</label>
        <select
          id="genero-select"
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

      {generosQuery.isError && (
        <ErrorState message="No se pudo cargar la lista de géneros." />
      )}

      {generoId === null && !generosQuery.isError && (
        <div className={styles.prompt}>
          <p className={styles.promptText}>Elige un género para ver su perfil de audio (7 atributos).</p>
        </div>
      )}

      {generoId !== null && perfilQuery.isLoading && (
        <div className={styles.panel}><SkeletonChart height={320} /></div>
      )}

      {generoId !== null && perfilQuery.isError && (
        <ErrorState message="No se pudo cargar el perfil de este género." />
      )}

      {perfil && (
        <div className={styles.resultGrid}>
          <div className={styles.panel}>
            <AudioRadarChart
              series={[{ label: perfil.name, color: RADAR_COLOR_A, values: genreToAudioValues(perfil) }]}
            />
          </div>
          <div className={styles.panel}>
            <dl className={styles.kv}>
              <dt className={styles.kvLabel}>Tracks</dt>
              <dd className={styles.kvValue}>{fmt(perfil.track_count)}</dd>
              <dt className={styles.kvLabel}>Tempo promedio</dt>
              <dd className={styles.kvValue}>{fmtDec(perfil.avg_tempo)} bpm</dd>
              <dt className={styles.kvLabel}>Baile (Danceability)</dt>
              <dd className={styles.kvValue}>{fmtDec(perfil.danceability)}</dd>
              <dt className={styles.kvLabel}>Energía (Energy)</dt>
              <dd className={styles.kvValue}>{fmtDec(perfil.energy)}</dd>
              <dt className={styles.kvLabel}>Valencia (Valence)</dt>
              <dd className={styles.kvValue}>{fmtDec(perfil.valence)}</dd>
              <dt className={styles.kvLabel}>Acústica (Acousticness)</dt>
              <dd className={styles.kvValue}>{fmtDec(perfil.acousticness)}</dd>
              <dt className={styles.kvLabel}>Habla (Speechiness)</dt>
              <dd className={styles.kvValue}>{fmtDec(perfil.speechiness)}</dd>
              <dt className={styles.kvLabel}>Instrumental (Instrumentalness)</dt>
              <dd className={styles.kvValue}>{fmtDec(perfil.instrumentalness)}</dd>
              <dt className={styles.kvLabel}>En vivo (Liveness)</dt>
              <dd className={styles.kvValue}>{fmtDec(perfil.liveness)}</dd>
            </dl>
          </div>
        </div>
      )}
    </section>
  )
}
