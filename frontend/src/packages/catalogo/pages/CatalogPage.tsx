import { useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, LayoutGrid, List, SearchX } from 'lucide-react'
import { useDocumentTitle } from '@shared/hooks/useDocumentTitle'
import { getCatalogViewMode, setCatalogViewMode, type CatalogViewMode } from '@shared/lib/ui-prefs'
import { genreAccent } from '@shared/lib/genre-colors'
import { catalogoApi } from '../api/catalogo.api'
import { TrackCard } from '../components/TrackCard'
import { TrackGridCard } from '../components/TrackGridCard'
import { ExploreGridCard } from '../components/ExploreGridCard'
import { ExploreRow } from '../components/ExploreRow'
import { CatalogHero } from '../components/CatalogHero'
import { CatalogDiscovery } from '../components/CatalogDiscovery'
import { ErrorState } from '@shared/components/ErrorState'
import { EmptyState } from '@shared/components/EmptyState'
import type { Track, Album, Artist, Genre } from '../types'
import { TAB_LABEL, type Tab } from './CatalogPage.tabs'
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

function SkeletonTiles() {
  return (
    <div className={styles.gridSkeleton} aria-hidden="true">
      {SKELETON_WIDTHS.map(([, mw], i) => (
        <div key={i} className={styles.skeletonTile}>
          <span className={`${styles.skel} ${styles.skelTileArt}`} />
          <span className={`${styles.skel} ${styles.skelTitle}`} style={{ width: '85%' }} />
          <span className={`${styles.skel} ${styles.skelMeta}`}  style={{ width: `${mw}%` }} />
        </div>
      ))}
    </div>
  )
}

type ViewToggleProps = { mode: CatalogViewMode; onChange: (m: CatalogViewMode) => void }

function ViewToggle({ mode, onChange }: ViewToggleProps) {
  return (
    <div className={styles.viewToggle} role="group" aria-label="Modo de vista">
      <button
        type="button"
        className={mode === 'list' ? `${styles.viewBtn} ${styles.viewBtnActive}` : styles.viewBtn}
        onClick={() => onChange('list')}
        aria-pressed={mode === 'list'}
        title="Vista de lista"
        aria-label="Vista de lista"
      >
        <List size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={mode === 'grid' ? `${styles.viewBtn} ${styles.viewBtnActive}` : styles.viewBtn}
        onClick={() => onChange('grid')}
        aria-pressed={mode === 'grid'}
        title="Vista de cuadrícula"
        aria-label="Vista de cuadrícula"
      >
        <LayoutGrid size={16} aria-hidden="true" />
      </button>
    </div>
  )
}

