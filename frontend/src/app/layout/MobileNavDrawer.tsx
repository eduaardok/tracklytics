import { NavLink } from 'react-router-dom'
import type { NavItem as Item } from './AppShell'
import styles from './MobileNavDrawer.module.css'

type Props = {
  open: boolean
  onClose: () => void
  primary: Item[]
  secondary: Item[]
  // Mismo criterio que `.mainWithPlayer`/`.sidebarWithPlayer` en AppShell: el
  // PlayerBar es `position: fixed` y puede tapar el último ítem del panel.
  reservePlayerSpace: boolean
}

// Reemplazo real del nav bajo 768px (ver breakpoint unificado en
// AppShell.module.css) — antes el nav horizontal simplemente desaparecía sin
// alternativa en mobile. Drawer con hamburguesa elegido sobre bottom tabs:
// con 8 ítems de nav, una barra inferior quedaría apretada o necesitaría su
// propio scroll horizontal (mismo problema que ya se resolvió sacando el nav
// del header); un panel deslizante con scroll vertical escala mejor a esa
// cantidad de ítems y reutiliza el mismo patrón de click-outside-to-close que
// NavMoreMenu/AddToPlaylistMenu ya usan en el resto de la app.
export function MobileNavDrawer({ open, onClose, primary, secondary, reservePlayerSpace }: Props) {
  if (!open) return null

  return (
    <div className={styles.overlay}>
      <button type="button" className={styles.backdrop} aria-label="Cerrar navegación" onClick={onClose} />
      <nav
        className={`${styles.panel} ${reservePlayerSpace ? styles.panelWithPlayer : ''}`}
        aria-label="Navegación principal (móvil)"
      >
        <div className={styles.panelHeader}>
          <span className={styles.panelTitle}>Menú</span>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Cerrar navegación">
            ✕
          </button>
        </div>

        {primary.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onClose}
            className={({ isActive }) => (isActive ? `${styles.navItem} ${styles.navActive}` : styles.navItem)}
          >
            <item.icon className={styles.navIcon} size={18} aria-hidden="true" />
            {item.label}
          </NavLink>
        ))}

        <div className={styles.divider} role="separator" />

        {secondary.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onClose}
            className={({ isActive }) => (isActive ? `${styles.navItem} ${styles.navActive}` : styles.navItem)}
          >
            <item.icon className={styles.navIcon} size={18} aria-hidden="true" />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
