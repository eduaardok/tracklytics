import { Link } from 'react-router-dom'
import { ArrowLeft, BarChart3, ShieldCheck } from 'lucide-react'
import styles from './ZoneSwitcher.module.css'

type Zone = 'analitica' | 'administracion'

const ZONE_META: Record<Zone, { label: string; icon: typeof BarChart3 }> = {
  analitica:      { label: 'Analítica',      icon: BarChart3 },
  administracion: { label: 'Administración', icon: ShieldCheck },
}

type Props = { zone: Zone }

// `AnalyticaShell`/`SeguridadShell` son shells hermanos e independientes del
// shell de consumo (`AppShell`, ver router.tsx) — antes la única salida era el
// wordmark del header, un `<a href="/">` con recarga completa de página, sin
// indicar en qué zona estaba el usuario (hallazgo de diseño, iteración UI).
// Este componente es el único lugar que resuelve "dónde estoy / cómo vuelvo"
// para ambos shells — no una copia por shell.
export function ZoneSwitcher({ zone }: Props) {
  const meta = ZONE_META[zone]
  const Icon = meta.icon

  return (
    <div className={styles.switcher}>
      <Link to="/" className={styles.backLink}>
        <ArrowLeft size={15} aria-hidden="true" />
        <span>Volver al catálogo</span>
      </Link>
      <span className={styles.sep} aria-hidden="true" />
      <span className={styles.zoneLabel}>
        <Icon size={14} aria-hidden="true" />
        {meta.label}
      </span>
    </div>
  )
}
