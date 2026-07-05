import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { catalogoApi } from '../api/catalogo.api'
import { TrackCard } from '../components/TrackCard'
import { ExploreCard } from '../components/ExploreCard'
import { ErrorState } from '@shared/components/ErrorState'
import type { Track, Album, Artist, Genre } from '../types'
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

type SearchBoxProps = {
  value:       string
  onChange:    (v: string) => void
  onCommit:    () => void
  onClear:     () => void
  active:      boolean
  placeholder: string
}

// Buscador compacto y reusado por las 4 secciones — cada una lo usa acotado
// a su propio tipo de entidad, a diferencia del buscador único que antes
// mezclaba resultados de tracks con widgets de descubrimiento de género y
// artista al mismo tiempo (incoherente: "busco algo" y aun así veo
// "explorar por género" arriba). Ahora cada sección resuelve su propio
// destacado vs. resultado de búsqueda, nunca ambos ni cruzados.
function SearchBox({ value, onChange, onCommit, onClear, active, placeholder }: SearchBoxProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div className={styles.searchRow}>
      <div className={styles.searchWrap}>
        <SearchIcon />
        <input
          ref={inputRef}
          className={styles.searchInput}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onCommit()}
          placeholder={placeholder}
          aria-label={placeholder}
        />
      </div>
      {active && (
        <button className={styles.clearBtn} onClick={onClear} aria-label="Limpiar búsqueda">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <line x1="1" y1="1" x2="11" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="11" y1="1" x2="1"  y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  )
}

// ── Canciones ──────────────────────────────────────────────────────────────────

type CancionesProps = { genre: string; onToggleGenre: (name: string) => void }

