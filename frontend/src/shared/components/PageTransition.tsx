import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import styles from './PageTransition.module.css'

// Transición sutil entre rutas (S14-FINAL) — CSS puro, sin librería de
// animación. `framer-motion` se probó primero pero costaba +43kB gzip en el
// bundle principal (AppShell es eager, no se puede lazy-cargar la
// transición del propio shell) solo para un fade de 200ms — mismo patrón de
// regresión que este proyecto ya revirtió antes con barrels/html2canvas (ver
// comentarios en router.tsx y ExportPDFButton.tsx). `key={pathname}` fuerza
// el remount en cada cambio de ruta, que es lo que dispara la animación de
// entrada declarada en el CSS (`@keyframes` en PageTransition.module.css).
export function PageTransition({ children }: { children: ReactNode }) {
  const location = useLocation()
  return (
    <div key={location.pathname} className={styles.enter}>
      {children}
    </div>
  )
}
