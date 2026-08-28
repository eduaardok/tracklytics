import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { analiticaApi } from '../api/analitica.api'
import { ArtistPicker } from '@shared/components/ArtistPicker'
import { AudioRadarChart, RADAR_COLOR_A, RADAR_COLOR_B } from '../components/AudioRadarChart'
import { TierUpsell } from '../components/TierUpsell'
import { AUDIO_FEATURES, artistToAudioValues, genreToAudioValues } from '../lib/audioFeatures'
import { tierInsuficienteInfo } from '../lib/tierError'
import type { ArtistSearchResult } from '../types'
import { SkeletonChart } from '@shared/components/SkeletonLoader'
import styles from './ArtistaBenchmarkPage.module.css'
import { ErrorState } from '@shared/components/ErrorState'
import { InfoHint } from '@shared/components/InfoHint'

const fmt    = (n: number)     => n.toLocaleString('es-ES')
const fmtDec = (n: number)     => n.toFixed(4)

// Página independiente dentro de `analitica`, no embebida en ArtistDetailPage
// (catalogo) — catalogo nunca importa de analitica (regla de aislamiento de
// paquetes ya observada en el resto del frontend), y el legacy también la
// resuelve como página propia (`benchmark.html`), no como sección embebida.
export function ArtistaBenchmarkPage() {
  useDocumentTitle('Benchmark de artista')
  const [artista, setArtista] = useState<ArtistSearchResult | null>(null)

  const benchmark = useQuery({
    queryKey: ['analitica', 'benchmark', artista?.artist_id],
    queryFn:  () => analiticaApi.artistaBenchmark(artista!.artist_id),
    enabled:  !!artista,
  })

  const data = benchmark.data
  const tierInfo = tierInsuficienteInfo(benchmark.error)

  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>
        Benchmark de artista
        <InfoHint text="Compara un artista contra el promedio de su propio género, para saber si está por encima o por debajo del benchmark de su categoría." />
      </h1>
      <span className={styles.subtitle}>
        {data ? `// ${data.artista.name} vs. género "${data.genero_benchmark.name}"` : '// selecciona un artista'}
      </span>

      <div className={styles.pickerWrap}>
        <ArtistPicker label="Artista" selected={artista} onSelect={setArtista} onClear={() => setArtista(null)} />
      </div>

      {!artista && (
        <div className={styles.prompt}>
          <p className={styles.promptText}>
            Elige un artista para comparar su perfil de audio contra el promedio de su género predominante.
          </p>
        </div>
      )}

      {artista && benchmark.isLoading && <div className={styles.panel}><SkeletonChart height={320} /></div>}

      {artista && benchmark.isError && (
        tierInfo ? (
          <TierUpsell tierRequerido={tierInfo.tierRequerido} tierActual={tierInfo.tierActual} />
        ) : (
          <ErrorState message="No se pudo calcular el benchmark — puede que el artista no tenga tracks registrados." />
        )
      )}

      {data && (
        <>
          <div className={styles.panel}>
            <AudioRadarChart
              series={[
                { label: data.artista.name, color: RADAR_COLOR_A, values: artistToAudioValues(data.artista) },
                { label: `Género: ${data.genero_benchmark.name}`, color: RADAR_COLOR_B, values: genreToAudioValues(data.genero_benchmark) },
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
                    {data.artista.name}
                  </th>
                  <th className={styles.th}>
                    <span className={styles.thKey} style={{ background: RADAR_COLOR_B }} aria-hidden="true" />
                    Género
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className={styles.rowLabel}>Tracks</td>
                  <td className={styles.rowValue}>{fmt(data.artista.track_count)}</td>
                  <td className={styles.rowValue}>{fmt(data.genero_benchmark.track_count)}</td>
                </tr>
                {AUDIO_FEATURES.map((f) => (
                  <tr key={f.key}>
                    <td className={styles.rowLabel}>{f.label}</td>
                    <td className={styles.rowValue}>{fmtDec(artistToAudioValues(data.artista)[f.key])}</td>
                    <td className={styles.rowValue}>{fmtDec(genreToAudioValues(data.genero_benchmark)[f.key])}</td>
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
