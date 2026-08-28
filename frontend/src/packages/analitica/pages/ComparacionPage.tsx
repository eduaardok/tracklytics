import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { analiticaApi } from '../api/analitica.api'
import { ArtistPicker } from '@shared/components/ArtistPicker'
import { AudioRadarChart, RADAR_COLOR_A, RADAR_COLOR_B } from '../components/AudioRadarChart'
import { TierUpsell } from '../components/TierUpsell'
import { artistToAudioValues } from '../lib/audioFeatures'
import { tierInsuficienteInfo } from '../lib/tierError'
import type { ArtistAudioStats, ArtistSearchResult } from '../types'
import { SkeletonChart } from '@shared/components/SkeletonLoader'
import styles from './ComparacionPage.module.css'
import { ErrorState } from '@shared/components/ErrorState'
import { InfoHint } from '@shared/components/InfoHint'

// Los `avg_*` de audio pueden ser `null` (artista sin tracks propios, ver
// comentario en types.ts — bug real de S16 Prompt 05: esto tiraba abajo
// toda la página al llamar `.toFixed()` sobre `null`). `fmt` maneja null
// explícitamente en vez de asumir que el valor siempre está.
const fmt    = (n: number | null)        => n == null ? '—' : n.toLocaleString('es-ES')
const fmtDec = (n: number | null, d = 4) => n == null ? '—' : n.toFixed(d)

const DIFF_ROWS: Array<{ label: string; get: (a: ArtistAudioStats) => number | null; fmt: (n: number | null) => string }> = [
  { label: 'Tracks',           get: (a) => a.track_count,          fmt },
  { label: 'Popularidad',      get: (a) => a.avg_popularity,       fmt: (n) => n == null ? '—' : n.toFixed(2) },
  { label: 'Baile (Danceability)',            get: (a) => a.avg_danceability,     fmt: fmtDec },
  { label: 'Energía (Energy)',                get: (a) => a.avg_energy,           fmt: fmtDec },
  { label: 'Habla (Speechiness)',             get: (a) => a.avg_speechiness,      fmt: fmtDec },
  { label: 'Acústica (Acousticness)',         get: (a) => a.avg_acousticness,     fmt: fmtDec },
  { label: 'Instrumental (Instrumentalness)', get: (a) => a.avg_instrumentalness, fmt: fmtDec },
  { label: 'En vivo (Liveness)',              get: (a) => a.avg_liveness,         fmt: fmtDec },
  { label: 'Valencia (Valence)',              get: (a) => a.avg_valence,          fmt: fmtDec },
  { label: 'Explícitos',       get: (a) => a.explicit_count,       fmt },
]

export function ComparacionPage() {
  useDocumentTitle('Comparación de artistas')
  const [artistaA, setArtistaA] = useState<ArtistSearchResult | null>(null)
  const [artistaB, setArtistaB] = useState<ArtistSearchResult | null>(null)

  const comparar = useQuery({
    queryKey: ['analitica', 'comparar', artistaA?.artist_id, artistaB?.artist_id],
    queryFn:  () => analiticaApi.artistasComparar(artistaA!.artist_id, artistaB!.artist_id),
    enabled:  !!artistaA && !!artistaB,
  })

  const data = comparar.data
  const tierInfo = tierInsuficienteInfo(comparar.error)

  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>
        Comparación de artistas
        <InfoHint text="Compara dos artistas cara a cara en popularidad, engagement y perfil de audio, para apoyar decisiones de A&R o promoción." />
      </h1>
      <span className={styles.subtitle}>
        {data ? `// ${data.artista_a.name} vs. ${data.artista_b.name}` : '// selecciona dos artistas'}
      </span>

      <div className={styles.pickerRow}>
        <ArtistPicker label="Artista A" selected={artistaA} onSelect={setArtistaA} onClear={() => setArtistaA(null)} />
        <ArtistPicker label="Artista B" selected={artistaB} onSelect={setArtistaB} onClear={() => setArtistaB(null)} />
      </div>

      {(!artistaA || !artistaB) && (
        <div className={styles.prompt}>
          <p className={styles.promptText}>Elige dos artistas para comparar su perfil de audio lado a lado.</p>
        </div>
      )}

      {artistaA && artistaB && comparar.isLoading && (
        <div className={styles.panel}><SkeletonChart height={320} /></div>
      )}

      {artistaA && artistaB && comparar.isError && (
        tierInfo ? (
          <TierUpsell tierRequerido={tierInfo.tierRequerido} tierActual={tierInfo.tierActual} />
        ) : (
          <ErrorState message="No se pudo cargar la comparación." />
        )
      )}

      {data && (
        <>
          <div className={styles.panel}>
            <AudioRadarChart
              series={[
                { label: data.artista_a.name, color: RADAR_COLOR_A, values: artistToAudioValues(data.artista_a) },
                { label: data.artista_b.name, color: RADAR_COLOR_B, values: artistToAudioValues(data.artista_b) },
              ]}
            />
          </div>

          <div className={styles.panel} style={{ marginTop: 'var(--space-md)' }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th></th>
                  <th className={styles.th}>
                    <span className={styles.thKey} style={{ background: RADAR_COLOR_A }} aria-hidden="true" />
                    {data.artista_a.name}
                  </th>
                  <th className={styles.th}>
                    <span className={styles.thKey} style={{ background: RADAR_COLOR_B }} aria-hidden="true" />
                    {data.artista_b.name}
                  </th>
                </tr>
              </thead>
              <tbody>
                {DIFF_ROWS.map((row) => (
                  <tr key={row.label}>
                    <td className={styles.rowLabel}>{row.label}</td>
                    <td className={styles.rowValue}>{row.fmt(row.get(data.artista_a))}</td>
                    <td className={styles.rowValue}>{row.fmt(row.get(data.artista_b))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}
