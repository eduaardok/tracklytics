import type { ReactNode } from 'react'
import styles from './MobileSidebarOverlay.module.css'

type Props = {
  open: boolean
  onClose: () => void
  children: ReactNode
}

// Overlay a pantalla completa para el sidebar de AnalyticaShell/SeguridadShell
// bajo 768px — a diferencia de MobileNavDrawer (panel lateral de 280px para
// el nav plano de AppShell), estos dos shells tienen grupos colapsables con
// hasta 30 rutas (SeguridadShell), que no caben en un panel angosto sin
// scroll anidado. No sabe nada de navegación: el shell que lo usa le pasa su
// propio <nav> de sidebar ya armado (mismo gating por rol que en escritorio).
// Escape y el bloqueo de scroll del body quedan a cargo del shell (mismo
// patrón que AppShell hace con MobileNavDrawer).
export function MobileSidebarOverlay({ open, onClose, children }: Props) {
  if (!open) return null

  return (
    <div className={styles.overlay}>
      <button type="button" className={styles.backdrop} aria-label="Cerrar navegación" onClick={onClose} />
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <span className={styles.panelTitle}>Menú</span>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Cerrar navegación">
            ✕
          </button>
        </div>
        <div className={styles.panelBody}>
          {children}
        </div>
      </div>
    </div>
  )
}
