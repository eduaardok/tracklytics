import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiClient, type ApiResponse } from '@shared/lib/api-client'
import styles from './TrackPicker.module.css'

export type AlbumSearchResult = {
  album_id:     number
  name:         string
  release_year?: number | null
}

type Props = {
  label:    string
  selected: AlbumSearchResult | null
  onSelect: (album: AlbumSearchResult) => void
  onClear:  () => void
}

// Mismo patrón que TrackPicker/ArtistPicker/UserPicker (S11) — reemplaza el
// `album_id` crudo que "Asignar sello a artista o álbum" exigía conocer de
// memoria.
export function AlbumPicker({ label, selected, onSelect, onClear }: Props) {
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
    queryKey: ['shared', 'album-picker-search', debouncedQ],
    queryFn:  () =>
      apiClient.get<ApiResponse<AlbumSearchResult>>(
        `/albums/search?q=${encodeURIComponent(debouncedQ)}&limit=8`,
      ),
    enabled: debouncedQ.length >= 2 && !selected,
  })

  function select(album: AlbumSearchResult) {
    onSelect(album)
    setQuery(album.name)
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
          placeholder="Nombre del álbum…"
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
            {items.map((a) => (
              <li key={a.album_id} role="option" aria-selected={false}>
                <button type="button" className={styles.dropdownItem} onMouseDown={() => select(a)}>
                  <span className={styles.dropdownMeta}>
                    <span className={styles.dropdownName}>{a.name}</span>
                    {a.release_year ? <span className={styles.dropdownSub}>{a.release_year}</span> : null}
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
