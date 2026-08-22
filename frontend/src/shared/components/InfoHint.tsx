import { Info } from 'lucide-react'
import styles from './InfoHint.module.css'

// Badge "ⓘ" con tooltip al hover/foco — explica la métrica sin ocupar lugar
// en la card. Nació en TrackDetailPage (feedback: Score/Tempo/Loudness no se
// explicaban solos) y se promovió a shared para aplicar el mismo patrón
// donde aparezcan atributos técnicos en inglés: etiqueta "Español (English)"
// + este ícono con la descripción.
export function InfoHint({ text }: { text: string }) {
  return (
    <span className={styles.infoHint} tabIndex={0} aria-label={text}>
      <Info size={12} aria-hidden="true" />
      <span className={styles.infoTooltip} role="tooltip">{text}</span>
    </span>
  )
}
