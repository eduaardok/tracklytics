import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiClient, type ApiResponse } from '@shared/lib/api-client'
import styles from './UserPicker.module.css'

export type UserSearchResult = {
  usuario_id: string
  nombre:     string
  email:      string
  rol:        string
}

type Props = {
  label:    string
  selected: UserSearchResult | null
  onSelect: (user: UserSearchResult) => void
  onClear:  () => void
}

// Mismo patrón que ArtistPicker/TrackPicker: debounce 300ms, selección por
// `onMouseDown`, botón de limpiar. Consume el endpoint admin-only
// `GET /seguridad/usuarios/buscar` — reemplaza el input de `usuario_id`
// crudo en Administración, Facturación y plan familiar.
export function UserPicker({ label, selected, onSelect, onClear }: Props) {
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
    queryKey: ['shared', 'user-picker-search', debouncedQ],
    queryFn:  () =>
      apiClient.get<ApiResponse<UserSearchResult>>(
        `/seguridad/usuarios/buscar?q=${encodeURIComponent(debouncedQ)}&limit=8`,
      ),
    enabled: debouncedQ.length >= 2 && !selected,
  })

  function select(user: UserSearchResult) {
    onSelect(user)
    setQuery(user.nombre)
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
          placeholder="Nombre o correo del usuario…"
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
            {items.map((u) => (
              <li key={u.usuario_id} role="option" aria-selected={false}>
                <button type="button" className={styles.dropdownItem} onMouseDown={() => select(u)}>
                  <span className={styles.dropdownName}>{u.nombre}</span>
                  <span className={styles.dropdownMeta}>{u.email}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
