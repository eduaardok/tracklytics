import { Sun, Moon } from 'lucide-react'
import { useTheme } from '@shared/context/ThemeContext'
import styles from './ThemeToggle.module.css'

// Toggle light/dark — icono único que representa el tema al que se cambiaría
// (sol visible en dark = "pasar a light", luna visible en light = "pasar a
// dark"), mismo lenguaje que UserMenu/NotificationBell: botón icon-only de
// 36px en el header.
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const next = theme === 'light' ? 'oscuro' : 'claro'

  return (
    <button
      type="button"
      className={styles.toggle}
      onClick={toggleTheme}
      aria-label={`Cambiar a tema ${next}`}
      title={`Cambiar a tema ${next}`}
    >
      {theme === 'light' ? <Moon size={18} aria-hidden="true" /> : <Sun size={18} aria-hidden="true" />}
    </button>
  )
}
