import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { analiticaApi } from '../api/analitica.api'
import type { ArtistSearchResult, TrackSearchResult, EngagementData, DesempenoRelativo } from '../types'
import styles from './EngagementPage.module.css'

// ── Types ────────────────────────────────────────────────────────────────────
type EntityType = 'artista' | 'track'

type Selection = {
  type:        EntityType
  id:          number
  displayName: string
  subtext:     string
}

type SearchPayload =
  | { kind: 'artista'; items: ArtistSearchResult[] }
  | { kind: 'track';   items: TrackSearchResult[]  }

// ── Utilities ────────────────────────────────────────────────────────────────
const fmt = (n: number) => n.toLocaleString('es-ES')

// ── Sub-components ───────────────────────────────────────────────────────────
function SearchIcon() {
  return (
    <svg className={styles.searchIcon} width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
      <line x1="10" y1="10" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function PanelSkeleton({ rows = 4 }: { rows?: number }) {
  const widths = [55, 80, 60, 70]
  return (
    <div className={styles.panel}>
      <span className={styles.skel} style={{ display: 'block', height: 20, width: '50%', marginBottom: 20 }} />
      <span className={styles.skel} style={{ display: 'block', height: 4, marginBottom: 24 }} />
      {Array.from({ length: rows }).map((_, i) => (
        <span
          key={i}
          className={styles.skel}
          style={{ display: 'block', height: 14, width: `${widths[i % widths.length]}%`, marginBottom: 10 }}
        />
      ))}
    </div>
  )
}

function EngagementPanel({
  selection,
  engagement,
}: {
  selection:  Selection
  engagement: EngagementData
}) {
  const score = engagement.engagement_score
  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <div className={styles.panelTitle}>{selection.displayName}</div>
        {selection.subtext && <div className={styles.panelSub}>{selection.subtext}</div>}
      </div>

      <div className={styles.scoreRow}>
        <span className={styles.scoreLabel}>Engagement score</span>
        <div className={styles.scoreTrack} aria-hidden="true">
          <div
            className={styles.scoreFill}
            style={{ '--fill-pct': String(score / 100) } as React.CSSProperties}
          />
        </div>
        <span className={styles.scoreNumber}>{score} / 100</span>
      </div>

      <div className={styles.kv}>
        <span className={styles.kvLabel}>Reproducciones</span>
        <span className={styles.kvValue}>{fmt(engagement.reproducciones)}</span>

        <span className={styles.kvLabel}>Favoritos</span>
        <span className={styles.kvValue}>{fmt(engagement.favoritos)}</span>

        <span className={styles.kvLabel}>Raw score</span>
        <span className={styles.kvValue}>{fmt(engagement.raw_score)}</span>

        <span className={styles.kvLabel}>Máx. raw score</span>
        <span className={styles.kvValue}>{fmt(engagement.max_raw_score)}</span>
      </div>
    </div>
  )
}

function DesempenoPanel({ data }: { data: DesempenoRelativo }) {
  if (!data.suficiente) {
    return (
      <div className={styles.panel}>
        <div className={styles.panelHead}>
          <div className={styles.panelTitle}>Desempeño relativo</div>
        </div>
        <div className={styles.insufficientNotice}>
          <span className={styles.insufficientText}>{data.mensaje}</span>
        </div>
      </div>
    )
  }

  const { popularity, engagement_score, indice_desempeno } = data
  const outperforms = indice_desempeno !== null && indice_desempeno >= 1.0

  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <div className={styles.panelTitle}>Desempeño relativo</div>
      </div>
      <div className={styles.desempenoKv}>
        <span className={styles.kvLabel}>Popularidad (mercado)</span>
        <span className={styles.kvValue}>{popularity}</span>

        <span className={styles.kvLabel}>Engagement (plataforma)</span>
        <span className={styles.kvValue}>{engagement_score}</span>

        <span className={styles.kvLabel}>Índice</span>
        <span className={styles.kvValue}>
          {indice_desempeno !== null ? indice_desempeno.toFixed(4) : '—'}
        </span>
      </div>
      {indice_desempeno !== null && (
        <p className={`${styles.interpretation} ${outperforms ? styles.interpretationPositive : ''}`}>
          {outperforms
            ? 'Engagement supera popularidad de mercado'
            : 'Popularidad de mercado supera engagement en plataforma'}
        </p>
      )}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
export function EngagementPage() {
  const [entityType, setEntityType]   = useState<EntityType>('artista')
  const [query, setQuery]             = useState('')
  const [debouncedQ, setDebouncedQ]   = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [selection, setSelection]     = useState<Selection | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(query), 300)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    if (!selection && debouncedQ.length >= 2) setShowDropdown(true)
    else setShowDropdown(false)
  }, [debouncedQ, selection])

  const searchQuery = useQuery({
    queryKey: ['eng-search', entityType, debouncedQ] as const,
    queryFn: async (): Promise<SearchPayload> => {
      if (entityType === 'artista') {
        const r = await analiticaApi.artistsSearch(debouncedQ)
        return { kind: 'artista', items: r.data }
      }
      const r = await analiticaApi.tracksSearch(debouncedQ)
      return { kind: 'track', items: r.data }
    },
    enabled: debouncedQ.length >= 2 && !selection,
  })

  const { data: engagement, isLoading: engLoading, isError: engError } = useQuery({
    queryKey: ['engagement', selection?.type, selection?.id],
    queryFn: () =>
      selection!.type === 'artista'
        ? analiticaApi.engagementByArtist(selection!.id)
        : analiticaApi.engagementByFact(selection!.id),
    enabled: !!selection,
  })

  const { data: desempeno, isLoading: desLoading } = useQuery({
    queryKey: ['desempeno', selection?.id],
    queryFn: () => analiticaApi.desempenoRelativo(selection!.id),
    enabled: !!selection && selection.type === 'track',
  })

  function changeType(type: EntityType) {
    setEntityType(type)
    setQuery('')
    setDebouncedQ('')
    setSelection(null)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  function clearSelection() {
    setSelection(null)
    setQuery('')
    setDebouncedQ('')
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  function selectArtist(a: ArtistSearchResult) {
    setSelection({ type: 'artista', id: a.artist_id, displayName: a.name, subtext: '' })
    setQuery(a.name)
    setShowDropdown(false)
  }

  function selectTrack(t: TrackSearchResult) {
    setSelection({ type: 'track', id: t.fact_id, displayName: t.track_name, subtext: t.artist_name })
    setQuery(t.track_name)
    setShowDropdown(false)
  }

  function subtitle(): string {
    if (!selection) return '// busca un artista o track'
    if (engLoading)  return '// cargando…'
    return selection.type === 'artista'
      ? `// artista: ${selection.displayName}`
      : `// track: ${selection.displayName}`
  }

  const artistItems = searchQuery.data?.kind === 'artista' ? searchQuery.data.items : []
  const trackItems  = searchQuery.data?.kind === 'track'   ? searchQuery.data.items : []
  const hasResults  = artistItems.length > 0 || trackItems.length > 0

  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>Engagement</h1>
      <span className={styles.subtitle}>{subtitle()}</span>

      {/* ── Controls ── */}
      <div className={styles.controls}>
        <div className={styles.typeToggle} role="group" aria-label="Tipo de entidad">
          {(['artista', 'track'] as const).map((t) => (
            <button
              key={t}
              className={`${styles.typeBtn} ${entityType === t ? styles.typeBtnActive : ''}`}
              onClick={() => changeType(t)}
              aria-pressed={entityType === t}
            >
              {t === 'artista' ? 'Artista' : 'Track'}
            </button>
          ))}
        </div>

        <div className={styles.searchWrap}>
          <SearchIcon />
          <input
            ref={inputRef}
            className={styles.searchInput}
            type="search"
            value={query}
            readOnly={!!selection}
            onChange={(e) => { if (!selection) setQuery(e.target.value) }}
            onFocus={() => { if (!selection && debouncedQ.length >= 2) setShowDropdown(true) }}
            onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setShowDropdown(false)
                if (!selection) { setQuery(''); setDebouncedQ('') }
              }
            }}
            placeholder={entityType === 'artista' ? 'Nombre del artista…' : 'Nombre del track…'}
            aria-label={entityType === 'artista' ? 'Buscar artista' : 'Buscar track'}
            aria-haspopup="listbox"
            aria-expanded={showDropdown}
          />

          {selection && (
            <button
              className={styles.clearSearchBtn}
              onClick={clearSelection}
              aria-label="Limpiar selección"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                <line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          )}

          {showDropdown && !searchQuery.isError && (
            <ul className={styles.dropdown} role="listbox" aria-label="Resultados">
              {!hasResults && !searchQuery.isLoading && (
                <li>
                  <span className={styles.dropdownItem} style={{ cursor: 'default' }}>
                    <span className={styles.dropdownMeta}>Sin resultados</span>
                  </span>
                </li>
              )}
              {entityType === 'artista'
                ? artistItems.map((a) => (
                    <li key={a.artist_id} role="option" aria-selected={false}>
                      <button className={styles.dropdownItem} onMouseDown={() => selectArtist(a)}>
                        <span className={styles.dropdownName}>{a.name}</span>
                      </button>
                    </li>
                  ))
                : trackItems.map((t) => (
                    <li key={t.fact_id} role="option" aria-selected={false}>
                      <button className={styles.dropdownItem} onMouseDown={() => selectTrack(t)}>
                        <span className={styles.dropdownName}>{t.track_name}</span>
                        <span className={styles.dropdownMeta}>{t.artist_name} · {t.genre_name}</span>
                      </button>
                    </li>
                  ))
              }
            </ul>
          )}
        </div>
      </div>

      {/* ── Result area ── */}
      {searchQuery.isError && !selection && (
        <div className={styles.panel}>
          <p className={styles.panelError}>Error al buscar — la API respondió con un error.</p>
          <button className={styles.retryBtn} onClick={() => searchQuery.refetch()}>
            Reintentar
          </button>
        </div>
      )}

      {!selection && !searchQuery.isError && (
        <div className={styles.prompt}>
          <p className={styles.promptText}>
            Busca un artista o track para ver su actividad en la plataforma.
          </p>
        </div>
      )}

      {selection && engLoading && <PanelSkeleton />}

      {selection && engError && (
        <div className={styles.panel}>
          <p className={styles.panelError}>No se pudieron cargar los datos de engagement.</p>
        </div>
      )}

      {selection && !engLoading && !engError && engagement && (
        <>
          <EngagementPanel selection={selection} engagement={engagement} />
          {selection.type === 'track' && (
            desLoading
              ? <PanelSkeleton rows={3} />
              : desempeno && <DesempenoPanel data={desempeno} />
          )}
        </>
      )}
    </section>
  )
}
