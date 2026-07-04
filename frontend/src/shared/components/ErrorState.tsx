import type { CSSProperties, ReactNode } from 'react'
import styles from './ErrorState.module.css'

type Props = {
  message: ReactNode
  title?: string
  // Compacto: sin caja/borde, solo texto en línea — para contextos angostos
  // (una fila de tabla/lista) donde el box completo no cabe o rompe el layout.
  compact?: boolean
  // Passthrough para ajustes de espaciado puntuales por contexto (varios
  // call-sites necesitaban un margin distinto al insertar el banner entre
  // otros elementos) — no para cambiar el estilo visual del box en sí.
  style?: CSSProperties
}

// Patrón único de error para toda la app (red/500, 403 con `detail` real del
// backend, 404) — antes cada paquete tenía su propia caja casi idéntica
// (`.errorBox`, `.bannerError`, `.errorText`, incluso `.blocked` reusado para
// esto en `catalogo`), mismos tokens de color pero 4 nombres de clase
// distintos. `role="alert"` siempre, para que un lector de pantalla anuncie
// el error sin que el componente que lo usa tenga que acordarse.
export function ErrorState({ message, title, compact = false, style }: Props) {
  if (compact) {
    return (
      <p className={styles.compact} role="alert" style={style}>
        {message}
      </p>
    )
  }

  return (
    <div className={styles.box} role="alert" style={style}>
      {title && <p className={styles.title}>{title}</p>}
      <p className={styles.body}>{message}</p>
    </div>
  )
}
