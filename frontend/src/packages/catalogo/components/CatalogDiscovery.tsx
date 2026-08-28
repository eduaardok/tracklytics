import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { genreAccent } from '@shared/lib/genre-colors'
import { useDragScroll } from '@shared/hooks/useDragScroll'
import { catalogoApi } from '../api/catalogo.api'
import { TrackGridCard } from './TrackGridCard'
import { ExploreGridCard } from './ExploreGridCard'
import { MixDiarioCard } from './MixDiarioCard'
import type { Tab } from '../pages/CatalogPage.tabs'
import styles from './CatalogDiscovery.module.css'

const PREVIEW_LIMIT = 12
const GENRE_CHIPS_LIMIT = 12
// Covers GRANDES (feedback: "que tenga sentido el arrastre" — con covers de
// 96/130px los 12 items cabían y la fila nunca desbordaba). Artista circular
// 132, playlist 168, canción 176 de ancho: todas las filas desbordan en el
// contenedor de 1320px y el arrastre/flechas tienen razón de ser.
const ARTIST_SIZE   = 132
const PLAYLIST_SIZE = 168

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

// Fila horizontal con affordance de arrastre: fades en los bordes (hay más
// contenido fuera de vista) + flechas laterales que aparecen al hover y
// avanzan ~3/4 de viewport. El ref vive DENTRO de este componente (solo se
// monta cuando ya hay datos), así el efecto inicial siempre encuentra el
// nodo — el caso patológico del hook global (montaje condicional) no aplica.
function DraggableRow({ label, dragRow, children }: { label: string; dragRow: ReturnType<typeof useDragScroll>; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(false)

  const sync = useCallback(() => {
    const el = ref.current
    if (!el) return
    setAtStart(el.scrollLeft <= 4)
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4)
  }, [])

  useEffect(() => {
    sync()
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    window.addEventListener('resize', sync)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', sync)
    }
  }, [sync])

  function nudge(dir: number) {
    const el = ref.current
    if (!el) return
    el.scrollBy({ left: dir * el.clientWidth * 0.75, behavior: 'smooth' })
  }

  return (
    <div className={styles.rowShell}>
      <div {...dragRow} ref={ref} className={styles.hRow} aria-label={label} onScroll={sync}>
        {children}
      </div>
      <span aria-hidden="true" className={`${styles.rowFadeL} ${atStart ? styles.rowFadeHidden : ''}`} />
      <span aria-hidden="true" className={`${styles.rowFadeR} ${atEnd ? styles.rowFadeHidden : ''}`} />
      {!atStart && (
        <button
          type="button"
          className={`${styles.rowNav} ${styles.rowNavL}`}
          onClick={() => nudge(-1)}
          aria-label={`Desplazar ${label} hacia atrás`}
        >
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
      )}
      {!atEnd && (
        <button
          type="button"
          className={`${styles.rowNav} ${styles.rowNavR}`}
          onClick={() => nudge(1)}
          aria-label={`Desplazar ${label} hacia adelante`}
        >
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      )}
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
// PERF (hallazgo real post-deploy): `artistsTop`/`albumsSearch('')` son GROUP
// BY sin filtro sobre ~1.5M filas de FACT_TRACKS — antes solo se pedían al
// entrar a la pestaña correspondiente; este rediseño las dispara en CADA
// carga de /catalogo. `staleTime` evita refetch en cada visita dentro de la
// sesión (mismo criterio que `genres`, que ya lo tenía) — el TTL real del
// dato vive en el `query_cache_ttl` del backend (ver queries.py), esto solo
// evita el round-trip HTTP redundante cuando el usuario vuelve al home.
const PREVIEW_STALE_TIME = 5 * 60_000

export function CatalogDiscovery({ onVerTodo }: Props) {
  const navigate = useNavigate()
  // Arrastre con mouse en cada fila horizontal — un solo objeto de props
  // (delegación global por atributo, ver useDragScroll).
  const dragRow = useDragScroll()

  const tracks = useQuery({
    queryKey: ['tracks', 'top', PREVIEW_LIMIT],
    queryFn:  () => catalogoApi.tracksTop(PREVIEW_LIMIT),
    staleTime: PREVIEW_STALE_TIME,
  })
  const artists = useQuery({
    queryKey: ['artists', 'top', PREVIEW_LIMIT],
    queryFn:  () => catalogoApi.artistsTop(PREVIEW_LIMIT),
    staleTime: PREVIEW_STALE_TIME,
  })
  const genres = useQuery({
    queryKey: ['genres', 'list'],
    queryFn:  () => catalogoApi.genresList(),
    staleTime: PREVIEW_STALE_TIME,
  })
  const playlists = useQuery({
    queryKey: ['albums', ''],
    queryFn:  () => catalogoApi.albumsSearch('', PREVIEW_LIMIT),
    staleTime: PREVIEW_STALE_TIME,
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
          aún ni error) — nunca contenido inventado (regla 10). Fila
          horizontal desplazable (feedback visual) en vez de lista vertical
          — covers grandes, orden de popularidad (mismo endpoint `tracksTop`,
          ya viene ordenado), badge ★ visible en cada card. */}
      {trackList.length > 0 && (
        <section className={styles.section}>
          <SectionHeader title="Canciones populares" ctaLabel="Ver todas" onClick={() => onVerTodo('canciones')} />
          <DraggableRow label="Canciones populares" dragRow={dragRow}>
            {trackList.map((track, i) => (
              <div key={`${track.fact_id}-${track.track_id}`} className={styles.trackItem}>
                <TrackGridCard track={track} queue={trackList} index={i} />
              </div>
            ))}
          </DraggableRow>
        </section>
      )}

      {/* Artista/playlist clickean a SU detalle (rutas existentes
          /catalogo/artista/:id y /catalogo/album/:id) — antes caían en el
          listado genérico de la pestaña, mismo bug que tenía la card de
          canción antes de su detalle. */}
      {artistList.length > 0 && (
        <section className={styles.section}>
          <SectionHeader title="Artistas destacados" ctaLabel="Ver todos" onClick={() => onVerTodo('artistas')} />
          <DraggableRow label="Artistas destacados" dragRow={dragRow}>
            {artistList.map((a) => (
              <ExploreGridCard
                key={a.artist_id}
                kind="artista"
                shape="circle"
                size={ARTIST_SIZE}
                name={a.name}
                imagenUrl={a.imagen_url}
                metric={`${a.track_count.toLocaleString('es')} canciones`}
                onClick={() => navigate(`/catalogo/artista/${a.artist_id}`)}
              />
            ))}
          </DraggableRow>
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
          <DraggableRow label="Playlists" dragRow={dragRow}>
            {playlistList.map((p) => (
              <ExploreGridCard
                key={p.album_id}
                kind="playlist"
                size={PLAYLIST_SIZE}
                name={p.name}
                imagenUrl={p.imagen_url}
                portadaUrls={p.portada_urls}
                metric={`${(p.track_count ?? 0).toLocaleString('es')} canciones${p.release_year ? ` · ${p.release_year}` : ''}`}
                onClick={() => navigate(`/catalogo/album/${p.album_id}`)}
              />
            ))}
          </DraggableRow>
        </section>
      )}
    </div>
  )
}
