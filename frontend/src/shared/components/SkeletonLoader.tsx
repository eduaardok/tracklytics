import styles from './SkeletonLoader.module.css'

type Props = {
  // Cuántas barras pulsantes renderizar (S13 polish visual): reemplaza el
  // texto "// cargando…" plano usado hasta ahora en RouteLoadingFallback y en
  // filas <tr><td>Cargando…</td></tr> de las tablas admin.
  count?:     number
  height?:    number
  className?: string
}

// Bloque de barras pulsantes reutilizable — mismo patrón de animación
// (`skelPulse`) ya validado en CatalogPage, ahora extraído a un componente
// compartido para no reescribirlo por página.
export function SkeletonLoader({ count = 3, height = 14, className = '' }: Props) {
  return (
    <div className={`${styles.wrap} ${className}`} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className={styles.bar}
          style={{ height, width: `${100 - (i % 3) * 12}%`, animationDelay: `${(i % 4) * 0.12}s` }}
        />
      ))}
    </div>
  )
}

type RowsProps = {
  columns: number
  rows?:   number
}

// Variante para `<tbody>`: reemplaza `<tr><td colSpan={n}>Cargando…</td></tr>`
// en las tablas admin (AuditoriaPage, UsuariosAdminPage, ReporteUsuariosPage,
// StrikesGlobalPage, ErroresPage, PermisosPage).
export function SkeletonTableRows({ columns, rows = 5 }: RowsProps) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className={styles.skeletonRow} aria-hidden="true">
          {Array.from({ length: columns }).map((_, c) => (
            <td key={c}>
              <span
                className={styles.bar}
                style={{ height: 12, width: `${70 - (c % 3) * 14}%`, animationDelay: `${(r % 4) * 0.12}s` }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}
