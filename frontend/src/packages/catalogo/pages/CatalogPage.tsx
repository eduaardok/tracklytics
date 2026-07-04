import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { catalogoApi } from '../api/catalogo.api'
import { TrackCard } from '../components/TrackCard'
import { ErrorState } from '@shared/components/ErrorState'
import type { Track } from '../types'
import styles from './CatalogPage.module.css'

const SKELETON_WIDTHS = [
  [68, 38], [82, 45], [55, 32], [74, 41], [61, 36],
  [79, 43], [58, 34], [88, 47], [63, 39], [71, 44],
  [52, 30], [76, 42],
]

function SkeletonRows() {
  return (
    <>
      {SKELETON_WIDTHS.map(([tw, mw], i) => (
        <li key={i} className={styles.skeletonRow} aria-hidden="true">
          <span className={`${styles.skel} ${styles.skelNum}`} />
          <span className={`${styles.skel} ${styles.skelArt}`} />
          <span className={styles.skelInfo}>
            <span className={`${styles.skel} ${styles.skelTitle}`} style={{ width: `${tw}%` }} />
            <span className={`${styles.skel} ${styles.skelMeta}`}  style={{ width: `${mw}%` }} />
          </span>
          <span className={`${styles.skel} ${styles.skelData}`} />
        </li>
      ))}
    </>
  )
}

function SearchIcon() {
  return (
    <svg
      className={styles.searchIcon}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
      <line x1="10" y1="10" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function CatalogPage() {
  const [search, setSearch]       = useState('')
  const [committed, setCommitted] = useState('')
  const [genre, setGenre]         = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = committed !== '' || genre !== ''

  const { data, isLoading, isError } = useQuery({
    queryKey: filtered ? ['tracks', 'search', committed, genre] : ['tracks', 'top'],
    queryFn:  () =>
      filtered
        ? catalogoApi.tracksSearch({ q: committed, genre, limit: 50 })
        : catalogoApi.tracksTop(50),
  })

  const { data: genresData } = useQuery({
    queryKey: ['genres', 'list'],
    queryFn:  () => catalogoApi.genresList(),
    staleTime: 5 * 60_000,
  })
  const genres = genresData?.data ?? []

  const tracks = data?.data ?? []
  const total  = data?.total ?? tracks.length

  function commit() {
    const q = search.trim()
    if (q) setCommitted(q)
  }

  function toggleGenre(name: string) {
    setGenre((current) => (current === name ? '' : name))
  }

  function clear() {
    setSearch('')
    setCommitted('')
    inputRef.current?.focus()
  }

  function subtitle(): string {
    if (isLoading) return '// cargando…'
    if (isError)   return '// error al cargar'
    if (filtered)  return `// ${total.toLocaleString('es')} resultado${total !== 1 ? 's' : ''}${committed ? ` para "${committed}"` : ''}${genre ? ` en ${genre}` : ''}`
    return `// top ${tracks.length} por popularidad`
  }

  return (
    <section className={styles.page}>
      <header className={styles.pageHead}>
        <h1 className={styles.heading}>Catálogo</h1>
        <span className={styles.subtitle}>{subtitle()}</span>
      </header>

      {/* Hallazgo: el filtro de género ya existía (el <select> de abajo),
          pero sin ninguna entrada visual — un usuario solo lo encontraba si
          se fijaba en el dropdown. Esta fila lo hace descubrible sin duplicar
          el mecanismo (mismo estado `genre`, mismo query). No se creó una
          página nueva de exploración: GenerosPage (analitica) es un radar de
          audio features gateado a B2B, no sirve para "ver tracks de un
          género" en B2C. Scroll horizontal (no wrap): 114 géneros en el
          dataset, un grid envuelto ocuparía varias pantallas. */}
      {genres.length > 0 && (
        <div className={styles.genreChipsSection} aria-label="Explorar por género">
          <span className={styles.genreChipsLabel}>Explorar por género</span>
          <div className={styles.genreChips}>
            {genres.map((g) => (
              <button
                key={g.genre_id}
                type="button"
                className={genre === g.name ? `${styles.genreChip} ${styles.genreChipActive}` : styles.genreChip}
                onClick={() => toggleGenre(g.name)}
                aria-pressed={genre === g.name}
              >
                {g.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={styles.searchRow}>
        <div className={styles.searchWrap}>
          <SearchIcon />
          <input
            ref={inputRef}
            className={styles.searchInput}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && commit()}
            placeholder="Track o artista… (Enter para buscar)"
            aria-label="Buscar tracks"
          />
        </div>
        <select
          className={styles.genreSelect}
          value={genre}
          onChange={(e) => setGenre(e.target.value)}
          aria-label="Filtrar por género"
        >
          <option value="">Todos los géneros</option>
          {genres.map((g) => (
            <option key={g.genre_id} value={g.name}>{g.name}</option>
          ))}
        </select>
        {committed && (
          <button
            className={styles.clearBtn}
            onClick={clear}
            aria-label="Limpiar búsqueda"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <line x1="1" y1="1" x2="11" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="11" y1="1" x2="1"  y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      {isError && (
        <ErrorState
          title="No se pudieron cargar los datos"
          message="Comprueba que la API esté activa e intenta de nuevo."
        />
      )}

      {!isError && (
        <ol className={styles.list} aria-label="Lista de tracks">
          {isLoading ? (
            <SkeletonRows />
          ) : tracks.length === 0 ? (
            <li className={styles.empty}>
              <span className={styles.emptyIcon}>( ∅ )</span>
              <p className={styles.emptyTitle}>Sin resultados</p>
              <p className={styles.emptyBody}>Prueba con otro nombre de artista o track.</p>
            </li>
          ) : (
            tracks.map((track: Track, i: number) => (
              <li key={`${track.fact_id}-${track.track_id}`}>
                <TrackCard track={track} position={i + 1} />
              </li>
            ))
          )}
        </ol>
      )}
    </section>
  )
}
