import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import type { NavItem } from './AppShell'
import styles from './TopNavMore.module.css'

type Props = {
  /** Grupo transaccional/ocasional (Facturación, Social, …). */
  secondary: NavItem[]
  /** Grupo admin ("Analítica"/"Administración") — separado por un divisor
      cuando existe, mismo criterio de jerarquía que tenía el sidebar. */
  admin?: NavItem[]
}

// Menú "Más" del top-nav B2C: hereda el patrón click-outside + Escape que ya
// usan AddToPlaylistMenu/MobileNavDrawer en el resto de la app. El estado
// activo del trigger replica la regla del sistema (DESIGN.md §5): color, no
// pill — si alguna ruta interna está activa, el botón se tiñe Violet Light.
export function TopNavMore({ secondary, admin }: Props) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const location = useLocation()

  useEffect(() => { setOpen(false) }, [location.pathname])

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const isActive = (item: NavItem) =>
    location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)

  // Alguna ruta interna del menú es la actual → el trigger se tiñe Violet
  // Light, para que "Social" activo dentro de "Más" no deje al usuario sin
  // señal de dónde está.
  const hayActiva = secondary.some(isActive) || (admin?.some(isActive) ?? false)

  // El grupo secundario nunca está vacío para un usuario autenticado normal,
  // pero un `role==='admin'` pierde Facturación/Mi Plan del primario sin tocar
  // este array — el guard es solo para no renderizar un trigger huérfano.
  if (secondary.length === 0 && (admin?.length ?? 0) === 0) return null

  const triggerCls = [
    styles.btn,
    open ? styles.btnOpen : '',
    !open && hayActiva ? styles.btnActive : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={triggerCls}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        Más
        <ChevronDown size={14} aria-hidden="true" className={styles.chevron} />
      </button>

      {open && (
        <div className={styles.menu} role="menu">
          {secondary.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              role="menuitem"
              className={isActive(item) ? `${styles.item} ${styles.itemActive}` : styles.item}
            >
              <item.icon size={16} className={styles.itemIcon} aria-hidden="true" />
              {item.label}
            </NavLink>
          ))}

          {(admin?.length ?? 0) > 0 && (
            <>
              <div className={styles.divider} role="separator" />
              {admin!.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  role="menuitem"
                  className={isActive(item) ? `${styles.item} ${styles.itemActive}` : styles.item}
                >
                  <item.icon size={16} className={styles.itemIcon} aria-hidden="true" />
                  {item.label}
                </NavLink>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
