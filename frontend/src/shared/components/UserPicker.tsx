import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { List } from 'lucide-react'
import { apiClient } from '@shared/lib/api-client'
import styles from './UserPicker.module.css'

export type UserSearchResult = {
  usuario_id:     string
  nombre:         string
  email:          string
  rol:            string
  // Solo viaja en modo "explorar lista completa" (`usuarios_listado_sql`) —
  // el endpoint de búsqueda por texto (`USUARIOS_BUSQUEDA`) no lo selecciona.
  fecha_registro?: string
}

type BuscarUsuariosResponse = {
  data:  UserSearchResult[]
  total: number
  page:  number
  limit: number
}

type Props = {
  label:    string
  selected: UserSearchResult | null
  onSelect: (user: UserSearchResult) => void
  onClear:  () => void
}

const PAGE_SIZE = 8
const ROLES = ['user', 'analyst', 'admin']

// Mismo patrón que ArtistPicker/TrackPicker: debounce 300ms, selección por
// `onMouseDown`, botón de limpiar. Consume el endpoint admin-only
// `GET /seguridad/usuarios/buscar` — reemplaza el input de `usuario_id`
// crudo en Administración, Facturación y plan familiar.
//
// Modo "explorar" (S10 ronda 2): antes solo se podía buscar escribiendo
// ≥2 caracteres, aunque el backend ya soportaba listar la tabla completa
// paginada sin término de búsqueda (auditoría 2026-07-09) — el botón de
// lista abre ese modo, con paginación y filtro de rol. Filtro de plan no
// incluido: el plan vive en PocketBase, no en DIM_USUARIO (ver
// api/paquetes/seguridad/queries.py::usuarios_listado_sql).
export function UserPicker({ label, selected, onSelect, onClear }: Props) {
  const [query, setQuery]               = useState('')
  const [debouncedQ, setDebouncedQ]     = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [browsing, setBrowsing]         = useState(false)
  const [page, setPage]                 = useState(1)
  const [rolFiltro, setRolFiltro]       = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const wrapRef  = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(query), 300)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    if (selected) { setShowDropdown(false); return }
    if (browsing || debouncedQ.length >= 2) setShowDropdown(true)
    else setShowDropdown(false)
  }, [debouncedQ, selected, browsing])

  useEffect(() => { setPage(1) }, [rolFiltro, browsing])

  const modoExplorar = browsing && debouncedQ.length < 2
  const params = new URLSearchParams({ limit: String(PAGE_SIZE) })
  if (modoExplorar) {
    params.set('page', String(page))
    if (rolFiltro) params.set('rol', rolFiltro)
  } else {
    params.set('q', debouncedQ)
  }

  const searchQuery = useQuery({
    queryKey: ['shared', 'user-picker-search', modoExplorar ? 'browse' : debouncedQ, page, rolFiltro],
    queryFn:  () => apiClient.get<BuscarUsuariosResponse>(`/seguridad/usuarios/buscar?${params.toString()}`),
    enabled:  !selected && (modoExplorar || debouncedQ.length >= 2),
  })

  function select(user: UserSearchResult) {
    onSelect(user)
    setQuery(user.nombre)
    setShowDropdown(false)
    setBrowsing(false)
  }

  function clear() {
    onClear()
    setQuery('')
    setDebouncedQ('')
    setBrowsing(false)
    setRolFiltro('')
    setPage(1)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  function toggleBrowse() {
    if (selected) return
    setBrowsing((v) => {
      const next = !v
      if (next) inputRef.current?.focus()
      return next
    })
  }

  const items = searchQuery.data?.data ?? []
  const total = searchQuery.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className={styles.field}>
      <label className={styles.label}>{label}</label>
      <div className={styles.searchWrap} ref={wrapRef}>
        <input
          ref={inputRef}
          className={styles.searchInput}
          type="search"
          value={query}
          readOnly={!!selected}
          onChange={(e) => { if (!selected) { setQuery(e.target.value); setBrowsing(false) } }}
          onFocus={() => { if (!selected && (browsing || debouncedQ.length >= 2)) setShowDropdown(true) }}
          onBlur={(e) => {
            // No cerrar si el foco se movió a otro control DENTRO del mismo
            // dropdown (ej. el <select> de rol o los botones de paginación)
            // — bug real encontrado en QA (S10 ronda 2): elegir un rol
            // siempre devolvía "Sin resultados" porque el dropdown entero se
            // desmontaba a los 150ms del blur, antes de que el navegador
            // llegara a disparar el onChange del <select>. `preventDefault`
            // en su mousedown (como ya hacen los botones de paginación) no
            // es viable acá porque un <select> necesita quedarse con el foco
            // para poder abrir su propio menú nativo.
            if (wrapRef.current?.contains(e.relatedTarget as Node)) return
            setTimeout(() => setShowDropdown(false), 150)
          }}
          placeholder="Nombre o correo del usuario…"
          aria-label={label}
          aria-haspopup="listbox"
          aria-expanded={showDropdown}
        />
        {!selected && (
          <button
            type="button"
            className={browsing ? `${styles.clearBtn} ${styles.browseBtnActive}` : styles.clearBtn}
            onMouseDown={(e) => e.preventDefault()}
            onClick={toggleBrowse}
            aria-label="Ver lista completa de usuarios"
            title="Ver lista completa"
          >
            <List size={13} aria-hidden="true" />
          </button>
        )}
        {selected && (
          <button className={styles.clearBtn} onClick={clear} aria-label="Limpiar selección" type="button">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
              <line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        )}
        {showDropdown && !searchQuery.isError && (
          <div
            className={modoExplorar ? `${styles.dropdown} ${styles.dropdownWide}` : styles.dropdown}
            role="listbox"
            aria-label={`Resultados — ${label}`}
          >
            {modoExplorar && (
              <div className={styles.browseFilters}>
                <select
                  className={styles.roleSelect}
                  value={rolFiltro}
                  onMouseDown={(e) => e.stopPropagation()}
                  onChange={(e) => setRolFiltro(e.target.value)}
                  aria-label="Filtrar por rol"
                >
                  <option value="">Todos los roles</option>
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <span className={styles.dropdownMeta}>{total} usuario{total !== 1 ? 's' : ''}</span>
              </div>
            )}
            {modoExplorar && items.length > 0 && (
              <div className={`${styles.dropdownRow} ${styles.dropdownHead}`} aria-hidden="true">
                <span>Nombre</span>
                <span>Correo</span>
                <span>Rol</span>
                <span>Registro</span>
              </div>
            )}
            <ul className={styles.dropdownList}>
              {items.length === 0 && !searchQuery.isLoading && (
                <li>
                  <span className={styles.dropdownItem} style={{ cursor: 'default' }}>
                    <span className={styles.dropdownMeta}>Sin resultados</span>
                  </span>
                </li>
              )}
              {items.map((u) => (
                <li key={u.usuario_id} role="option" aria-selected={false}>
                  {modoExplorar ? (
                    <button
                      type="button"
                      className={`${styles.dropdownItem} ${styles.dropdownRow}`}
                      onMouseDown={() => select(u)}
                    >
                      <span className={styles.dropdownName}>{u.nombre}</span>
                      <span className={styles.dropdownMeta}>{u.email}</span>
                      <span className={styles.dropdownMeta}>{u.rol}</span>
                      <span className={styles.dropdownMeta}>{u.fecha_registro?.slice(0, 10) ?? '—'}</span>
                    </button>
                  ) : (
                    <button type="button" className={styles.dropdownItem} onMouseDown={() => select(u)}>
                      <span className={styles.dropdownName}>{u.nombre}</span>
                      <span className={styles.dropdownMeta}>{u.email} · {u.rol}</span>
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {modoExplorar && totalPages > 1 && (
              <div className={styles.browsePager}>
                <button
                  type="button"
                  className={styles.pagerBtn}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  ← Anterior
                </button>
                <span className={styles.dropdownMeta}>Página {page} / {totalPages}</span>
                <button
                  type="button"
                  className={styles.pagerBtn}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  Siguiente →
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
