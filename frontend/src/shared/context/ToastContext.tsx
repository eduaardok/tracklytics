import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, X, AlertCircle } from 'lucide-react'
import styles from './ToastContext.module.css'

type ToastType = 'success' | 'error'
type ToastItem = { id: number; type: ToastType; message: string }

type ToastContextValue = {
  success: (message: string) => void
  error: (message: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const AUTO_DISMISS_MS = 4500

// Sistema de toasts centralizado (S10 ronda 2, punto 4): antes cada página
// que quería feedback visual manejaba su propio estado local de éxito/error
// (o no mostraba nada) — un solo provider global montado una vez en
// `Providers` (app/providers/index.tsx), consumido vía `useToast()` desde
// cualquier `useMutation` del proyecto.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(1)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const push = useCallback((type: ToastType, message: string) => {
    const id = nextId.current++
    setToasts((prev) => [...prev, { id, type, message }])
    timers.current.set(id, setTimeout(() => dismiss(id), AUTO_DISMISS_MS))
  }, [dismiss])

  const value: ToastContextValue = {
    success: (message) => push('success', message),
    error:   (message) => push('error', message),
  }

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div className={styles.stack} role="status" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={t.type === 'success' ? styles.toastSuccess : styles.toastError}>
              {t.type === 'success'
                ? <Check size={16} className={styles.icon} aria-hidden="true" />
                : <AlertCircle size={16} className={styles.icon} aria-hidden="true" />}
              <span className={styles.message}>{t.message}</span>
              <button type="button" className={styles.closeBtn} onClick={() => dismiss(t.id)} aria-label="Cerrar aviso">
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast() debe usarse dentro de <ToastProvider>')
  return ctx
}
