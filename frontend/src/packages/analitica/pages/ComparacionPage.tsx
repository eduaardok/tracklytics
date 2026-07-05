import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { analiticaApi } from '../api/analitica.api'
import { ArtistPicker } from '../components/ArtistPicker'
import { AudioRadarChart, RADAR_COLOR_A, RADAR_COLOR_B } from '../components/AudioRadarChart'
import { artistToAudioValues } from '../lib/audioFeatures'
import type { ArtistAudioStats, ArtistSearchResult } from '../types'
import styles from './ComparacionPage.module.css'

const fmt    = (n: number)        => n.toLocaleString('es-ES')
const fmtDec = (n: number, d = 4) => n.toFixed(d)

const DIFF_ROWS: Array<{ label: string; get: (a: ArtistAudioStats) => number; fmt: (n: number) => string }> = [
  { label: 'Tracks',           get: (a) => a.track_count,          fmt },
  { label: 'Popularidad',      get: (a) => a.avg_popularity,       fmt: (n) => n.toFixed(2) },
  { label: 'Danceability',     get: (a) => a.avg_danceability,     fmt: fmtDec },
  { label: 'Energy',           get: (a) => a.avg_energy,           fmt: fmtDec },
  { label: 'Speechiness',      get: (a) => a.avg_speechiness,      fmt: fmtDec },
  { label: 'Acousticness',     get: (a) => a.avg_acousticness,     fmt: fmtDec },
  { label: 'Instrumentalness', get: (a) => a.avg_instrumentalness, fmt: fmtDec },
  { label: 'Liveness',         get: (a) => a.avg_liveness,         fmt: fmtDec },
  { label: 'Valence',          get: (a) => a.avg_valence,          fmt: fmtDec },
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

  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>Comparación de artistas</h1>
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
        <div className={styles.panel} style={{ minHeight: 320 }} />
      )}

      {artistaA && artistaB && comparar.isError && (
        <div className={styles.panel}>
          <p className={styles.panelError}>No se pudo cargar la comparación.</p>
        </div>
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
