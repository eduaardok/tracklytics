import { useEffect, useRef, type ReactNode } from 'react'
import styles from './CrudModal.module.css'

export type CrudModalMode = 'create' | 'edit' | 'view' | 'delete'

type Props = {
  isOpen:       boolean
  onClose:      () => void
  title:        string
  mode:         CrudModalMode
  onConfirm:    () => void
  confirmLabel?: string
  cancelLabel?:  string
  loading?:      boolean
  // Mensaje de error de la mutación en curso (S16 — auditoría de revisores):
  // antes `CrudModal` no sabía nada de errores, así que un 422/401 de crear/
  // editar solo se veía en el toast global — el modal se quedaba abierto sin
  // ninguna señal visual de qué falló. Opcional: los llamadores que ya pasan
  // `apiErrorMessage(mutation.error, fallback)` acá lo mejoran gratis, el
  // resto sigue funcionando igual que antes.
  error?:        string | null
  children:      ReactNode
  // S17 (formularios densos, ej. campaña de Publicidad ~7 campos): opcional,
  // NO cambia el contrato para llamadores existentes. En `wide`, el modal
  // pasa de 440px a 640px y el fieldset habilita un grid de 2 columnas para
  // campos cortos (fecha, número, select de una palabra) — un campo que deba
  // ocupar todo el ancho (textarea, texto largo) usa `.wide` en su propio
  // wrapper (ver `CrudModal.Section`/uso directo de `gridColumn: '1 / -1'`).
  wide?:         boolean
}

// Base compartida de todo el CRUD administrativo (S13-P2) — antes cada
// entidad (campañas, contratos de regalía, suscripciones, denuncias…)
// reimplementaba su propio `.modalBackdrop`/`.modal`/`.modalActions` en su
// propio `.module.css`, con el mismo shell repetido 6 veces. Este componente
// NUNCA conoce los campos de ninguna entidad — `children` es 100% del
// llamador; lo único que `CrudModal` decide por `mode` es el fieldset
// readonly (`view`), el tono del botón de confirmar (`delete` → rojo) y qué
// botones mostrar.
export function CrudModal({
  isOpen, onClose, title, mode, onConfirm, confirmLabel, cancelLabel = 'Cancelar', loading = false, error, children, wide = false,
}: Props) {
  const modalRef = useRef<HTMLDivElement>(null)

  // Escape para cerrar + focus trap — mismo criterio que MobileNavDrawer
  // (shared/components), consolidado acá porque ahora hay 3+ modales CRUD
  // que lo necesitan (antes ninguno lo tenía).
  useEffect(() => {
    if (!isOpen) return

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab' || !modalRef.current) return
      const focusables = modalRef.current.querySelectorAll<HTMLElement>(
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
    // Foco inicial dentro del modal — sin esto, el foco de teclado queda
    // huérfano en el elemento que abrió el modal, detrás del backdrop.
    const firstFocusable = modalRef.current?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )
    firstFocusable?.focus()

    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const isView   = mode === 'view'
  const isDelete = mode === 'delete'
  const defaultConfirmLabel = isDelete ? 'Confirmar' : mode === 'create' ? 'Crear' : 'Guardar cambios'

  return (
    <div className={styles.backdrop} onMouseDown={onClose}>
      <div
        ref={modalRef}
        className={`${styles.modal} ${wide ? styles.modalWide : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <p className={styles.title}>{title}</p>

        {/* `disabled` en un <fieldset> deshabilita TODOS los controles internos
            de un solo golpe — así "Ver detalle" queda readonly sin que cada
            página tenga que marcar cada input individualmente. */}
        <fieldset className={`${styles.body} ${wide ? styles.bodyWide : ''}`} disabled={isView} aria-disabled={isView}>
          {children}
        </fieldset>

        {error && <p className={styles.errorText} role="alert">{error}</p>}

        <div className={styles.actions}>
          <button type="button" className={styles.btnGhost} onClick={onClose}>
            {isView ? 'Cerrar' : cancelLabel}
          </button>
          {!isView && (
            <button
              type="button"
              className={isDelete ? styles.btnDanger : styles.btnPrimary}
              onClick={onConfirm}
              disabled={loading}
            >
              {loading ? 'Procesando…' : (confirmLabel ?? defaultConfirmLabel)}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// Agrupación opcional de campos dentro de un `CrudModal` `wide` (S17) — un
// encabezado de sección + sus campos como `children`. `CrudModal` sigue sin
// conocer los campos: esto es puro wrapper visual que el llamador arma en su
// propio `children`, igual que ya hacía con divs sueltos. En `wide`, una
// sección ocupa las 2 columnas del grid (`grid-column: 1 / -1`) y sus campos
// internos vuelven a su propio grid de 2 columnas.
export function CrudModalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={styles.section}>
      <p className={styles.sectionTitle}>{title}</p>
      <div className={styles.sectionGrid}>{children}</div>
    </div>
  )
}

// Nota: se exporta como `CrudModalSection` (named export) en vez de
// `CrudModal.Section` — adjuntar un miembro estático a una function
// declaration rompe su tipo inferido para TS; un named export es igual de
// simple de importar (`import { CrudModal, CrudModalSection } from ...`).
