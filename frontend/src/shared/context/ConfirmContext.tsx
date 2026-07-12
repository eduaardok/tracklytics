import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import styles from './ConfirmContext.module.css'

type ConfirmOptions = {
  title?:        string
  confirmLabel?: string
  cancelLabel?:  string
  // Acción destructiva (eliminar, cancelar) — el botón de confirmar se pinta
  // en rojo en vez del color primario, mismo criterio que `.btnDanger` ya
  // usado en el resto del proyecto (ej. PlanesPage).
  danger?:       boolean
}

type ConfirmFn = (message: string, options?: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

type PendingConfirm = { message: string; options: ConfirmOptions; resolve: (v: boolean) => void }

// Reemplaza `window.confirm()` (el diálogo nativo del navegador, imposible de
// estilizar y visualmente ajeno al resto de la app) por un modal propio con
// la misma API async — `await confirm('¿Seguro?')` sigue devolviendo un
// booleano, ahora resuelto por una Promise en vez de bloquear el hilo
// principal. Un solo `ConfirmProvider` montado en `app/providers/index.tsx`,
// mismo patrón que `ToastProvider`.
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null)
  const cancelBtnRef = useRef<HTMLButtonElement>(null)

  const confirm = useCallback<ConfirmFn>((message, options = {}) => {
    return new Promise<boolean>((resolve) => {
      setPending({ message, options, resolve })
    })
  }, [])

  function settle(result: boolean) {
    pending?.resolve(result)
    setPending(null)
  }

  useEffect(() => {
    if (!pending) return
    cancelBtnRef.current?.focus()
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') settle(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && createPortal(
        <div className={styles.backdrop} onMouseDown={() => settle(false)}>
          <div
            className={styles.dialog}
            role="alertdialog"
            aria-modal="true"
            aria-label={pending.options.title ?? 'Confirmar acción'}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {pending.options.title && <p className={styles.title}>{pending.options.title}</p>}
            <p className={styles.message}>{pending.message}</p>
            <div className={styles.actions}>
              <button ref={cancelBtnRef} type="button" className={styles.cancelBtn} onClick={() => settle(false)}>
                {pending.options.cancelLabel ?? 'Cancelar'}
              </button>
              <button
                type="button"
                className={pending.options.danger ? styles.confirmBtnDanger : styles.confirmBtn}
                onClick={() => settle(true)}
              >
                {pending.options.confirmLabel ?? 'Confirmar'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </ConfirmContext.Provider>
  )
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm() debe usarse dentro de <ConfirmProvider>')
  return ctx
}
