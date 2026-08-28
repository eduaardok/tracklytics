import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { FormMetodoPago } from './FormMetodoPago'
import styles from './PaymentMethodModal.module.css'

type Props = {
  isOpen:  boolean
  onClose: () => void
  // Se dispara con el `metodo_pago_id` recién creado — el llamador decide
  // qué hacer después (seleccionarlo, continuar el pago automáticamente).
  onRegistrado: (metodoPagoId: string) => void
  title?:    string
  subtitle?: string
}

// Emergente grande para registrar un método de pago (S17, feedback directo:
// "el actual registro de método de pago no me gusta" sobre el formulario
// enterrado al fondo de PlanesPage) — mismo `FormMetodoPago` de siempre
// (mismo rigor: Luhn, expiración, CVV, dirección fiscal), ahora como el
// primer paso protagonista en vez de una sección más de una página larga.
// Mismo lenguaje visual que CrudModal (shared/components) pero sin su fila
// fija de acciones: el formulario ya trae su propio submit.
export function PaymentMethodModal({ isOpen, onClose, onRegistrado, title = 'Agrega un método de pago', subtitle }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab' || !panelRef.current) return
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    const firstFocusable = panelRef.current?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )
    firstFocusable?.focus()

    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className={styles.backdrop} onMouseDown={onClose}>
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <div>
            <p className={styles.title}>{title}</p>
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Cerrar">
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <FormMetodoPago onRegistrado={onRegistrado} />
      </div>
    </div>
  )
}