// Preferencia de vista compartida por las 4 secciones (S13-P6: antes solo
// Canciones la usaba) — un solo toggle grid/lista para todo el catálogo, no
// una preferencia por pestaña, mismo criterio que el resto de `ui-prefs`
// (persistente entre sesiones).
function useCatalogViewMode() {
  const [mode, setMode] = useState<CatalogViewMode>(getCatalogViewMode)
  function change(next: CatalogViewMode) {
    setMode(next)
    setCatalogViewMode(next)
  }
  return [mode, change] as const
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
  const [showFilters, setShowFilters] = useState(false)
  const [popularityMin, setPopularityMin] = useState('')
  const [tempoMin, setTempoMin]           = useState('')
  const [energyMin, setEnergyMin]         = useState('')
  const [viewMode, changeViewMode] = useCatalogViewMode()

  const popMin    = popularityMin ? Number(popularityMin) : undefined
  const tempMin   = tempoMin ? Number(tempoMin) : undefined
  const enMin      = energyMin ? Number(energyMin) : undefined
  const hasAdvancedFilters = popMin != null || tempMin != null || enMin != null
  const filtered = committed !== '' || genre !== '' || hasAdvancedFilters

  const { data, isLoading, isError } = useQuery({
    queryKey: filtered ? ['tracks', 'search', committed, genre, popMin, tempMin, enMin] : ['tracks', 'top'],
    queryFn:  () =>
      filtered
        ? catalogoApi.tracksSearch({ q: committed, genre, limit: 50, popularityMin: popMin, tempoMin: tempMin, energyMin: enMin })
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

  function clearAdvancedFilters() {
    setPopularityMin('')
    setTempoMin('')
    setEnergyMin('')
  }

  function subtitle(): string {
    if (isLoading) return '// cargando…'
    if (isError)   return '// error al cargar'
    if (filtered)  return `// ${total.toLocaleString('es')} resultado${total !== 1 ? 's' : ''}${committed ? ` para "${committed}"` : ''}${genre ? ` en ${genre}` : ''}`
    return `// top ${tracks.length} por popularidad`
  }

  return (
    <>
      <div className={styles.subtitleRow}>
        <span className={styles.subtitle}>{subtitle()}</span>
        <ViewToggle mode={viewMode} onChange={changeViewMode} />
      </div>

      {genres.length > 0 && (
        <div className={styles.genreChipsSection} aria-label="Explorar por género">
          <span className={styles.genreChipsLabel}>Explorar por género</span>
          <div className={styles.genreChips}>
            {genres.map((g) => {
              const active = genre === g.name
              const accent = genreAccent(g.name)
              return (
                <button
                  key={g.genre_id}
                  type="button"
                  className={active ? `${styles.genreChip} ${styles.genreChipActive}` : styles.genreChip}
                  style={active ? { background: accent, borderColor: accent } : { borderColor: genreAccent(g.name, 0.35), color: accent }}
                  onClick={() => onToggleGenre(g.name)}
                  aria-pressed={active}
                >
                  {g.name}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <SearchBox
        value={search}
        onChange={setSearch}
        onCommit={commit}
        onClear={clear}
        active={committed !== ''}
        placeholder="Canción o artista… (Enter para buscar)"
      />

      <div className={styles.advancedFiltersSection}>
        <button
          type="button"
          className={hasAdvancedFilters ? `${styles.genreChip} ${styles.genreChipActive}` : styles.genreChip}
          onClick={() => setShowFilters((v) => !v)}
          aria-expanded={showFilters}
        >
          Filtros avanzados{hasAdvancedFilters ? ' •' : ''}
        </button>

        {showFilters && (
          <div className={styles.advancedFiltersPanel}>
            <label className={styles.advancedFilterField}>
              Popularidad mínima
              <input
                type="number" min={0} max={100} placeholder="0–100"
                value={popularityMin}
                onChange={(e) => setPopularityMin(e.target.value)}
              />
            </label>
            <label className={styles.advancedFilterField}>
              Tempo mínimo (BPM)
              <input
                type="number" min={0} placeholder="ej. 120"
                value={tempoMin}
                onChange={(e) => setTempoMin(e.target.value)}
              />
            </label>
            <label className={styles.advancedFilterField}>
              Energía mínima (Energy)
              <input
                type="number" min={0} max={1} step={0.1} placeholder="0–1"
                value={energyMin}
                onChange={(e) => setEnergyMin(e.target.value)}
              />
            </label>
            {hasAdvancedFilters && (
              <button type="button" className={styles.advancedFiltersClear} onClick={clearAdvancedFilters}>
                Limpiar
              </button>
            )}
          </div>
        )}
      </div>

      {isError && (
        <ErrorState
          title="No se pudieron cargar los datos"
          message="Comprueba que la API esté activa e intenta de nuevo."
        />
      )}

      {!isError && isLoading && (viewMode === 'grid' ? <SkeletonTiles /> : (
        <ol className={styles.list} aria-label="Lista de tracks"><SkeletonRows /></ol>
      ))}

      {!isError && !isLoading && tracks.length === 0 && (
        <EmptyState
          icon={<SearchX size={22} aria-hidden="true" />}
          title="Sin resultados"
          body="Prueba con otro nombre de artista o track."
        />
      )}

      {!isError && !isLoading && tracks.length > 0 && (
        viewMode === 'grid' ? (
          <div className={styles.trackGrid} aria-label="Cuadrícula de tracks">
            {tracks.map((track: Track, i: number) => (
              <TrackGridCard key={`${track.fact_id}-${track.track_id}`} track={track} queue={tracks} index={i} />
            ))}
          </div>
        ) : (
          <ol className={styles.list} aria-label="Lista de tracks">
            {tracks.map((track: Track, i: number) => (
              <li key={`${track.fact_id}-${track.track_id}`}>
                <TrackCard track={track} position={i + 1} queue={tracks} />
              </li>
            ))}
          </ol>
        )
      )}
    </>
  )
}

// ── Playlists (álbumes del dataset) ─────────────────────────────────────────────

function PlaylistsSection() {
  const navigate = useNavigate()
  const [search, setSearch]       = useState('')
  const [committed, setCommitted] = useState('')
  const [viewMode, changeViewMode] = useCatalogViewMode()

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
      <div className={styles.subtitleRow}>
        <span className={styles.subtitle}>
          {isLoading ? '// cargando…' : isError ? '// error al cargar' : committed ? `// ${playlists.length} resultado${playlists.length !== 1 ? 's' : ''} para "${committed}"` : '// playlists destacadas'}
        </span>
        <ViewToggle mode={viewMode} onChange={changeViewMode} />
      </div>

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
        <EmptyState
          icon={<SearchX size={22} aria-hidden="true" />}
          title="Sin resultados"
          body="Prueba con otro nombre de playlist."
        />
      )}

      {!isError && playlists.length > 0 && (
        viewMode === 'grid' ? (
          <div className={styles.exploreGridCards} aria-label="Cuadrícula de playlists">
            {playlists.map((p: Album) => (
              <ExploreGridCard
                key={p.album_id}
                kind="playlist"
                name={p.name}
                imagenUrl={p.imagen_url}
                albumId={p.album_id}
                metric={`${(p.track_count ?? 0).toLocaleString('es')} canciones${p.release_year ? ` · ${p.release_year}` : ''}`}
                onClick={() => navigate(`/catalogo/album/${p.album_id}`)}
              />
            ))}
          </div>
        ) : (
          <div className={styles.exploreList} aria-label="Lista de playlists">
            {playlists.map((p: Album) => (
              <ExploreRow
                key={p.album_id}
                kind="playlist"
                name={p.name}
                imagenUrl={p.imagen_url}
                metric={`${(p.track_count ?? 0).toLocaleString('es')} canciones${p.release_year ? ` · ${p.release_year}` : ''}`}
                onClick={() => navigate(`/catalogo/album/${p.album_id}`)}
              />
            ))}
          </div>
        )
      )}
    </>
  )
}

// ── Artistas ─────────────────────────────────────────────────────────────────

function ArtistasSection() {
  const navigate = useNavigate()
  const [search, setSearch]       = useState('')
  const [committed, setCommitted] = useState('')
  const [viewMode, changeViewMode] = useCatalogViewMode()

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

  // "pop {n}" (bugfix QA S10 ronda 2): abreviaba "popularidad", pero "pop"
  // también es un género musical real — un usuario razonablemente lo lee
  // como género (confirmado con artistas no-pop en la QA). El dashboard de
  // Analítica ya resuelve la misma ambigüedad con ★, mismo criterio acá.
  function metricDe(a: Artist): string {
    return `${a.track_count.toLocaleString('es')} canciones${a.avg_popularity != null ? ` · ★ ${a.avg_popularity}` : ''}`
  }

  return (
    <>
      <div className={styles.subtitleRow}>
        <span className={styles.subtitle}>
          {isLoading ? '// cargando…' : isError ? '// error al cargar' : committed ? `// ${artists.length} resultado${artists.length !== 1 ? 's' : ''} para "${committed}"` : '// artistas destacados'}
        </span>
        <ViewToggle mode={viewMode} onChange={changeViewMode} />
      </div>

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
        <EmptyState
          icon={<SearchX size={22} aria-hidden="true" />}
          title="Sin resultados"
          body="Prueba con otro nombre de artista."
        />
      )}

      {!isError && artists.length > 0 && (
        viewMode === 'grid' ? (
          <div className={styles.exploreGridCards} aria-label="Cuadrícula de artistas">
            {artists.map((a: Artist) => (
              <ExploreGridCard
                key={a.artist_id}
                kind="artista"
                name={a.name}
                imagenUrl={a.imagen_url}
                metric={metricDe(a)}
                onClick={() => navigate(`/catalogo/artista/${a.artist_id}`)}
              />
            ))}
          </div>
        ) : (
          <div className={styles.exploreList} aria-label="Lista de artistas">
            {artists.map((a: Artist) => (
              <ExploreRow
                key={a.artist_id}
                kind="artista"
                name={a.name}
                imagenUrl={a.imagen_url}
                metric={metricDe(a)}
                onClick={() => navigate(`/catalogo/artista/${a.artist_id}`)}
              />
            ))}
          </div>
        )
      )}
    </>
  )
}

// ── Géneros ──────────────────────────────────────────────────────────────────

type GenerosProps = { onSelectGenre: (name: string) => void }

function GenerosSection({ onSelectGenre }: GenerosProps) {
  const [search, setSearch] = useState('')
  const [viewMode, changeViewMode] = useCatalogViewMode()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['genres', 'list'],
    queryFn:  () => catalogoApi.genresList(),
    staleTime: 5 * 60_000,
  })
  const all = data?.data ?? []

  const q = search.trim().toLowerCase()
  const filtered = q ? all.filter((g) => g.name.toLowerCase().includes(q)) : all
  const shown = q ? filtered : [...filtered].sort((a, b) => (b.track_count ?? 0) - (a.track_count ?? 0)).slice(0, 12)

  function metricDe(g: Genre): string {
    return `${g.mood ? `${g.mood} · ` : ''}${(g.track_count ?? 0).toLocaleString('es')} canciones${g.avg_popularity != null ? ` · pop ${g.avg_popularity}` : ''}`
  }

  return (
    <>
      <div className={styles.subtitleRow}>
        <span className={styles.subtitle}>
          {isLoading ? '// cargando…' : isError ? '// error al cargar' : q ? `// ${filtered.length} resultado${filtered.length !== 1 ? 's' : ''} para "${search.trim()}"` : '// géneros destacados'}
        </span>
        <ViewToggle mode={viewMode} onChange={changeViewMode} />
      </div>

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
        <EmptyState
          icon={<SearchX size={22} aria-hidden="true" />}
          title="Sin resultados"
          body="Prueba con otro nombre de género."
        />
      )}

      {!isError && shown.length > 0 && (
        viewMode === 'grid' ? (
          <div className={styles.exploreGridCards} aria-label="Cuadrícula de géneros">
            {shown.map((g: Genre) => (
              <ExploreGridCard
                key={g.genre_id}
                kind="genero"
                name={g.name}
                metric={metricDe(g)}
                imagenUrl={g.imagen_url}
                onClick={() => onSelectGenre(g.name)}
              />
            ))}
          </div>
        ) : (
          <div className={styles.exploreList} aria-label="Lista de géneros">
            {shown.map((g: Genre) => (
              <ExploreRow
                key={g.genre_id}
                kind="genero"
                name={g.name}
                metric={metricDe(g)}
                imagenUrl={g.imagen_url}
                onClick={() => onSelectGenre(g.name)}
              />
            ))}
          </div>
        )
      )}
    </>
  )
}

