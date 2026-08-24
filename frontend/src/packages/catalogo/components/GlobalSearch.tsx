import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'

import { catalogoApi } from '../api/catalogo.api'
import type { SearchAllResultado } from '../types'
import styles from './GlobalSearch.module.css'

/**
 * Barra de búsqueda global del header B2C (change p2-descubrimiento-comunidad).
 *
 * S16-P10 (brecha P2 "search-all unificado"): agrega sugerencias as-you-type —
 * reutiliza el MISMO endpoint `/search` con `limit` chico y debounce de 250ms,
 * sin backend nuevo. Submit (Enter) sigue navegando a `/buscar?q=…` donde
 * `SearchResultsPage` resuelve la vista completa: el dropdown es un atajo, no
 * un segundo buscador.
 */

type ItemSugerencia = {
  key: string
  label: string
  meta?: string
  to: string
}

function itemsDe(data: SearchAllResultado | undefined): ItemSugerencia[] {
  if (!data) return []
  const items: ItemSugerencia[] = []
  for (const t of data.tracks.slice(0, 4)) {
    items.push({
      key: `t-${t.fact_id}`,
      label: t.track_name,
      meta: t.artist_name,
      to: `/catalogo/track/${t.fact_id}`,
    })
  }
  for (const a of data.artistas.slice(0, 2)) {
    items.push({ key: `a-${a.artist_id}`, label: a.name, meta: 'Artista', to: `/catalogo/artista/${a.artist_id}` })
  }
  for (const al of data.albumes.slice(0, 2)) {
    items.push({
      key: `al-${al.album_id}`,
      label: al.name,
      meta: al.artist_name,
      to: `/catalogo/album/${al.album_id}`,
    })
  }
  for (const p of data.playlists.slice(0, 1)) {
    // Sin ruta de detalle de playlist todavía: la biblioteca es su hogar.
    items.push({ key: `p-${p.playlist_id}`, label: p.name, meta: 'Playlist', to: '/biblioteca' })
  }
  return items
}

export function GlobalSearch() {
  const [term, setTerm] = useState('')
  const [abierta, setAbierta] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  // Debounce real del término para no disparar la query por cada tecla.
  const q = useDebounced(term.trim(), 250)
  const sugerencias = useQuery({
    queryKey: ['catalogo', 'search-suggest', q],
    queryFn: () => catalogoApi.searchAll(q, 4),
    enabled: q.length >= 2,
    staleTime: 30_000,
  })
  const lista = itemsDe(sugerencias.data)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== '/') return
      const t = e.target as HTMLElement | null
      const tag = t?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || t?.isContentEditable) return
      e.preventDefault()
      inputRef.current?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!abierta) return
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setAbierta(false)
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setAbierta(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [abierta])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const actual = term.trim()
    if (!actual) return
    setAbierta(false)
    navigate(`/buscar?q=${encodeURIComponent(actual)}`)
  }

  function ir(item: ItemSugerencia) {
    setAbierta(false)
    setTerm('')
    navigate(item.to)
  }

  const mostrar = abierta && q.length >= 2 && (sugerencias.isFetching || lista.length > 0)

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <form className={styles.form} role="search" onSubmit={submit}>
        <Search size={15} className={styles.icon} aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          className={styles.input}
          placeholder="Buscar canciones, artistas, álbumes…"
          aria-label="Buscar en el catálogo"
          aria-expanded={mostrar}
          aria-controls="search-suggest-list"
          role="combobox"
          autoComplete="off"
          value={term}
          onChange={(e) => {
            setTerm(e.target.value)
            setAbierta(true)
          }}
          onFocus={() => setAbierta(true)}
        />
      </form>
      {mostrar && (
        <ul id="search-suggest-list" className={styles.suggest} role="listbox" aria-label="Sugerencias">
          {lista.length === 0 && <li className={styles.suggestHint}>Buscando…</li>}
          {lista.map((item) => (
            <li key={item.key} role="option" aria-selected="false">
              <button type="button" className={styles.suggestItem} onMouseDown={() => ir(item)}>
                <span className={styles.suggestLabel}>{item.label}</span>
                {item.meta && <span className={styles.suggestMeta}>{item.meta}</span>}
              </button>
            </li>
          ))}
          <li className={styles.suggestHint}>
            <button
              type="button"
              className={styles.verTodoBtn}
              onMouseDown={() => {
                setAbierta(false)
                navigate(`/buscar?q=${encodeURIComponent(q)}`)
              }}
            >
              Ver todos los resultados de "{q}"
            </button>
          </li>
        </ul>
      )}
    </div>
  )
}

function useDebounced(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(t)
  }, [value, delayMs])
  return debounced
}
