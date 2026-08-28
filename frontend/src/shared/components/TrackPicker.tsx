import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiClient, type ApiResponse } from '@shared/lib/api-client'
import { AlbumArt } from './AlbumArt'
import styles from './TrackPicker.module.css'

export type TrackSearchResult = {
  fact_id:     number
  track_name:  string
  artist_name: string
  imagen_url?: string | null
}

type Props = {
  label:    string
  selected: TrackSearchResult | null
  onSelect: (track: TrackSearchResult) => void
  onClear:  () => void
}

// Mismo patrón que ArtistPicker (frontend/src/packages/analitica/components/
// ArtistPicker.tsx): debounce 300ms, selección por `onMouseDown` (evita que
// el blur del input cierre el dropdown antes del click), botón de limpiar.
// Vive en shared/ (no en un paquete de capability) porque lo consumen
// distribucion y social por igual — reemplaza el input de `fact_id` crudo
// que antes exigía conocer el identificador interno del track.
export function TrackPicker({ label, selected, onSelect, onClear }: Props) {
  const [query, setQuery]               = useState('')
  const [debouncedQ, setDebouncedQ]     = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(query), 300)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    if (!selected && debouncedQ.length >= 2) setShowDropdown(true)
    else setShowDropdown(false)
  }, [debouncedQ, selected])

  const searchQuery = useQuery({
    queryKey: ['shared', 'track-picker-search', debouncedQ],
    queryFn:  () =>
      apiClient.get<ApiResponse<TrackSearchResult>>(
        `/tracks/search?q=${encodeURIComponent(debouncedQ)}&limit=8`,
      ),
    enabled: debouncedQ.length >= 2 && !selected,
  })

  function select(track: TrackSearchResult) {
    onSelect(track)
    setQuery(track.track_name)
    setShowDropdown(false)
  }

  function clear() {
    onClear()
    setQuery('')
    setDebouncedQ('')
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const items = searchQuery.data?.data ?? []

  return (
    <div className={styles.field}>
      <label className={styles.label}>{label}</label>
      <div className={styles.searchWrap}>
        <input
          ref={inputRef}
          className={styles.searchInput}
          type="search"
          value={query}
          readOnly={!!selected}
          onChange={(e) => { if (!selected) setQuery(e.target.value) }}
          onFocus={() => { if (!selected && debouncedQ.length >= 2) setShowDropdown(true) }}
          onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
          placeholder="Nombre de la canción o artista…"
          aria-label={label}
          aria-haspopup="listbox"
          aria-expanded={showDropdown}
        />
        {selected && (
          <button className={styles.clearBtn} onClick={clear} aria-label="Limpiar selección" type="button">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
              <line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        )}
        {showDropdown && !searchQuery.isError && (
          <ul className={styles.dropdown} role="listbox" aria-label={`Resultados — ${label}`}>
            {items.length === 0 && !searchQuery.isLoading && (
              <li>
                <span className={styles.dropdownItem} style={{ cursor: 'default' }}>
                  <span className={styles.dropdownMeta}>Sin resultados</span>
                </span>
              </li>
            )}
            {items.map((t) => (
              <li key={t.fact_id} role="option" aria-selected={false}>
                <button type="button" className={styles.dropdownItem} onMouseDown={() => select(t)}>
                  <AlbumArt src={t.imagen_url} alt="" size={32} />
                  <span className={styles.dropdownMeta}>
                    <span className={styles.dropdownName}>{t.track_name}</span>
                    <span className={styles.dropdownSub}>{t.artist_name}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
