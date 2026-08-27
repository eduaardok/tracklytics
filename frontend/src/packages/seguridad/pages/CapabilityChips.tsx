import styles from './CapabilityChips.module.css'

// Nombres legibles de las `capabilities` (nombres de paquete en snake_case,
// ej. "facturacion", "regalias") que trae DIM_ROL_ADMINISTRATIVO — sin esto
// las tarjetas/paneles de rol mostrarían literales de backend en vez de las
// áreas que un admin realmente reconoce. `*` (solo en `superadmin`) no es una
// capability real de ningún paquete, es el catálogo cerrado marcando "todas".
//
// Compartido por AdminHomePage (tarjetas de rol, S17 Task 1) y
// UsuariosAdminPage (qué cubre el rol antes de asignar, S17 Task 2) — un solo
// mapeo en vez de duplicarlo en las dos páginas.
export const CAPABILITY_LABELS: Record<string, string> = {
  '*':             'Todas las áreas',
  suscripciones:   'Suscripciones',
  partners:        'Partners',
  social:          'Social',
  experiencia:     'Experiencia de usuario',
  creadores:       'Creadores',
  distribucion:    'Distribución',
  catalogo:        'Catálogo',
  gestion_datos:   'Gestión de datos',
  analitica:       'Analítica',
  facturacion:     'Facturación',
  finanzas:        'Finanzas',
  regalias:        'Regalías',
  publicidad:      'Publicidad',
}

function capabilityLabel(cap: string): string {
  return CAPABILITY_LABELS[cap] ?? cap.replace(/_/g, ' ')
}

export function CapabilityChips({ capabilities }: { capabilities: string[] }) {
  if (capabilities.length === 0) {
    return <span className={styles.miniMuted}>Sin áreas asignadas.</span>
  }
  return (
    <div className={styles.chipRow}>
      {capabilities.map((cap) => (
        <span key={cap} className={styles.capChip}>{capabilityLabel(cap)}</span>
      ))}
    </div>
  )
}
