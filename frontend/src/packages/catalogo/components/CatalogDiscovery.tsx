import { useQuery } from '@tanstack/react-query'
import { ChevronRight } from 'lucide-react'
import { genreAccent } from '@shared/lib/genre-colors'
import { catalogoApi } from '../api/catalogo.api'
import { TrackCard } from './TrackCard'
import { ExploreGridCard } from './ExploreGridCard'
import { MixDiarioCard } from './MixDiarioCard'
import type { Tab } from '../pages/CatalogPage.tabs'
import styles from './CatalogDiscovery.module.css'
import pageStyles from '../pages/CatalogPage.module.css'

const PREVIEW_LIMIT = 8
const GENRE_CHIPS_LIMIT = 12

type Props = {
  // Navega a la vista completa de una categoría (mismo mecanismo que "Ver
  // todas/os" en cada sección) — reutiliza el `ver` de CatalogPage, nunca
  // crea una ruta nueva.
  onVerTodo: (tab: Tab, genre?: string) => void
}

function SectionHeader({ title, ctaLabel, onClick }: { title: string; ctaLabel: string; onClick: () => void }) {
  return (
    <div className={styles.sectionHeader}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <button type="button" className={styles.seeAll} onClick={onClick}>
        {ctaLabel}
        <ChevronRight size={14} aria-hidden="true" />
      </button>
    </div>
  )
}

// Home de descubrimiento unificado de `/catalogo` (rediseño "centro de
// descubrimiento musical") — antes la página principal ERA cuatro pestañas
// (Canciones/Playlists/Artistas/Géneros) y había que elegir una para ver
// contenido. Ahora muestra varias categorías a la vez, cada una con su
// "Ver todas/os →" hacia la vista completa existente (mismo componente de
// sección, misma ruta `/`, sin endpoints nuevos) — la elección de
// categoría deja de ser un prerrequisito para descubrir música.
export function CatalogDiscovery({ onVerTodo }: Props) {
  const tracks = useQuery({
    queryKey: ['tracks', 'top', PREVIEW_LIMIT],
    queryFn:  () => catalogoApi.tracksTop(PREVIEW_LIMIT),
  })
  const artists = useQuery({
    queryKey: ['artists', 'top', PREVIEW_LIMIT],
    queryFn:  () => catalogoApi.artistsTop(PREVIEW_LIMIT),
  })
  const genres = useQuery({
    queryKey: ['genres', 'list'],
    queryFn:  () => catalogoApi.genresList(),
    staleTime: 5 * 60_000,
  })
  const playlists = useQuery({
    queryKey: ['albums', ''],
    queryFn:  () => catalogoApi.albumsSearch('', PREVIEW_LIMIT),
  })

  const trackList    = tracks.data?.data ?? []
  const artistList   = artists.data?.data ?? []
  const playlistList = playlists.data?.data ?? []
  const genreList    = [...(genres.data?.data ?? [])]
    .sort((a, b) => (b.track_count ?? 0) - (a.track_count ?? 0))
    .slice(0, GENRE_CHIPS_LIMIT)

  return (
    <div className={styles.discovery}>
      {/* Punto de entrada personalizado (change p2-descubrimiento-comunidad,
          conservado tal cual) — sigue encabezando el descubrimiento porque
          es contenido ya elegido para este usuario, no un listado genérico. */}
      <MixDiarioCard />

      {/* Categoría omitida si no hay datos reales que mostrar (sin loading
          aún ni error) — nunca contenido inventado (regla 10). */}
      {trackList.length > 0 && (
        <section className={styles.section}>
          <SectionHeader title="Canciones populares" ctaLabel="Ver todas" onClick={() => onVerTodo('canciones')} />
          <ol className={pageStyles.list} aria-label="Canciones populares">
            {trackList.map((track, i) => (
              <li key={`${track.fact_id}-${track.track_id}`}>
                <TrackCard track={track} position={i + 1} queue={trackList} />
              </li>
            ))}
          </ol>
        </section>
      )}

      {artistList.length > 0 && (
        <section className={styles.section}>
          <SectionHeader title="Artistas destacados" ctaLabel="Ver todos" onClick={() => onVerTodo('artistas')} />
          <div className={pageStyles.exploreGridCards} aria-label="Artistas destacados">
            {artistList.map((a) => (
              <ExploreGridCard
                key={a.artist_id}
                kind="artista"
                name={a.name}
                imagenUrl={a.imagen_url}
                metric={`${a.track_count.toLocaleString('es')} tracks${a.avg_popularity != null ? ` · ★ ${a.avg_popularity}` : ''}`}
                onClick={() => onVerTodo('artistas')}
              />
            ))}
          </div>
        </section>
      )}

      {genreList.length > 0 && (
        <section className={styles.section}>
          <SectionHeader title="Géneros" ctaLabel="Ver todos" onClick={() => onVerTodo('generos')} />
          <div className={styles.genreChips} aria-label="Géneros">
            {genreList.map((g) => {
              const accent = genreAccent(g.name)
              return (
                <button
                  key={g.genre_id}
                  type="button"
                  className={styles.genreChip}
                  style={{ borderColor: genreAccent(g.name, 0.35), color: accent }}
                  onClick={() => onVerTodo('canciones', g.name)}
                >
                  {g.name}
                </button>
              )
            })}
          </div>
        </section>
      )}

      {playlistList.length > 0 && (
        <section className={styles.section}>
          <SectionHeader title="Playlists" ctaLabel="Ver todas" onClick={() => onVerTodo('playlists')} />
          <div className={pageStyles.exploreGridCards} aria-label="Playlists">
            {playlistList.map((p) => (
              <ExploreGridCard
                key={p.album_id}
                kind="playlist"
                name={p.name}
                imagenUrl={p.imagen_url}
                metric={`${(p.track_count ?? 0).toLocaleString('es')} canciones${p.release_year ? ` · ${p.release_year}` : ''}`}
                onClick={() => onVerTodo('playlists')}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
