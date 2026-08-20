import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import styles from './SidebarSection.module.css'

type Props = {
  label:     string
  icon?:     LucideIcon
  open:      boolean
  collapsed: boolean
  onToggle:  () => void
  children:  ReactNode
  // Contenido adicional dentro de la sección (ej. el submenú anidado
  // "Informes Compuestos" de SeguridadShell) que necesita más alto que el
  // resto de las secciones — sin esto, un grupo con 30 rutas hijas quedaría
  // recortado al mismo max-height que uno de 3 ítems.
  extra?: ReactNode
  tall?:  boolean
}

// Sección colapsable del nivel 2 de navegación (rediseño de navegación de
// dos niveles) — reusada por AnalyticaShell y SeguridadShell, antes cada
// shell tenía su propia copia casi idéntica de este patrón. La exclusividad
// (solo un grupo abierto) vive en el caller vía `useExclusiveAccordion`, acá
// solo se renderiza el estado que recibe.
export function SidebarSection({ label, icon: Icon, open, collapsed, onToggle, children, extra, tall }: Props) {
  // `collapsed` = sidebar entero reducido a solo iconos: no hay espacio para
  // chevron+label de sección en 64px, así que en ese modo se listan los
  // links de la sección directo, como parte de un único riel de iconos.
  const mostrarLinks = collapsed || open

  return (
    <div>
      {!collapsed && (
        <div
          className={styles.sectionHeader}
          onClick={onToggle}
          role="button"
          tabIndex={0}
          aria-expanded={open}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onToggle()
            }
          }}
        >
          <span className={styles.sectionHeaderLabel}>
            {Icon && <Icon size={14} className={styles.sectionIcon} aria-hidden="true" />}
            <span>{label}</span>
          </span>
          <span className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`} aria-hidden="true">▸</span>
        </div>
      )}
      <div
        className={[
          styles.sectionLinks,
          mostrarLinks ? (tall && !collapsed ? styles.sectionLinksTall : styles.sectionLinksOpen) : '',
        ].join(' ').trim()}
      >
        {children}
        {!collapsed && extra}
      </div>
    </div>
  )
}
