import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import styles from './AreaSwitcher.module.css'

type Props = {
  areas: string[]
  selected: string | null
  onSelect: (area: string | null) => void
}

export function AreaSwitcher({ areas, selected, onSelect }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const displayLabel = selected ?? 'Ver todo'

  return (
    <div className={styles.switcher} ref={rootRef}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Cambiar área visible"
      >
        <span className={styles.areaLabel}>{displayLabel}</span>
        <ChevronDown size={12} className={open ? styles.chevronOpen : styles.chevron} aria-hidden="true" />
      </button>

      {open && (
        <div className={styles.menu} role="menu" aria-label="Seleccionar área">
          <button
            type="button"
            className={`${styles.menuItem} ${selected === null ? styles.menuItemCurrent : ''}`}
            role="menuitem"
            onClick={() => { onSelect(null); setOpen(false) }}
          >
            Ver todo
          </button>
          {areas.map((area) => (
            <button
              key={area}
              type="button"
              className={`${styles.menuItem} ${selected === area ? styles.menuItemCurrent : ''}`}
              role="menuitem"
              onClick={() => { onSelect(area); setOpen(false) }}
            >
              {area}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