function CancionesSection({ genre, onToggleGenre }: CancionesProps) {
  const [search, setSearch]       = useState('')
  const [committed, setCommitted] = useState('')
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

  function clear() {
    setSearch('')
    setCommitted('')
  }

  function subtitle(): string {
    if (isLoading) return '// cargando…'
    if (isError)   return '// error al cargar'
    if (filtered)  return `// ${total.toLocaleString('es')} resultado${total !== 1 ? 's' : ''}${committed ? ` para "${committed}"` : ''}${genre ? ` en ${genre}` : ''}`
    return `// top ${tracks.length} por popularidad`
  }

  return (
    <>
      <span className={styles.subtitle}>{subtitle()}</span>

      {genres.length > 0 && (
        <div className={styles.genreChipsSection} aria-label="Explorar por género">
          <span className={styles.genreChipsLabel}>Explorar por género</span>
          <div className={styles.genreChips}>
            {genres.map((g) => (
              <button
                key={g.genre_id}
                type="button"
                className={genre === g.name ? `${styles.genreChip} ${styles.genreChipActive}` : styles.genreChip}
                onClick={() => onToggleGenre(g.name)}
                aria-pressed={genre === g.name}
              >
                {g.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <SearchBox
        value={search}
        onChange={setSearch}
        onCommit={commit}
        onClear={clear}
        active={committed !== ''}
        placeholder="Track o artista… (Enter para buscar)"
      />

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
    </>
  )
}

// ── Playlists (álbumes del dataset) ─────────────────────────────────────────────

function PlaylistsSection() {
  const navigate = useNavigate()
  const [search, setSearch]       = useState('')
  const [committed, setCommitted] = useState('')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['albums', committed],
    queryFn:  () => catalogoApi.albumsSearch(committed, committed ? 30 : 12),
  })
  const playlists = data?.data ?? []

  function commit() {
    setCommitted(search.trim())
  }
  function clear() {
    setSearch('')
    setCommitted('')
  }

  return (
    <>
      <span className={styles.subtitle}>
        {isLoading ? '// cargando…' : isError ? '// error al cargar' : committed ? `// ${playlists.length} resultado${playlists.length !== 1 ? 's' : ''} para "${committed}"` : '// playlists destacadas'}
      </span>

      <SearchBox
        value={search}
        onChange={setSearch}
        onCommit={commit}
        onClear={clear}
        active={committed !== ''}
        placeholder="Buscar playlist… (Enter para buscar)"
      />

      {isError && (
        <ErrorState
          title="No se pudieron cargar los datos"
          message="Comprueba que la API esté activa e intenta de nuevo."
        />
      )}

      {!isError && !isLoading && playlists.length === 0 && (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>( ∅ )</span>
          <p className={styles.emptyTitle}>Sin resultados</p>
          <p className={styles.emptyBody}>Prueba con otro nombre de playlist.</p>
        </div>
      )}

      {!isError && playlists.length > 0 && (
        <div className={styles.exploreGrid}>
          {playlists.map((p: Album) => (
            <ExploreCard
              key={p.album_id}
              kind="playlist"
              name={p.name}
              imagenUrl={p.imagen_url}
              metric={`${(p.track_count ?? 0).toLocaleString('es')} canciones${p.release_year ? ` · ${p.release_year}` : ''}`}
              onClick={() => navigate(`/catalogo/album/${p.album_id}`)}
            />
          ))}
        </div>
      )}
    </>
  )
}

// ── Artistas ─────────────────────────────────────────────────────────────────

function ArtistasSection() {
  const navigate = useNavigate()
  const [search, setSearch]       = useState('')
  const [committed, setCommitted] = useState('')

  const { data, isLoading, isError } = useQuery({
    queryKey: committed ? ['artists', 'search', committed] : ['artists', 'top', 12],
    queryFn:  () => (committed ? catalogoApi.artistsSearch(committed, 30) : catalogoApi.artistsTop(12)),
  })
  const artists = data?.data ?? []

  function commit() {
    setCommitted(search.trim())
  }
  function clear() {
    setSearch('')
    setCommitted('')
  }

  return (
    <>
      <span className={styles.subtitle}>
        {isLoading ? '// cargando…' : isError ? '// error al cargar' : committed ? `// ${artists.length} resultado${artists.length !== 1 ? 's' : ''} para "${committed}"` : '// artistas destacados'}
      </span>

      <SearchBox
        value={search}
        onChange={setSearch}
        onCommit={commit}
        onClear={clear}
        active={committed !== ''}
        placeholder="Buscar artista… (Enter para buscar)"
      />

      {isError && (
        <ErrorState
          title="No se pudieron cargar los datos"
          message="Comprueba que la API esté activa e intenta de nuevo."
        />
      )}

      {!isError && !isLoading && artists.length === 0 && (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>( ∅ )</span>
          <p className={styles.emptyTitle}>Sin resultados</p>
          <p className={styles.emptyBody}>Prueba con otro nombre de artista.</p>
        </div>
      )}

      {!isError && artists.length > 0 && (
        <div className={styles.exploreGrid}>
          {artists.map((a: Artist) => (
            <ExploreCard
              key={a.artist_id}
              kind="artista"
              name={a.name}
              imagenUrl={a.imagen_url}
              metric={`${a.track_count.toLocaleString('es')} tracks${a.avg_popularity != null ? ` · pop ${a.avg_popularity}` : ''}`}
              onClick={() => navigate(`/catalogo/artista/${a.artist_id}`)}
            />
          ))}
        </div>
      )}
    </>
  )
}

// ── Géneros ──────────────────────────────────────────────────────────────────

type GenerosProps = { onSelectGenre: (name: string) => void }

function GenerosSection({ onSelectGenre }: GenerosProps) {
  const [search, setSearch] = useState('')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['genres', 'list'],
    queryFn:  () => catalogoApi.genresList(),
    staleTime: 5 * 60_000,
  })
  const all = data?.data ?? []

  const q = search.trim().toLowerCase()
  const filtered = q ? all.filter((g) => g.name.toLowerCase().includes(q)) : all
  const shown = q ? filtered : [...filtered].sort((a, b) => (b.track_count ?? 0) - (a.track_count ?? 0)).slice(0, 12)

  return (
    <>
      <span className={styles.subtitle}>
        {isLoading ? '// cargando…' : isError ? '// error al cargar' : q ? `// ${filtered.length} resultado${filtered.length !== 1 ? 's' : ''} para "${search.trim()}"` : '// géneros destacados'}
      </span>

      <SearchBox
        value={search}
        onChange={setSearch}
        onCommit={() => {}}
        onClear={() => setSearch('')}
        active={search !== ''}
        placeholder="Buscar género…"
      />

      {isError && (
        <ErrorState
          title="No se pudieron cargar los datos"
          message="Comprueba que la API esté activa e intenta de nuevo."
        />
      )}

      {!isError && !isLoading && shown.length === 0 && (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>( ∅ )</span>
          <p className={styles.emptyTitle}>Sin resultados</p>
          <p className={styles.emptyBody}>Prueba con otro nombre de género.</p>
        </div>
      )}

      {!isError && shown.length > 0 && (
        <div className={styles.exploreGrid}>
          {shown.map((g: Genre) => (
            <ExploreCard
              key={g.genre_id}
              kind="genero"
              name={g.name}
              metric={`${g.mood ? `${g.mood} · ` : ''}${(g.track_count ?? 0).toLocaleString('es')} tracks${g.avg_popularity != null ? ` · pop ${g.avg_popularity}` : ''}`}
              onClick={() => onSelectGenre(g.name)}
            />
          ))}
        </div>
      )}
    </>
  )
}

// ── Página ───────────────────────────────────────────────────────────────────

type Tab = 'canciones' | 'playlists' | 'artistas' | 'generos'

const TABS: { id: Tab; label: string }[] = [
  { id: 'canciones', label: 'Canciones' },
  { id: 'playlists', label: 'Playlists' },
  { id: 'artistas',  label: 'Artistas' },
  { id: 'generos',   label: 'Géneros' },
]

export function CatalogPage() {
  const [activeTab, setActiveTab] = useState<Tab>('canciones')
  const [genre, setGenre] = useState('')

  useDocumentTitle(activeTab === 'canciones' ? 'Catálogo' : `Catálogo · ${TABS.find((t) => t.id === activeTab)?.label}`)

  function toggleGenre(name: string) {
    setGenre((current) => (current === name ? '' : name))
  }

  function selectGenreAndBrowse(name: string) {
    setGenre(name)
    setActiveTab('canciones')
  }

  return (
    <section className={styles.page}>
      <header className={styles.pageHead}>
        <h1 className={styles.heading}>Catálogo</h1>
      </header>

      <div className={styles.tabBar} role="tablist" aria-label="Secciones del catálogo">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? `${styles.tab} ${styles.tabActive}` : styles.tab}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'canciones' && <CancionesSection genre={genre} onToggleGenre={toggleGenre} />}
      {activeTab === 'playlists' && <PlaylistsSection />}
      {activeTab === 'artistas'  && <ArtistasSection />}
      {activeTab === 'generos'   && <GenerosSection onSelectGenre={selectGenreAndBrowse} />}
    </section>
  )
}
