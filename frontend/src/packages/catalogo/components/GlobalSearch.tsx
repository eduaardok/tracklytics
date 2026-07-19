import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'

import styles from './GlobalSearch.module.css'

/**
 * Barra de búsqueda global del header B2C (change p2-descubrimiento-comunidad).
 *
 * Solo captura el término y navega a `/buscar?q=…`: los resultados los resuelve
 * y renderiza `SearchResultsPage`. Mantenerla "tonta" evita que el header tenga
 * que conocer los cuatro tipos de entidad y permite compartir la búsqueda por
 * URL, que es lo que la gente espera de un buscador.
 */
export function GlobalSearch() {
  const [term, setTerm] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  // Atajo "/" para enfocar la búsqueda, ignorado mientras se escribe en otro
  // campo para no secuestrar la tecla dentro de un formulario.
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

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const q = term.trim()
    if (!q) return
    navigate(`/buscar?q=${encodeURIComponent(q)}`)
  }

  return (
    <form className={styles.wrap} role="search" onSubmit={submit}>
      <Search size={15} className={styles.icon} aria-hidden="true" />
      <input
        ref={inputRef}
        type="search"
        className={styles.input}
        placeholder="Buscar canciones, artistas, álbumes…"
        aria-label="Buscar en el catálogo"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
      />
    </form>
  )
}