// ── Página ───────────────────────────────────────────────────────────────────

// Catálogo unificado (rediseño "centro de descubrimiento musical"): antes
// `/catalogo` ERA cuatro pestañas (Canciones/Playlists/Artistas/Géneros) —
// el usuario tenía que elegir una categoría antes de ver ningún contenido.
// Ahora la ruta principal (sin `?ver=`) muestra `CatalogDiscovery`, varias
// categorías a la vez; `?ver=<tab>` (mismo `/catalogo`, sin ruta nueva)
// muestra la vista completa de esa categoría — los 4 componentes de sección
// de abajo (CancionesSection/PlaylistsSection/ArtistasSection/
// GenerosSection) son exactamente los mismos que antes vivían detrás de las
// pestañas, con toda su lógica de búsqueda/filtros/paginación intacta.
function esTab(v: string | null): v is Tab {
  return v === 'canciones' || v === 'playlists' || v === 'artistas' || v === 'generos'
}

export function CatalogPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const rawVer = searchParams.get('ver')
  const ver: Tab | null = esTab(rawVer) ? rawVer : null
  const genre = searchParams.get('genre') ?? ''
  const sectionsRef = useRef<HTMLDivElement>(null)

  useDocumentTitle(ver ? `Catálogo · ${TAB_LABEL[ver]}` : 'Catálogo')

  function abrirVista(tab: Tab, genreName?: string) {
    const next = new URLSearchParams()
    next.set('ver', tab)
    if (genreName) next.set('genre', genreName)
    setSearchParams(next)
    sectionsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function volverInicio() {
    setSearchParams({})
  }

  function toggleGenre(name: string) {
    const next = new URLSearchParams(searchParams)
    if (genre === name) next.delete('genre')
    else next.set('genre', name)
    setSearchParams(next)
  }

  function scrollToSections() {
    sectionsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <section className={styles.page}>
      <CatalogHero onExplore={scrollToSections} />

      <div ref={sectionsRef}>
        {!ver ? (
          <CatalogDiscovery onVerTodo={abrirVista} />
        ) : (
          <>
            <div className={styles.viewHeader}>
              <button type="button" className={styles.backLink} onClick={volverInicio}>
                <ChevronLeft size={16} aria-hidden="true" />
                Catálogo
              </button>
              <h1 className={styles.viewTitle}>{TAB_LABEL[ver]}</h1>
            </div>

            {ver === 'canciones' && <CancionesSection genre={genre} onToggleGenre={toggleGenre} />}
            {ver === 'playlists' && <PlaylistsSection />}
            {ver === 'artistas'  && <ArtistasSection />}
            {ver === 'generos'   && <GenerosSection onSelectGenre={(name) => abrirVista('canciones', name)} />}
          </>
        )}
      </div>
    </section>
  )
}
